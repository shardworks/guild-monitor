import type {
  GuildEvent,
  DispatchRecord,
} from "@shardworks/nexus-core";

const PAGE_SIZE = 25;

/**
 * Render the Clockworks section — daemon status, recent events,
 * and dispatch history.
 */
export function renderClockworksPage(
  clockRunning: boolean,
  events: GuildEvent[],
  dispatches: DispatchRecord[],
  page: number,
  guildName: string,
  nexus: string,
  model: string,
): string {
  const totalPages = Math.max(1, Math.ceil(events.length / PAGE_SIZE));
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageEvents = events.slice(start, start + PAGE_SIZE);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(guildName)} — Clockworks</title>
  <style>${CSS}</style>
</head>
<body>
  ${renderHeader(guildName, nexus, model, clockRunning)}
  ${renderTopNav("clockworks")}
  <main>
    ${renderDaemonStatus(clockRunning)}
    <section id="events">
      <h2>Events <span class="count">(${events.length})</span></h2>
      ${renderEventTable(pageEvents)}
      ${renderPagination(currentPage, totalPages)}
    </section>
    <section id="dispatches">
      <h2>Recent Dispatches <span class="count">(${dispatches.length})</span></h2>
      ${renderDispatchTable(dispatches)}
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
// Shared layout — exported for other pages
// ---------------------------------------------------------------------------

/**
 * Render the header bar with guild name, version, model, and clock status.
 */
export function renderHeader(
  guildName: string,
  nexus: string,
  model: string,
  clockRunning: boolean,
): string {
  const clockBadge = clockRunning
    ? '<span class="badge badge-clock-running">Clock: Running</span>'
    : '<span class="badge badge-clock-stopped">Clock: Stopped</span>';

  return `<header>
    <div class="header-inner">
      <h1>${esc(guildName)}</h1>
      <div class="header-meta">
        <span class="badge">Nexus ${esc(nexus)}</span>
        <span class="badge badge-alt">Model: ${esc(model)}</span>
        ${clockBadge}
      </div>
    </div>
  </header>`;
}

/**
 * Render the top-level navigation bar with section links.
 */
export function renderTopNav(
  active: "configuration" | "work" | "clockworks",
): string {
  return `<nav class="top-nav">
    <a href="/"${active === "configuration" ? ' class="active"' : ""}>Configuration</a>
    <a href="/work"${active === "work" ? ' class="active"' : ""}>Work</a>
    <a href="/clockworks"${active === "clockworks" ? ' class="active"' : ""}>Clockworks</a>
  </nav>`;
}

// ---------------------------------------------------------------------------
// Sub-renderers
// ---------------------------------------------------------------------------

function renderDaemonStatus(running: boolean): string {
  const statusClass = running ? "status-running" : "status-stopped";
  const statusLabel = running ? "Running" : "Stopped";

  return `<section id="daemon-status">
    <h2>Daemon Status</h2>
    <div class="status-card ${statusClass}">
      <div class="status-indicator">
        <span class="status-dot"></span>
        <span class="status-label">${statusLabel}</span>
      </div>
    </div>
  </section>`;
}

function renderEventTable(events: GuildEvent[]): string {
  if (events.length === 0) {
    return `<p class="empty">No events recorded.</p>`;
  }
  return `<div class="table-wrap"><table>
    <thead>
      <tr>
        <th></th>
        <th>ID</th>
        <th>Event</th>
        <th>Emitter</th>
        <th>Fired At</th>
      </tr>
    </thead>
    <tbody>${events.map((e) => {
      return `<tr class="event-row" data-event-id="${esc(e.id)}">
        <td class="expand-cell"><span class="expand-icon">&#9654;</span></td>
        <td class="mono">${esc(e.id)}</td>
        <td><span class="badge badge-event">${esc(e.name)}</span></td>
        <td class="mono">${esc(e.emitter)}</td>
        <td class="nowrap">${formatDateTime(e.firedAt)}</td>
      </tr>
      <tr class="detail-row hidden" id="detail-${esc(e.id)}">
        <td colspan="5">
          <div class="detail-panel">
            <h4>Payload</h4>
            <pre class="payload-json">${esc(JSON.stringify(e.payload, null, 2))}</pre>
          </div>
        </td>
      </tr>`;
    }).join("")}
    </tbody>
  </table></div>`;
}

