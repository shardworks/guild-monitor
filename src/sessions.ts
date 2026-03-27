/**
 * Sessions tab — overview table of sessions and session detail view
 * with transcript rendering.
 *
 * Sessions are read from the nexus-core API (listSessions, showSession)
 * and their on-disk JSON records provide transcript data.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type {
  SessionSummary,
  SessionDetail,
  SessionRecord,
} from "@shardworks/nexus-core";
import { renderTopNav, renderHeader } from "./clockworks.js";

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Session list page
// ---------------------------------------------------------------------------

export interface SessionsPageData {
  sessions: SessionSummary[];
  /** Anima ID → name lookup. */
  animaNames: Record<string, string>;
  page: number;
  guildName: string;
  nexus: string;
  model: string;
  clockRunning: boolean;
}

export function renderSessionsPage(data: SessionsPageData): string {
  const { sessions, animaNames, page, guildName, nexus, model, clockRunning } = data;

  const totalPages = Math.max(1, Math.ceil(sessions.length / PAGE_SIZE));
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = sessions.slice(start, start + PAGE_SIZE);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(guildName)} — Sessions</title>
  <style>${CSS}</style>
</head>
<body>
  ${renderHeader(guildName, nexus, model, clockRunning)}
  ${renderTopNav("sessions")}
  <main>
    <section id="session-list">
      <h2>Sessions <span class="count">(${sessions.length})</span></h2>
      ${renderSessionTable(pageItems, animaNames)}
      ${renderPagination(currentPage, totalPages)}
    </section>
  </main>
  <footer>
    <p>Guild Monitor &middot; Refreshed at ${new Date().toLocaleTimeString()}</p>
  </footer>
  <script>${LIST_JS}</script>
