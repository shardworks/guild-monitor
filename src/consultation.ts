/**
 * Consultation tab — chat-like interface for consulting guild animas by role.
 *
 * Conversations are managed by the core conversation API (createConversation,
 * takeTurn, endConversation). This module provides only the page renderer
 * and the role-listing helper. All conversation state is persistent in the
 * guild database — no in-memory state is held here.
 */

import {
  readGuildConfig,
  listAnimas,
} from "@shardworks/nexus-core";
import { renderTopNav, renderHeader } from "./clockworks.js";

// ---------------------------------------------------------------------------
// Public API for server routes
// ---------------------------------------------------------------------------

/**
 * Return roles that have at least one active anima, suitable for the
 * role selector dropdown.
 */
export function getConsultableRoles(home: string): Array<{ role: string; animaName: string }> {
  const config = readGuildConfig(home);
  const roleNames = Object.keys(config.roles);
  const animas = listAnimas(home, { status: "active" });
  const results: Array<{ role: string; animaName: string }> = [];

  for (const roleName of roleNames) {
    // Find the first active anima holding this role
    const match = animas.find((a) => a.roles.includes(roleName));
    if (match) {
      results.push({ role: roleName, animaName: match.name });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Page renderer
// ---------------------------------------------------------------------------

/**
 * Render the Consultation page HTML — role selector + chat interface.
 */
export function renderConsultationPage(
  guildName: string,
  nexus: string,
  model: string,
  clockRunning: boolean,
  roles: Array<{ role: string; animaName: string }>,
): string {
  const roleOptions = roles.length > 0
    ? roles.map((r) =>
        `<option value="${esc(r.role)}">${esc(r.role)} (${esc(r.animaName)})</option>`
      ).join("")
    : `<option value="" disabled>No consultable roles available</option>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(guildName)} — Consultation</title>
  <style>${CSS}</style>
</head>
<body>
  ${renderHeader(guildName, nexus, model, clockRunning)}
  ${renderTopNav("consultation")}
  <main>
    <section id="consultation">
      <div class="consult-controls">
        <div class="role-selector">
          <label for="role-select">Consult with:</label>
          <select id="role-select">
            <option value="">Select a role&hellip;</option>
            ${roleOptions}
          </select>
          <button id="start-btn" class="btn btn-start" disabled>Start Consultation</button>
        </div>
        <div id="active-label" class="active-label hidden"></div>
      </div>

      <div id="chat-area" class="chat-area">
        <div id="messages" class="messages">
          <div class="empty-state">
            <p>Select a role above and start a consultation to begin chatting with a guild member.</p>
          </div>
        </div>
        <div id="input-area" class="input-area hidden">
          <textarea id="message-input" rows="3"
            placeholder="Type your message&hellip;"
            disabled></textarea>
          <button id="send-btn" class="btn btn-send" disabled>Send</button>
        </div>
      </div>
    </section>
  </main>
  <footer>
    <p>Guild Monitor &middot; Refreshed at ${new Date().toLocaleTimeString()}</p>
  </footer>
  <script>${CLIENT_JS}</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape HTML special characters. */
function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Client-side JavaScript
// ---------------------------------------------------------------------------

const CLIENT_JS = `
(function() {
  "use strict";

  // --- State ---

  var conversationId = null;
  var participantId = null;
  var busy = false;

  // --- DOM refs ---

  var roleSelect = document.getElementById("role-select");
  var startBtn = document.getElementById("start-btn");
  var activeLabel = document.getElementById("active-label");
  var messagesEl = document.getElementById("messages");
  var inputArea = document.getElementById("input-area");
  var messageInput = document.getElementById("message-input");
  var sendBtn = document.getElementById("send-btn");

  // --- Helpers ---

  function esc(str) {
    var d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function setBusy(isBusy) {
    busy = isBusy;
    messageInput.disabled = isBusy;
    sendBtn.disabled = isBusy;
    if (isBusy) {
      sendBtn.textContent = "Waiting\\u2026";
      sendBtn.classList.add("btn-busy");
    } else {
      sendBtn.textContent = "Send";
      sendBtn.classList.remove("btn-busy");
      messageInput.focus();
    }
  }

  function addMessage(role, content) {
    // Remove empty state if present
    var empty = messagesEl.querySelector(".empty-state");
    if (empty) empty.remove();

    var div = document.createElement("div");
    div.className = "message message-" + role;

    var label = document.createElement("div");
    label.className = "message-label";
    label.textContent = role === "user" ? "You" : activeLabel.dataset.animaName || "Anima";

    var body = document.createElement("div");
    body.className = "message-body";
    body.innerHTML = formatContent(content);

    div.appendChild(label);
    div.appendChild(body);
    messagesEl.appendChild(div);

    // Scroll to bottom
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addThinking() {
    var div = document.createElement("div");
    div.className = "message message-assistant thinking";
    div.id = "thinking-indicator";

    var label = document.createElement("div");
    label.className = "message-label";
    label.textContent = activeLabel.dataset.animaName || "Anima";

    var body = document.createElement("div");
    body.className = "message-body";
    body.innerHTML = '<span class="thinking-dots">Thinking<span>.</span><span>.</span><span>.</span></span>';

    div.appendChild(label);
    div.appendChild(body);
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function removeThinking() {
    var el = document.getElementById("thinking-indicator");
    if (el) el.remove();
  }

  function addError(message) {
    var div = document.createElement("div");
    div.className = "message message-error";
    div.innerHTML = '<div class="message-body">' + esc(message) + '</div>';
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  /** Simple content formatter — converts newlines to <br> and wraps code blocks. */
  function formatContent(text) {
    // Escape HTML first
    var escaped = esc(text);
    // Convert markdown-style code blocks
    escaped = escaped.replace(/\`\`\`([\\s\\S]*?)\`\`\`/g, function(_, code) {
      return '<pre class="code-block">' + code.trim() + '</pre>';
    });
    // Convert inline code
    escaped = escaped.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
    // Convert newlines to <br> (but not inside pre blocks)
    var parts = escaped.split(/<pre[^>]*>[\\s\\S]*?<\\/pre>/g);
    var pres = escaped.match(/<pre[^>]*>[\\s\\S]*?<\\/pre>/g) || [];
    var result = "";
    for (var i = 0; i < parts.length; i++) {
      result += parts[i].replace(/\\n/g, "<br>");
      if (i < pres.length) result += pres[i];
    }
    return result;
  }

  // --- Role selection ---

  roleSelect.addEventListener("change", function() {
    startBtn.disabled = !roleSelect.value;
  });

  // --- Start consultation ---

  startBtn.addEventListener("click", function() {
    var role = roleSelect.value;
    if (!role) return;

    // Reset UI for new consultation
    conversationId = null;
    messagesEl.innerHTML = '<div class="empty-state"><p>Starting consultation&hellip;</p></div>';
    inputArea.classList.remove("hidden");
    messageInput.value = "";
    messageInput.disabled = false;
    sendBtn.disabled = false;
    messageInput.focus();

    // Update active label
    var selectedOption = roleSelect.options[roleSelect.selectedIndex];
    var animaName = selectedOption.textContent.replace(/ \\(.*\\)/, "");
    // Extract anima name from "role (animaName)" format
    var match = selectedOption.textContent.match(/\\(([^)]+)\\)/);
    animaName = match ? match[1] : role;
    activeLabel.textContent = "Consulting: " + animaName + " (" + role + ")";
    activeLabel.dataset.animaName = animaName;
    activeLabel.classList.remove("hidden");

    // Disable role selector while consultation is active
    roleSelect.disabled = true;
    startBtn.disabled = true;
    startBtn.textContent = "Active";
  });

  // --- Send message ---

  function sendMessage() {
    var text = messageInput.value.trim();
    if (!text || busy) return;

    addMessage("user", text);
    messageInput.value = "";
    setBusy(true);
    addThinking();

    var url, body;
    if (!conversationId) {
      // First message — start a new consultation
      url = "/api/consultation/start";
      body = JSON.stringify({
        role: roleSelect.value,
        message: text,
      });
    } else {
      // Follow-up message
      url = "/api/consultation/message";
      body = JSON.stringify({
        conversationId: conversationId,
        participantId: participantId,
        message: text,
      });
    }

    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body,
    })
      .then(function(r) {
        return r.json().then(function(data) {
          if (!r.ok) throw new Error(data.error || "Request failed");
          return data;
        });
      })
      .then(function(data) {
        removeThinking();
        if (data.conversationId) {
          conversationId = data.conversationId;
        }
        if (data.participantId) {
          participantId = data.participantId;
        }
        addMessage("assistant", data.response);
        setBusy(false);
      })
      .catch(function(err) {
        removeThinking();
        addError("Error: " + err.message);
        setBusy(false);
      });
  }

  sendBtn.addEventListener("click", sendMessage);

  messageInput.addEventListener("keydown", function(e) {
    // Enter sends, Shift+Enter inserts newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // --- Role change resets conversation ---

  roleSelect.addEventListener("change", function() {
    if (conversationId) {
      // Clean up old conversation on server (best-effort)
      fetch("/api/consultation/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversationId }),
      }).catch(function() {});
    }
    conversationId = null;
    participantId = null;
    messagesEl.innerHTML = '<div class="empty-state"><p>Select a role above and start a consultation to begin chatting with a guild member.</p></div>';
    inputArea.classList.add("hidden");
    activeLabel.classList.add("hidden");
    roleSelect.disabled = false;
    startBtn.disabled = !roleSelect.value;
    startBtn.textContent = "Start Consultation";
  });

  // --- Clock status polling (shared with other pages) ---

  function refreshClockStatus() {
    fetch("/api/clock-status")
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(data) {
        if (!data) return;
        var badges = document.querySelectorAll(".badge-clock-running, .badge-clock-stopped");
        badges.forEach(function(el) {
          if (data.running) {
            el.className = "badge badge-clock-running";
            el.textContent = "Clock: Running";
          } else {
            el.className = "badge badge-clock-stopped";
            el.textContent = "Clock: Stopped";
          }
        });
      })
      .catch(function() {});
  }

  setInterval(refreshClockStatus, 3000);
})();
`;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const CSS = `
  :root {
    --bg: #0f1117;
    --surface: #181b23;
    --border: #2a2d39;
    --text: #e0e0e6;
    --text-muted: #8b8fa3;
    --accent: #6c8cff;
    --accent-dim: #3d5199;
    --green: #4ade80;
    --amber: #fbbf24;
    --red: #f87171;
    --mono: "JetBrains Mono", "Fira Code", "Cascadia Code", "SF Mono", monospace;
    --sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --radius: 8px;
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { font-size: 15px; }
  body {
    font-family: var(--sans);
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  /* Header */
  header {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 1.5rem 2rem;
  }
  .header-inner {
    max-width: 1100px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 1rem;
  }
  header h1 {
    font-size: 1.4rem;
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .header-meta { display: flex; gap: 0.5rem; flex-wrap: wrap; }

  /* Badges */
  .badge {
    display: inline-block;
    font-size: 0.75rem;
    font-weight: 500;
    padding: 0.2em 0.65em;
    border-radius: 4px;
    background: var(--accent-dim);
    color: var(--accent);
  }
  .badge-alt {
    background: rgba(255,255,255,0.06);
    color: var(--text-muted);
  }
  .badge-clock-running { background: rgba(74,222,128,0.15); color: var(--green); }
  .badge-clock-stopped { background: rgba(255,255,255,0.06); color: var(--text-muted); }

  /* Top Nav */
  .top-nav {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 0 2rem;
    display: flex;
    gap: 0;
    max-width: 100%;
    overflow-x: auto;
  }
  .top-nav a {
    color: var(--text-muted);
    text-decoration: none;
    font-size: 0.85rem;
    font-weight: 500;
    padding: 0.75rem 1.25rem;
    border-bottom: 2px solid transparent;
    transition: color 0.15s, border-color 0.15s;
    white-space: nowrap;
  }
  .top-nav a:hover {
    color: var(--text);
    border-bottom-color: var(--accent);
  }
  .top-nav a.active {
    color: var(--text);
    border-bottom-color: var(--accent);
  }

  /* Main — flex-grow so chat fills available height */
  main {
    max-width: 1100px;
    width: 100%;
    margin: 0 auto;
    padding: 2rem;
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  #consultation {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  /* Controls bar */
  .consult-controls {
    margin-bottom: 1rem;
  }
  .role-selector {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .role-selector label {
    font-size: 0.88rem;
    font-weight: 500;
    color: var(--text-muted);
  }
  .role-selector select {
    font-family: var(--sans);
    font-size: 0.88rem;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.45rem 0.65rem;
    outline: none;
    min-width: 220px;
  }
  .role-selector select:focus {
    border-color: var(--accent);
  }
  .active-label {
    margin-top: 0.5rem;
    font-size: 0.82rem;
    color: var(--accent);
    font-weight: 500;
  }
  .active-label.hidden { display: none; }

  /* Buttons */
  .btn {
    font-family: var(--sans);
    font-size: 0.82rem;
    font-weight: 500;
    padding: 0.45em 1em;
    border-radius: 4px;
    border: 1px solid var(--border);
    cursor: pointer;
    transition: background 0.15s, color 0.15s, opacity 0.15s;
  }
  .btn:disabled {
    opacity: 0.35;
    cursor: default;
    pointer-events: none;
  }
  .btn-start {
    background: rgba(74,222,128,0.12);
    color: var(--green);
    border-color: rgba(74,222,128,0.25);
  }
  .btn-start:hover:not(:disabled) {
    background: rgba(74,222,128,0.22);
  }
  .btn-send {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
    padding: 0.45em 1.5em;
    align-self: flex-end;
    flex-shrink: 0;
  }
  .btn-send:hover:not(:disabled) {
    background: #5a7be6;
  }
  .btn-busy {
    background: var(--accent-dim);
    border-color: var(--accent-dim);
  }

  /* Chat area */
  .chat-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    min-height: 400px;
    overflow: hidden;
  }

  /* Messages list */
  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .empty-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    font-size: 0.9rem;
    font-style: italic;
    text-align: center;
    padding: 2rem;
  }

  /* Individual message */
  .message {
    max-width: 85%;
    padding: 0.75rem 1rem;
    border-radius: var(--radius);
    font-size: 0.88rem;
    line-height: 1.6;
    word-wrap: break-word;
  }
  .message-user {
    align-self: flex-end;
    background: var(--accent-dim);
    border: 1px solid rgba(108,140,255,0.2);
  }
  .message-assistant {
    align-self: flex-start;
    background: var(--bg);
    border: 1px solid var(--border);
  }
  .message-error {
    align-self: center;
    background: rgba(248,113,113,0.08);
    border: 1px solid rgba(248,113,113,0.25);
    color: var(--red);
    font-size: 0.82rem;
    max-width: 100%;
  }
  .message-label {
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    margin-bottom: 0.3rem;
  }
  .message-user .message-label {
    color: var(--accent);
    text-align: right;
  }
  .message-body {
    white-space: pre-wrap;
  }
  .message-body code {
    font-family: var(--mono);
    font-size: 0.82rem;
    background: rgba(255,255,255,0.06);
    padding: 0.15em 0.35em;
    border-radius: 3px;
  }
  .message-body .code-block {
    font-family: var(--mono);
    font-size: 0.78rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.75rem;
    margin: 0.5rem 0;
    overflow-x: auto;
    white-space: pre;
    line-height: 1.5;
  }

  /* Thinking indicator */
  .thinking .message-body {
    color: var(--text-muted);
    font-style: italic;
  }
  .thinking-dots span {
    animation: blink 1.4s infinite;
  }
  .thinking-dots span:nth-child(2) { animation-delay: 0.2s; }
  .thinking-dots span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes blink {
    0%, 20% { opacity: 1; }
    50% { opacity: 0.3; }
    100% { opacity: 1; }
  }

  /* Input area */
  .input-area {
    display: flex;
    gap: 0.75rem;
    align-items: flex-end;
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--border);
    background: var(--bg);
  }
  .input-area.hidden { display: none; }
  .input-area textarea {
    flex: 1;
    font-family: var(--sans);
    font-size: 0.88rem;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.5rem 0.65rem;
    outline: none;
    resize: none;
    line-height: 1.5;
    transition: border-color 0.15s;
  }
  .input-area textarea:focus {
    border-color: var(--accent);
  }
  .input-area textarea:disabled {
    opacity: 0.5;
  }

  /* Footer */
  footer {
    max-width: 1100px;
    margin: 0 auto;
    padding: 2rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.78rem;
  }

  @media (max-width: 640px) {
    header { padding: 1rem; }
    main { padding: 1rem; }
    .message { max-width: 95%; }
  }
`;