function renderDispatchTable(dispatches: DispatchRecord[]): string {
  if (dispatches.length === 0) {
    return `<p class="empty">No dispatches recorded.</p>`;
  }
  return `<div class="table-wrap"><table>
    <thead>
      <tr>
        <th>Event</th>
        <th>Handler</th>
        <th>Type</th>
        <th>Status</th>
        <th>Duration</th>
        <th>Started</th>
      </tr>
    </thead>
    <tbody>${dispatches.map((d) => {
      const duration = d.startedAt && d.endedAt
        ? formatDuration(new Date(d.endedAt).getTime() - new Date(d.startedAt).getTime())
        : "&mdash;";
      const statusCls = d.status === "success"
        ? "badge-completed"
        : d.status === "error"
          ? "badge-failed"
          : "badge-alt";
      return `<tr>
        <td class="mono">${esc(d.eventId)}</td>
        <td class="mono">${esc(d.handlerName)}</td>
        <td><span class="badge badge-alt">${esc(d.handlerType)}</span>${d.noticeType ? ` <span class="badge badge-alt">${esc(d.noticeType)}</span>` : ""}</td>
        <td>${d.status ? `<span class="badge ${statusCls}">${esc(d.status)}</span>` : "&mdash;"}</td>
        <td class="mono nowrap">${duration}</td>
        <td class="nowrap">${d.startedAt ? formatDateTime(d.startedAt) : "&mdash;"}</td>
      </tr>${d.error ? `<tr class="error-row"><td colspan="6"><div class="error-detail">${esc(d.error)}</div></td></tr>` : ""}`;
    }).join("")}
    </tbody>
  </table></div>`;
}

function renderPagination(current: number, total: number): string {
  if (total <= 1) return "";

  const links: string[] = [];

  if (current > 1) {
    links.push(
      `<a href="/clockworks?page=${current - 1}" class="page-link">&laquo; Prev</a>`,
    );
  } else {
    links.push(`<span class="page-link disabled">&laquo; Prev</span>`);
  }

  for (let i = 1; i <= total; i++) {
    if (i === current) {
      links.push(`<span class="page-link active">${i}</span>`);
    } else {
      links.push(
        `<a href="/clockworks?page=${i}" class="page-link">${i}</a>`,
      );
    }
  }

  if (current < total) {
    links.push(
      `<a href="/clockworks?page=${current + 1}" class="page-link">Next &raquo;</a>`,
    );
  } else {
    links.push(`<span class="page-link disabled">Next &raquo;</span>`);
  }

  return `<div class="pagination">${links.join("")}</div>`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = (ms / 1000).toFixed(1);
  return `${seconds}s`;
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }) + " " + d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return esc(iso);
  }
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
// Client-side JavaScript — event row expand/collapse
// ---------------------------------------------------------------------------