</body>
</html>`;
}

function renderSessionTable(
  sessions: SessionSummary[],
  animaNames: Record<string, string>,
): string {
  if (sessions.length === 0) {
    return `<p class="empty">No sessions found.</p>`;
  }

  return `<div class="table-wrap"><table id="sessions-table">
    <thead>
      <tr>
        <th>ID</th>
        <th>Anima</th>
        <th>Trigger</th>
        <th>Workshop</th>
        <th>Status</th>
        <th>Cost</th>
        <th>Duration</th>
        <th>Started</th>
        <th></th>
      </tr>
    </thead>
    <tbody>${sessions.map((s) => {
      const animaName = animaNames[s.animaId] ?? s.animaId;
      const isActive = !s.endedAt;
      const statusBadge = isActive
        ? '<span class="badge badge-active">active</span>'
        : s.exitCode === 0
          ? '<span class="badge badge-completed">completed</span>'
          : `<span class="badge badge-failed">exit ${s.exitCode ?? "?"}</span>`;
      const cost = s.costUsd != null ? `$${s.costUsd.toFixed(4)}` : "&mdash;";
      const duration = s.durationMs != null ? formatDuration(s.durationMs) : "&mdash;";

      return `<tr class="session-row">
        <td class="mono">${esc(s.id)}</td>
        <td>${esc(animaName)}</td>
        <td><span class="badge badge-trigger badge-trigger-${esc(s.trigger)}">${esc(s.trigger)}</span></td>
        <td class="mono">${esc(s.workshop ?? "")}</td>
        <td>${statusBadge}</td>
        <td class="mono">${cost}</td>
        <td class="nowrap">${duration}</td>
        <td class="nowrap">${formatDateTime(s.startedAt)}</td>
        <td class="drill-cell"><a href="/sessions/${encodeURIComponent(s.id)}" class="drill-link" title="View session">&rarr;</a></td>
      </tr>`;
    }).join("")}
    </tbody>
  </table></div>`;
}

// ---------------------------------------------------------------------------
// Session detail page
// ---------------------------------------------------------------------------

export interface SessionDetailPageData {
  session: SessionDetail;
  animaName: string;
  /** Full session record from disk (may be null if file missing). */
  record: SessionRecord | null;
  guildName: string;
  nexus: string;
  model: string;
  clockRunning: boolean;
}

export function renderSessionDetailPage(data: SessionDetailPageData): string {
  const { session, animaName, record, guildName, nexus, model, clockRunning } = data;

  const isActive = !session.endedAt;
  const statusBadge = isActive
    ? '<span class="badge badge-active">active</span>'
    : session.exitCode === 0
      ? '<span class="badge badge-completed">completed</span>'
      : `<span class="badge badge-failed">exit ${session.exitCode ?? "?"}</span>`;

  const cost = session.costUsd != null ? `$${session.costUsd.toFixed(4)}` : "&mdash;";
  const duration = session.durationMs != null ? formatDuration(session.durationMs) : "&mdash;";

  const tokenInfo = [
    session.inputTokens != null ? `Input: ${session.inputTokens.toLocaleString()}` : null,
    session.outputTokens != null ? `Output: ${session.outputTokens.toLocaleString()}` : null,
    session.cacheReadTokens != null ? `Cache Read: ${session.cacheReadTokens.toLocaleString()}` : null,
    session.cacheWriteTokens != null ? `Cache Write: ${session.cacheWriteTokens.toLocaleString()}` : null,
  ].filter(Boolean).join(" &middot; ");

  // Anima info section (collapsible)
  const animaSection = record ? renderAnimaInfo(record) : "";

  // Transcript section
  const transcriptHtml = record
    ? renderTranscript(record.transcript)
    : '<p class="empty">Session record file not found on disk.</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(guildName)} — Session ${esc(session.id)}</title>
  <style>${CSS}</style>
</head>
<body>
  ${renderHeader(guildName, nexus, model, clockRunning)}
  ${renderTopNav("sessions")}
  <main>
    <section id="session-detail">
      <div class="breadcrumb">
        <a href="/sessions" class="breadcrumb-link">Sessions</a>
        <span class="breadcrumb-sep">/</span>
        <span class="breadcrumb-current">${esc(session.id)}</span>
      </div>

      <div class="detail-card">
        <div class="detail-card-header">
          <span class="mono">${esc(session.id)}</span>
          ${statusBadge}
          <span class="badge badge-trigger badge-trigger-${esc(session.trigger)}">${esc(session.trigger)}</span>
          ${session.workshop ? `<span class="text-muted">workshop: ${esc(session.workshop)}</span>` : ""}
        </div>
        <div class="session-meta-grid">
          <dl>
            <dt>Anima</dt>
            <dd>${esc(animaName)} <span class="text-muted mono">(${esc(session.animaId)})</span></dd>
            <dt>Roles</dt>
            <dd>${session.roles.length > 0 ? session.roles.map(r => `<span class="badge badge-alt">${esc(r)}</span>`).join(" ") : "&mdash;"}</dd>
            <dt>Provider</dt>
            <dd class="mono">${esc(session.provider)}</dd>
            <dt>Training</dt>
            <dd>${session.curriculumName ? `${esc(session.curriculumName)} v${esc(session.curriculumVersion ?? "")}` : "&mdash;"} / ${session.temperamentName ? `${esc(session.temperamentName)} v${esc(session.temperamentVersion ?? "")}` : "&mdash;"}</dd>
          </dl>
          <dl>
            <dt>Cost</dt>
            <dd class="mono">${cost}</dd>
            <dt>Duration</dt>
            <dd>${duration}</dd>
            <dt>Started</dt>
            <dd>${formatDateTime(session.startedAt)}</dd>
            <dt>Ended</dt>
            <dd>${session.endedAt ? formatDateTime(session.endedAt) : "&mdash;"}</dd>
          </dl>
          ${tokenInfo ? `<div class="token-info">${tokenInfo}</div>` : ""}
        </div>
      </div>
    </section>

    ${animaSection}

    <section id="transcript">
      <h2>Transcript</h2>
      ${transcriptHtml}
    </section>
  </main>
  <footer>
    <p>Guild Monitor &middot; Refreshed at ${new Date().toLocaleTimeString()}</p>
  </footer>
  <script>${DETAIL_JS}</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Anima info (collapsible)
// ---------------------------------------------------------------------------

function renderAnimaInfo(record: SessionRecord): string {
  const anima = record.anima;

  const toolNames = record.tools.map((t) => t.name);
  const toolListShort = toolNames.slice(0, 5).map((n) => esc(n)).join(", ");
  const toolListFull = toolNames.map((n) => `<span class="tag">${esc(n)}</span>`).join("");

  return `<section id="anima-info">
    <h2 class="collapsible-header" data-target="anima-body">
      Anima Composition <span class="text-muted">(click to expand)</span>
      <span class="collapse-icon">&#9654;</span>
    </h2>
    <div id="anima-body" class="collapsible-body hidden">
      <div class="detail-card">
        <dl>
          <dt>Name</dt>
          <dd>${esc(anima.name)}</dd>
          <dt>ID</dt>
          <dd class="mono">${esc(anima.id)}</dd>
          <dt>Roles</dt>
          <dd>${anima.roles.map((r) => `<span class="badge badge-alt">${esc(r)}</span>`).join(" ")}</dd>
        </dl>

        <div class="collapsible-sub">
          <h3 class="collapsible-header" data-target="tools-body">
            Tools <span class="count">(${toolNames.length})</span>
            ${toolNames.length > 5 ? `<span class="text-muted"> — ${toolListShort}...</span>` : `<span class="text-muted"> — ${toolListShort}</span>`}
            <span class="collapse-icon">&#9654;</span>
          </h3>
          <div id="tools-body" class="collapsible-body hidden">
            <div class="tag-list">${toolListFull}</div>
          </div>
        </div>

        ${record.unavailableTools.length > 0 ? `
        <div class="collapsible-sub">
          <h3 class="collapsible-header" data-target="unavailable-tools-body">
            Unavailable Tools <span class="count">(${record.unavailableTools.length})</span>
            <span class="collapse-icon">&#9654;</span>
          </h3>
          <div id="unavailable-tools-body" class="collapsible-body hidden">
            <div class="tag-list">${record.unavailableTools.map((t) =>
              `<span class="tag tag-muted" title="${esc(t.reasons.join(", "))}">${esc(t.name)}</span>`
            ).join("")}</div>
          </div>
        </div>
        ` : ""}

        ${anima.curriculum ? `
        <div class="collapsible-sub">
          <h3 class="collapsible-header" data-target="curriculum-body">
            Curriculum: ${esc(anima.curriculum.name)} v${esc(anima.curriculum.version)}
            <span class="collapse-icon">&#9654;</span>
          </h3>
          <div id="curriculum-body" class="collapsible-body hidden">
            <pre class="prompt-text">${esc(anima.curriculum.content)}</pre>
          </div>
        </div>
        ` : ""}

        ${anima.temperament ? `
        <div class="collapsible-sub">
          <h3 class="collapsible-header" data-target="temperament-body">
            Temperament: ${esc(anima.temperament.name)} v${esc(anima.temperament.version)}
            <span class="collapse-icon">&#9654;</span>
          </h3>
          <div id="temperament-body" class="collapsible-body hidden">
            <pre class="prompt-text">${esc(anima.temperament.content)}</pre>
          </div>
        </div>
        ` : ""}

        <div class="collapsible-sub">
          <h3 class="collapsible-header" data-target="system-prompt-body">
            System Prompt
            <span class="collapse-icon">&#9654;</span>
          </h3>
          <div id="system-prompt-body" class="collapsible-body hidden">
            <pre class="prompt-text">${esc(record.systemPrompt)}</pre>
          </div>
        </div>

        ${record.userPrompt ? `
        <div class="collapsible-sub">
          <h3 class="collapsible-header" data-target="user-prompt-body">
            User Prompt
            <span class="collapse-icon">&#9654;</span>
          </h3>
          <div id="user-prompt-body" class="collapsible-body hidden">
            <pre class="prompt-text">${esc(record.userPrompt)}</pre>
          </div>
        </div>
        ` : ""}
      </div>
    </div>
  </section>`;
}

// ---------------------------------------------------------------------------
// Transcript rendering
// ---------------------------------------------------------------------------

function renderTranscript(transcript: Record<string, unknown>[]): string {
  if (!transcript || transcript.length === 0) {
    return '<p class="empty">No transcript data.</p>';
  }

  const entries = transcript.map((entry) => renderTranscriptEntry(entry));
  return `<div class="transcript-container">${entries.join("")}</div>`;
}

function renderTranscriptEntry(entry: Record<string, unknown>): string {
  const type = entry.type as string | undefined;

  if (type === "assistant") {
    return renderAssistantEntry(entry);
  }
  if (type === "user") {
    return renderUserEntry(entry);
  }

  // Unknown entry type — render as collapsed JSON
  return `<div class="transcript-entry transcript-unknown">
    <div class="transcript-label">unknown (${esc(String(type ?? "?"))})</div>
    <pre class="transcript-raw">${esc(JSON.stringify(entry, null, 2))}</pre>
  </div>`;
}

function renderAssistantEntry(entry: Record<string, unknown>): string {
  const message = entry.message as Record<string, unknown> | undefined;
  if (!message) return "";

  const content = message.content as Array<Record<string, unknown>> | undefined;
  if (!content || !Array.isArray(content)) return "";

  const parts: string[] = [];

  for (const block of content) {
    if (block.type === "text") {
      const text = block.text as string;
      if (text) {
        parts.push(`<div class="transcript-text">${esc(text)}</div>`);
      }
    } else if (block.type === "tool_use") {
      const toolName = block.name as string ?? "unknown";
      const toolId = block.id as string ?? "";
      const input = block.input as Record<string, unknown> | undefined;
      const inputStr = input ? JSON.stringify(input, null, 2) : "";
      // Condensed tool use — de-emphasized
      parts.push(`<div class="transcript-tool-use">
        <span class="tool-label">tool_use</span>
        <span class="mono tool-name">${esc(toolName)}</span>
        ${inputStr.length > 200
          ? `<details class="tool-details"><summary class="tool-summary">input (${inputStr.length} chars)</summary><pre class="tool-input">${esc(inputStr)}</pre></details>`
          : inputStr ? `<pre class="tool-input-inline">${esc(inputStr)}</pre>` : ""}
      </div>`);
    }
  }

  if (parts.length === 0) return "";

  return `<div class="transcript-entry transcript-assistant">
    <div class="transcript-label">assistant</div>
    ${parts.join("")}
  </div>`;
}

function renderUserEntry(entry: Record<string, unknown>): string {
  const message = entry.message as Record<string, unknown> | undefined;
  if (!message) return "";

  const content = message.content as Array<Record<string, unknown>> | string | undefined;

  // Sometimes content is a plain string
  if (typeof content === "string") {
    return `<div class="transcript-entry transcript-user">
      <div class="transcript-label">user</div>
      <div class="transcript-text">${esc(content)}</div>
    </div>`;
  }

  if (!content || !Array.isArray(content)) return "";

  const parts: string[] = [];

  for (const block of content) {
    if (block.type === "text") {
      const text = block.text as string;
      if (text) {
        parts.push(`<div class="transcript-text">${esc(text)}</div>`);
      }
    } else if (block.type === "tool_result") {
      const toolUseId = block.tool_use_id as string ?? "";
      const resultContent = block.content as Array<Record<string, unknown>> | string | undefined;

      let resultText = "";
      if (typeof resultContent === "string") {
        resultText = resultContent;
      } else if (Array.isArray(resultContent)) {
        resultText = resultContent
          .filter((r) => r.type === "text")
          .map((r) => r.text as string)
          .join("\n");
      }

      // De-emphasized tool result
      const truncatedResult = resultText.length > 500
        ? resultText.slice(0, 500) + `\u2026 (${resultText.length} chars)`
        : resultText;

      parts.push(`<div class="transcript-tool-result">
        <span class="tool-label">tool_result</span>
        ${truncatedResult ? `<details class="tool-details"><summary class="tool-summary">${esc(truncatedResult.split("\n")[0]?.slice(0, 80) ?? "result")}</summary><pre class="tool-input">${esc(resultText)}</pre></details>` : ""}
      </div>`);
    }
  }

  if (parts.length === 0) return "";

  return `<div class="transcript-entry transcript-user">
    <div class="transcript-label">user</div>
    ${parts.join("")}
  </div>`;
}

// ---------------------------------------------------------------------------
// Read session record from disk
// ---------------------------------------------------------------------------

export function readSessionRecord(
  home: string,
  recordPath: string | null,
): SessionRecord | null {
  if (!recordPath) return null;

  // recordPath may be absolute or relative to home
  const absPath = recordPath.startsWith("/")
    ? recordPath
    : join(home, recordPath);

  if (!existsSync(absPath)) return null;

  try {
    const raw = readFileSync(absPath, "utf-8");
    return JSON.parse(raw) as SessionRecord;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPagination(current: number, total: number): string {
  if (total <= 1) return "";

  function pageUrl(p: number): string {
    return p > 1 ? `/sessions?page=${p}` : "/sessions";
  }

  const links: string[] = [];
  if (current > 1) {
    links.push(`<a href="${pageUrl(current - 1)}" class="page-link">&laquo; Prev</a>`);
  } else {
    links.push(`<span class="page-link disabled">&laquo; Prev</span>`);
  }
  for (let i = 1; i <= total; i++) {
    if (i === current) {
      links.push(`<span class="page-link active">${i}</span>`);
    } else {
      links.push(`<a href="${pageUrl(i)}" class="page-link">${i}</a>`);
    }
  }
  if (current < total) {
    links.push(`<a href="${pageUrl(current + 1)}" class="page-link">Next &raquo;</a>`);
  } else {
    links.push(`<span class="page-link disabled">Next &raquo;</span>`);
  }
  return `<div class="pagination">${links.join("")}</div>`;
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return esc(iso);
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  if (mins < 60) return `${mins}m ${remSecs}s`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}h ${remMins}m`;
}

/** Escape HTML special characters. */
function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Client-side JS — list page
// ---------------------------------------------------------------------------

const LIST_JS = `
(function() {
  "use strict";

  function refreshClockStatus() {
    fetch("/api/clock-status")
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(data) {
        if (!data) return;
        document.querySelectorAll(".badge-clock-running, .badge-clock-stopped").forEach(function(el) {
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

  function refreshTimestamp() {
    var footer = document.querySelector("footer p");
    if (footer) {
      footer.innerHTML = "Guild Monitor &middot; Refreshed at " + new Date().toLocaleTimeString();
    }
  }

  setInterval(function() {
    refreshClockStatus();
    refreshTimestamp();
  }, 3000);
})();
`;

// ---------------------------------------------------------------------------
// Client-side JS — detail page (collapsible sections)
// ---------------------------------------------------------------------------

const DETAIL_JS = `
(function() {
  "use strict";

  // Collapsible sections
  document.querySelectorAll(".collapsible-header").forEach(function(header) {
    header.style.cursor = "pointer";
    header.addEventListener("click", function() {
      var targetId = header.dataset.target;
      if (!targetId) return;
      var body = document.getElementById(targetId);
      if (!body) return;
      var icon = header.querySelector(".collapse-icon");
      if (body.classList.contains("hidden")) {
        body.classList.remove("hidden");
        if (icon) icon.innerHTML = "&#9660;";
      } else {
        body.classList.add("hidden");
        if (icon) icon.innerHTML = "&#9654;";
      }
    });
  });

  function refreshClockStatus() {
    fetch("/api/clock-status")
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(data) {
        if (!data) return;
        document.querySelectorAll(".badge-clock-running, .badge-clock-stopped").forEach(function(el) {
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

  function refreshTimestamp() {
    var footer = document.querySelector("footer p");
    if (footer) {
      footer.innerHTML = "Guild Monitor &middot; Refreshed at " + new Date().toLocaleTimeString();
    }
  }

  setInterval(function() {
    refreshClockStatus();
    refreshTimestamp();
  }, 3000);
})();
`;