const CLIENT_JS = `
(function() {
  "use strict";

  // --- Helpers ---

  function esc(str) {
    var d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function badge(status) {
    var cls = {
      posted: "badge-posted", active: "badge-active", in_progress: "badge-active",
      open: "badge-posted", completed: "badge-completed", cancelled: "badge-cancelled",
      failed: "badge-failed", pending: "badge-posted", complete: "badge-completed",
      success: "badge-completed", error: "badge-failed"
    }[status] || "badge-alt";
    return '<span class="badge ' + cls + '">' + esc(status) + '</span>';
  }

  function fmtDateTime(iso) {
    try {
      var d = new Date(iso);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
        " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    } catch(e) { return esc(iso); }
  }

  function fmtDuration(ms) {
    if (ms < 1000) return ms + "ms";
    return (ms / 1000).toFixed(1) + "s";
  }

  function fetchJson(url) {
    return fetch(url).then(function(r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  // --- Event row expand/collapse ---

  function attachEventListeners() {
    document.querySelectorAll(".event-row").forEach(function(row) {
      if (row.dataset.bound) return;
      row.dataset.bound = "1";

      row.addEventListener("click", function() {
        var id = row.dataset.eventId;
        var detailRow = document.getElementById("detail-" + id);
        if (!detailRow) return;

        var isHidden = detailRow.classList.contains("hidden");
        var icon = row.querySelector(".expand-icon");

        if (isHidden) {
          detailRow.classList.remove("hidden");
          row.classList.add("selected");
          if (icon) icon.innerHTML = "&#9660;";
        } else {
          detailRow.classList.add("hidden");
          row.classList.remove("selected");
          if (icon) icon.innerHTML = "&#9654;";
        }
      });
    });
  }

  attachEventListeners();

  // =========================================================================
  // Auto-refresh polling
  // =========================================================================

  var POLL_INTERVAL = 3000;

  function currentPage() {
    var params = new URLSearchParams(window.location.search);
    return Math.max(1, parseInt(params.get("page") || "1", 10) || 1);
  }

  // Update clock status badge in header
  function refreshClockStatus() {
    fetchJson("/api/clock-status")
      .then(function(data) {
        // Update header badge
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

        // Update daemon status card
        var card = document.querySelector(".status-card");
        if (card) {
          var wasRunning = card.classList.contains("status-running");
          if (data.running !== wasRunning) {
            card.className = "status-card " + (data.running ? "status-running" : "status-stopped");
            var dot = card.querySelector(".status-label");
            if (dot) dot.textContent = data.running ? "Running" : "Stopped";
          }
        }
      })
      .catch(function() {});
  }

  function refreshTimestamp() {
    var footer = document.querySelector("footer p");
    if (footer) {
      footer.innerHTML = "Guild Monitor &middot; Refreshed at " + new Date().toLocaleTimeString();
    }
  }

  // Patch the events table in place
  function refreshEvents() {
    var page = currentPage();
    fetchJson("/api/events?page=" + page)
      .then(function(data) {
        var items = data.items || [];
        var total = data.total || 0;

        // Update heading count
        var heading = document.querySelector("#events h2");
        if (heading) {
          heading.innerHTML = 'Events <span class="count">(' + total + ')</span>';
        }

        var tbody = document.querySelector("#events tbody");
        if (!tbody) return;

        // Build lookup of existing rows
        var existingRows = {};
        tbody.querySelectorAll(".event-row").forEach(function(row) {
          existingRows[row.dataset.eventId] = row;
        });

        // Build set of new IDs
        var newIds = {};
        items.forEach(function(e) { newIds[e.id] = e; });

        // Remove rows no longer on this page
        Object.keys(existingRows).forEach(function(id) {
          if (!newIds[id]) {
            var detail = document.getElementById("detail-" + id);
            if (detail) detail.remove();
            existingRows[id].remove();
          }
        });

        // Add new events that aren't in the DOM yet
        items.forEach(function(e) {
          if (existingRows[e.id]) return;

          var tr = document.createElement("tr");
          tr.className = "event-row";
          tr.dataset.eventId = e.id;
          tr.innerHTML =
            '<td class="expand-cell"><span class="expand-icon">&#9654;</span></td>' +
            '<td class="mono">' + esc(e.id) + '</td>' +
            '<td><span class="badge badge-event">' + esc(e.name) + '</span></td>' +
            '<td class="mono">' + esc(e.emitter) + '</td>' +
            '<td class="nowrap">' + fmtDateTime(e.firedAt) + '</td>';

          var detailTr = document.createElement("tr");
          detailTr.className = "detail-row hidden";
          detailTr.id = "detail-" + e.id;
          detailTr.innerHTML =
            '<td colspan="5"><div class="detail-panel">' +
            '<h4>Payload</h4>' +
            '<pre class="payload-json">' + esc(JSON.stringify(e.payload, null, 2)) + '</pre>' +
            '</div></td>';

          tbody.appendChild(tr);
          tbody.appendChild(detailTr);
        });

        attachEventListeners();
      })
      .catch(function() {});
  }

  // Rebuild the dispatches table (no expand state to preserve, so a
  // targeted rebuild is safe — we only touch the tbody)
  function refreshDispatches() {
    fetchJson("/api/dispatches")
      .then(function(dispatches) {
        var heading = document.querySelector("#dispatches h2");
        if (heading) {
          heading.innerHTML = 'Recent Dispatches <span class="count">(' + dispatches.length + ')</span>';
        }

        var tbody = document.querySelector("#dispatches tbody");
        if (!tbody) return;

        // Build new HTML for the tbody
        var html = "";
        dispatches.forEach(function(d) {
          var duration = (d.startedAt && d.endedAt)
            ? fmtDuration(new Date(d.endedAt).getTime() - new Date(d.startedAt).getTime())
            : "&mdash;";
          var statusCls = d.status === "success" ? "badge-completed"
            : d.status === "error" ? "badge-failed" : "badge-alt";

          html += '<tr>' +
            '<td class="mono">' + esc(d.eventId) + '</td>' +
            '<td class="mono">' + esc(d.handlerName) + '</td>' +
            '<td><span class="badge badge-alt">' + esc(d.handlerType) + '</span>' +
              (d.noticeType ? ' <span class="badge badge-alt">' + esc(d.noticeType) + '</span>' : '') + '</td>' +
            '<td>' + (d.status ? '<span class="badge ' + statusCls + '">' + esc(d.status) + '</span>' : '&mdash;') + '</td>' +
            '<td class="mono nowrap">' + duration + '</td>' +
            '<td class="nowrap">' + (d.startedAt ? fmtDateTime(d.startedAt) : '&mdash;') + '</td>' +
            '</tr>';
          if (d.error) {
            html += '<tr class="error-row"><td colspan="6"><div class="error-detail">' + esc(d.error) + '</div></td></tr>';
          }
        });

        // Only update if content actually changed (avoid flicker)
        if (tbody.innerHTML !== html) {
          tbody.innerHTML = html;
        }
      })
      .catch(function() {});
  }

  // --- Start polling ---
  setInterval(function() {
    refreshEvents();
    refreshDispatches();
    refreshClockStatus();
    refreshTimestamp();
  }, POLL_INTERVAL);
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
  .badge-event {
    font-family: var(--mono);
    font-size: 0.72rem;
  }
  .badge-posted { background: rgba(108,140,255,0.15); color: var(--accent); }
  .badge-active { background: rgba(251,191,36,0.15); color: var(--amber); }
  .badge-completed { background: rgba(74,222,128,0.15); color: var(--green); }
  .badge-cancelled { background: rgba(255,255,255,0.06); color: var(--text-muted); }
  .badge-failed { background: rgba(248,113,113,0.15); color: var(--red); }

  /* Clock status badges */
  .badge-clock-running {
    background: rgba(74,222,128,0.15);
    color: var(--green);
  }
  .badge-clock-stopped {
    background: rgba(255,255,255,0.06);
    color: var(--text-muted);
  }

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

  /* Daemon status card */
  .status-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.25rem;
  }
  .status-card.status-running {
    border-color: rgba(74,222,128,0.3);
  }
  .status-card.status-stopped {
    border-color: var(--border);
  }
  .status-indicator {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 0.5rem;
  }
  .status-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }
  .status-running .status-dot {
    background: var(--green);
    box-shadow: 0 0 6px rgba(74,222,128,0.4);
  }
  .status-stopped .status-dot {
    background: var(--text-muted);
  }
  .status-label {
    font-weight: 600;
    font-size: 1rem;
  }
  .status-running .status-label { color: var(--green); }
  .status-stopped .status-label { color: var(--text-muted); }
  .status-details {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.3rem 0.75rem;
    font-size: 0.85rem;
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border);
  }
  .status-details dt {
    color: var(--text-muted);
    font-weight: 500;
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
  tbody tr:hover:not(.detail-row):not(.error-row) { background: rgba(255,255,255,0.02); }
  .nowrap { white-space: nowrap; }

  /* Event rows — clickable */
  .event-row { cursor: pointer; }
  .event-row.selected { background: rgba(108,140,255,0.06); }
  .expand-cell { width: 1.5rem; text-align: center; }
  .expand-icon {
    display: inline-block;
    font-size: 0.7rem;
    color: var(--text-muted);
    transition: transform 0.15s;
  }

  /* Detail row — expandable panel below event */
  .detail-row td {
    padding: 0;
    border-bottom: none;
  }
  .detail-row.hidden { display: none; }
  .detail-panel {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin: 0.25rem 0.75rem 0.75rem 2rem;
    padding: 1rem 1.25rem;
  }
  .detail-panel h4 {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-muted);
    margin-bottom: 0.5rem;
  }
  .payload-json {
    font-family: var(--mono);
    font-size: 0.78rem;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.75rem;
    overflow-x: auto;
    white-space: pre;
    line-height: 1.5;
  }

  /* Error detail row */
  .error-row td {
    padding: 0;
    border-bottom: 1px solid rgba(255,255,255,0.03);
  }
  .error-detail {
    font-family: var(--mono);
    font-size: 0.78rem;
    color: var(--red);
    background: rgba(248,113,113,0.06);
    border-left: 3px solid var(--red);
    margin: 0 0.75rem 0.5rem 0.75rem;
    padding: 0.5rem 0.75rem;
    white-space: pre-wrap;
    word-break: break-all;
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
  .muted { color: var(--text-muted); font-size: 0.85rem; }
  .empty {
    color: var(--text-muted);
    font-style: italic;
    padding: 1rem 0;
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
  }
`;