// ---------------------------------------------------------------------------
// Styles — matches design system from other tabs
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
  .badge-active { background: rgba(251,191,36,0.15); color: var(--amber); }
  .badge-completed { background: rgba(74,222,128,0.15); color: var(--green); }
  .badge-failed { background: rgba(248,113,113,0.15); color: var(--red); }
  .badge-clock-running { background: rgba(74,222,128,0.15); color: var(--green); }
  .badge-clock-stopped { background: rgba(255,255,255,0.06); color: var(--text-muted); }

  /* Trigger badges */
  .badge-trigger { font-family: var(--mono); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .badge-trigger-summon { background: rgba(108,140,255,0.15); color: var(--accent); }
  .badge-trigger-consult { background: rgba(74,222,128,0.15); color: var(--green); }
  .badge-trigger-brief { background: rgba(251,191,36,0.15); color: var(--amber); }

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
  .top-nav a:hover { color: var(--text); border-bottom-color: var(--accent); }
  .top-nav a.active { color: var(--text); border-bottom-color: var(--accent); }

  /* Main */
  main {
    max-width: 1100px;
    margin: 0 auto;
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 2.5rem;
  }

  /* Sections */
  section h2 {
    font-size: 1.15rem;
    font-weight: 600;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border);
  }
  .count {
    font-weight: 400;
    color: var(--text-muted);
    font-size: 0.85em;
  }

  /* Tables */
  .table-wrap { overflow-x: auto; }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }
  thead th {
    text-align: left;
    font-weight: 500;
    color: var(--text-muted);
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  tbody td {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid rgba(255,255,255,0.03);
    vertical-align: top;
  }
  tbody tr:hover { background: rgba(255,255,255,0.02); }
  .nowrap { white-space: nowrap; }

  /* Drill-down link */
  .drill-cell { text-align: center; }
  .drill-link {
    color: var(--accent);
    text-decoration: none;
    font-size: 1rem;
    font-weight: 600;
    opacity: 0.6;
    transition: opacity 0.15s;
  }
  .drill-link:hover { opacity: 1; }

  /* Breadcrumb */
  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.82rem;
    flex-wrap: wrap;
    margin-bottom: 0.5rem;
  }
  .breadcrumb-link {
    color: var(--accent);
    text-decoration: none;
  }
  .breadcrumb-link:hover { text-decoration: underline; }
  .breadcrumb-sep { color: var(--text-muted); }
  .breadcrumb-current { color: var(--text); font-weight: 500; }

  /* Detail card */
  .detail-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.25rem;
  }
  .detail-card-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 0.75rem;
  }
  .session-meta-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 2rem;
  }
  .session-meta-grid dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.3rem 0.75rem;
    font-size: 0.85rem;
  }
  .session-meta-grid dt { color: var(--text-muted); font-weight: 500; }
  .session-meta-grid dd { word-break: break-all; }
  .token-info {
    font-size: 0.82rem;
    color: var(--text-muted);
    align-self: flex-end;
  }

  /* Collapsible sections */
  .collapsible-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    user-select: none;
  }
  .collapse-icon {
    font-size: 0.7rem;
    color: var(--text-muted);
    transition: transform 0.15s;
  }
  .collapsible-body.hidden { display: none; }
  .collapsible-sub {
    margin-top: 1rem;
    padding-top: 0.75rem;
    border-top: 1px solid rgba(255,255,255,0.05);
  }
  .collapsible-sub h3 {
    font-size: 0.9rem;
    font-weight: 500;
  }

  /* Tags */
  .tag-list { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.5rem; }
  .tag {
    font-family: var(--mono);
    font-size: 0.72rem;
    background: rgba(255,255,255,0.05);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.15em 0.5em;
    color: var(--text-muted);
  }
  .tag-muted { opacity: 0.6; }

  /* Prompt / text blocks */
  .prompt-text {
    font-family: var(--mono);
    font-size: 0.78rem;
    color: var(--text-muted);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.75rem 1rem;
    margin-top: 0.5rem;
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow-x: auto;
    max-height: 400px;
    overflow-y: auto;
  }

  /* Transcript */
  .transcript-container {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1rem;
    max-height: 70vh;
    overflow-y: auto;
  }
  .transcript-entry {
    margin-bottom: 1rem;
    padding: 0.75rem 1rem;
    border-radius: 6px;
  }
  .transcript-entry:last-child { margin-bottom: 0; }
  .transcript-assistant {
    background: rgba(108,140,255,0.06);
    border-left: 3px solid var(--accent);
  }
  .transcript-user {
    background: rgba(255,255,255,0.03);
    border-left: 3px solid var(--border);
  }
  .transcript-unknown {
    background: rgba(255,255,255,0.02);
    border-left: 3px solid var(--text-muted);
  }
  .transcript-label {
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    margin-bottom: 0.5rem;
  }
  .transcript-text {
    font-size: 0.88rem;
    line-height: 1.7;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
  .transcript-raw {
    font-family: var(--mono);
    font-size: 0.78rem;
    color: var(--text-muted);
    white-space: pre-wrap;
    word-wrap: break-word;
    max-height: 300px;
    overflow-y: auto;
  }

  /* Tool use / result — de-emphasized */
  .transcript-tool-use,
  .transcript-tool-result {
    margin: 0.5rem 0;
    padding: 0.4rem 0.6rem;
    background: rgba(255,255,255,0.02);
    border-radius: 4px;
    font-size: 0.78rem;
    color: var(--text-muted);
  }
  .tool-label {
    font-family: var(--mono);
    font-size: 0.68rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    opacity: 0.7;
    margin-right: 0.5rem;
  }
  .tool-name {
    color: var(--accent);
    opacity: 0.8;
  }
  .tool-details {
    margin-top: 0.3rem;
  }
  .tool-summary {
    cursor: pointer;
    color: var(--text-muted);
    font-size: 0.75rem;
    opacity: 0.8;
  }
  .tool-summary:hover { opacity: 1; }
  .tool-input {
    font-family: var(--mono);
    font-size: 0.75rem;
    color: var(--text-muted);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.5rem;
    margin-top: 0.3rem;
    white-space: pre-wrap;
    word-wrap: break-word;
    max-height: 300px;
    overflow-y: auto;
  }
  .tool-input-inline {
    font-family: var(--mono);
    font-size: 0.72rem;
    color: var(--text-muted);
    opacity: 0.7;
    margin-top: 0.25rem;
    white-space: pre-wrap;
    word-wrap: break-word;
    max-height: 150px;
    overflow-y: auto;
  }

  /* Pagination */
  .pagination {
    display: flex;
    gap: 0.25rem;
    margin-top: 1.25rem;
    justify-content: center;
    flex-wrap: wrap;
  }
  .page-link {
    display: inline-block;
    padding: 0.35em 0.75em;
    font-size: 0.82rem;
    border-radius: 4px;
    text-decoration: none;
    color: var(--text-muted);
    background: var(--surface);
    border: 1px solid var(--border);
    transition: background 0.15s, color 0.15s;
  }
  .page-link:hover:not(.disabled):not(.active) {
    background: var(--accent-dim);
    color: var(--text);
  }
  .page-link.active {
    background: var(--accent-dim);
    color: var(--accent);
    font-weight: 600;
  }
  .page-link.disabled {
    opacity: 0.4;
    cursor: default;
  }

  /* Utility */
  .mono { font-family: var(--mono); font-size: 0.82rem; }
  .text-muted { color: var(--text-muted); font-size: 0.85rem; }
  .empty {
    color: var(--text-muted);
    font-style: italic;
    padding: 1rem 0;
  }
  .hidden { display: none; }

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
    .session-meta-grid { flex-direction: column; gap: 1rem; }
  }
`;
