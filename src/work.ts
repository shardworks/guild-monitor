import type { CommissionSummary, WorkshopEntry } from "@shardworks/nexus-core";
import { renderTopNav, renderHeader } from "./clockworks.js";

const PAGE_SIZE = 15;

/**
 * Render the Work section — commission list with drill-down into
 * works, pieces, jobs, and strokes.
 */
export function renderWorkPage(
  commissions: CommissionSummary[],
  workshops: Record<string, WorkshopEntry>,
  page: number,
  guildName: string,
  nexus: string,
  model: string,
  clockRunning: boolean,
): string {
  const totalPages = Math.max(1, Math.ceil(commissions.length / PAGE_SIZE));
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = commissions.slice(start, start + PAGE_SIZE);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(guildName)} — Work</title>
  <style>${CSS}</style>
</head>
<body>
  ${renderHeader(guildName, nexus, model, clockRunning)}
  ${renderTopNav("work")}
  <main>
    <section id="create-commission">
      <h2>New Commission</h2>
      ${renderCreateForm(workshops)}
    </section>
    <section id="commission-list">
      <h2>Commissions <span class="count">(${commissions.length})</span></h2>
      ${renderCommissionList(pageItems)}
      ${renderPagination(currentPage, totalPages)}
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
// Sub-renderers
// ---------------------------------------------------------------------------

function renderCommissionList(items: CommissionSummary[]): string {
  if (items.length === 0) {
    return `<p class="empty">No commissions found.</p>`;
  }
  return `<div class="table-wrap"><table>
    <thead>
      <tr>
        <th></th>
        <th>ID</th>
        <th>Status</th>
        <th>Workshop</th>
        <th>Spec</th>
        <th>Created</th>
        <th>Updated</th>
      </tr>
    </thead>
    <tbody>${items.map((c) => {
      const preview = truncate(c.content, 120);
      return `<tr class="commission-row" data-commission-id="${esc(c.id)}">
        <td class="expand-cell"><span class="expand-icon">&#9654;</span></td>
        <td class="mono">${esc(c.id)}</td>
        <td>${statusBadge(c.status)}</td>
        <td class="mono">${esc(c.workshop)}</td>
        <td class="spec-preview">${esc(preview)}</td>
        <td class="nowrap">${formatDate(c.createdAt)}</td>
        <td class="nowrap">${formatDate(c.updatedAt)}</td>
      </tr>
      <tr class="detail-row hidden" id="detail-${esc(c.id)}">
        <td colspan="7">
          <div class="detail-panel">
            <div class="detail-loading">Loading&hellip;</div>
          </div>
        </td>
      </tr>`;
    }).join("")}
    </tbody>
  </table></div>`;
}

function renderPagination(current: number, total: number): string {
  if (total <= 1) return "";

  const links: string[] = [];

  if (current > 1) {
    links.push(`<a href="/work?page=${current - 1}" class="page-link">&laquo; Prev</a>`);
  } else {
    links.push(`<span class="page-link disabled">&laquo; Prev</span>`);
  }

  for (let i = 1; i <= total; i++) {
    if (i === current) {
      links.push(`<span class="page-link active">${i}</span>`);
    } else {
      links.push(`<a href="/work?page=${i}" class="page-link">${i}</a>`);
    }
  }

  if (current < total) {
    links.push(`<a href="/work?page=${current + 1}" class="page-link">Next &raquo;</a>`);
  } else {
    links.push(`<span class="page-link disabled">Next &raquo;</span>`);
  }

  return `<div class="pagination">${links.join("")}</div>`;
}

function renderCreateForm(workshops: Record<string, WorkshopEntry>): string {
  const workshopNames = Object.keys(workshops);
  const options = workshopNames.length > 0
    ? workshopNames.map((name) => `<option value="${esc(name)}">${esc(name)}</option>`).join("")
    : `<option value="" disabled>No workshops available</option>`;

  return `<form method="POST" action="/api/commissions" class="create-form">
    <div class="form-row">
      <label for="workshop">Workshop</label>
      <select id="workshop" name="workshop" required>
        <option value="">Select a workshop&hellip;</option>
        ${options}
      </select>
    </div>
    <div class="form-row">
      <label for="spec">Specification</label>
      <textarea id="spec" name="spec" rows="8" required
        placeholder="Describe what needs to be done&hellip;"></textarea>
    </div>
    <div class="form-actions">
      <button type="submit">Post Commission</button>
    </div>
  </form>`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusBadge(status: string): string {
  const cls = STATUS_CLASSES[status] ?? "badge-alt";
  return `<span class="badge ${cls}">${esc(status)}</span>`;
}

const STATUS_CLASSES: Record<string, string> = {
  posted: "badge-posted",
  active: "badge-active",
  in_progress: "badge-active",
  open: "badge-posted",
  completed: "badge-completed",
  cancelled: "badge-cancelled",
  failed: "badge-failed",
  pending: "badge-posted",
  complete: "badge-completed",
};

function truncate(text: string, maxLen: number): string {
  const firstLine = text.split("\n")[0] ?? "";
  const base = firstLine.length > maxLen ? firstLine.slice(0, maxLen) : firstLine;
  return base.length < firstLine.length ? base + "\u2026" : base;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
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
// Client-side JavaScript — progressive drill-down into commission hierarchy
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
      failed: "badge-failed", pending: "badge-posted", complete: "badge-completed"
    }[status] || "badge-alt";
    return '<span class="badge ' + cls + '">' + esc(status) + '</span>';
  }

  function fmtDate(iso) {
    try { return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }); }
    catch(e) { return esc(iso); }
  }

  function truncate(text, max) {
    var line = (text || "").split("\\n")[0] || "";
    return line.length > max ? line.slice(0, max) + "\\u2026" : line;
  }

  // --- Data fetching ---

  function fetchJson(url) {
    return fetch(url).then(function(r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  // --- Render hierarchy sections (writ-based) ---

  function renderWritChildren(children) {
    if (children.length === 0) return '<p class="empty">No child writs.</p>';
    var html = '<div class="hierarchy-section">';
    html += '<div class="hierarchy-list">';
    children.forEach(function(w) {
      var hasChildren = w.childCount > 0;
      html += '<div class="hierarchy-item" data-type="writ" data-id="' + esc(w.id) + '">';
      html += '<div class="hierarchy-header">';
      if (hasChildren) {
        html += '<span class="expand-icon">&#9654;</span> ';
      } else {
        html += '<span class="expand-icon" style="visibility:hidden">&#9654;</span> ';
      }
      html += '<span class="mono">' + esc(w.id) + '</span> ';
      html += '<span class="badge badge-alt">' + esc(w.type) + '</span> ';
      html += badge(w.status) + ' ';
      html += '<strong>' + esc(w.title) + '</strong>';
      if (hasChildren) {
        html += ' <span class="text-muted">(' + w.completedCount + '/' + w.childCount + ' done)</span>';
      }
      html += '</div>';
      if (hasChildren) {
        html += '<div class="hierarchy-children hidden"></div>';
      }
      html += '</div>';
    });
    html += '</div></div>';
    return html;
  }

  // --- Expand/collapse logic ---

  function attachCommissionListeners() {
    document.querySelectorAll(".commission-row").forEach(function(row) {
      if (row.dataset.bound) return;
      row.dataset.bound = "1";

      row.addEventListener("click", function() {
        var id = row.dataset.commissionId;
        var detailRow = document.getElementById("detail-" + id);
        if (!detailRow) return;

        var isHidden = detailRow.classList.contains("hidden");
        var icon = row.querySelector(".expand-icon");

        if (isHidden) {
          detailRow.classList.remove("hidden");
          row.classList.add("selected");
          if (icon) icon.innerHTML = "&#9660;";

          // Load child writs if not yet loaded
          var panel = detailRow.querySelector(".detail-panel");
          if (panel && panel.querySelector(".detail-loading")) {
            fetchJson("/api/writs/" + encodeURIComponent(id) + "/children")
              .then(function(children) {
                panel.innerHTML = renderWritChildren(children);
                attachHierarchyListeners(panel);
              })
              .catch(function(err) {
                panel.innerHTML = '<p class="empty">Failed to load children: ' + esc(err.message) + '</p>';
              });
          }
        } else {
          detailRow.classList.add("hidden");
          row.classList.remove("selected");
          if (icon) icon.innerHTML = "&#9654;";
        }
      });
    });
  }

  // Hierarchy item toggle — generic writ children drill-down
  function attachHierarchyListeners(container) {
    container.querySelectorAll(".hierarchy-item").forEach(function(item) {
      // Only attach to direct header, not nested items
      var header = item.querySelector(".hierarchy-header");
      if (!header || header.dataset.bound) return;
      header.dataset.bound = "1";

      header.addEventListener("click", function(e) {
        e.stopPropagation();
        var id = item.dataset.id;
        var children = item.querySelector(".hierarchy-children");
        var icon = header.querySelector(".expand-icon");
        if (!children) return;

        var isHidden = children.classList.contains("hidden");

        if (isHidden) {
          children.classList.remove("hidden");
          if (icon) icon.innerHTML = "&#9660;";

          // Fetch children if empty
          if (children.innerHTML.trim() === "") {
            children.innerHTML = '<span class="text-muted">Loading&hellip;</span>';
            fetchJson("/api/writs/" + encodeURIComponent(id) + "/children")
              .then(function(data) {
                children.innerHTML = renderWritChildren(data);
                attachHierarchyListeners(children);
              })
              .catch(function(err) {
                children.innerHTML = '<p class="empty">Failed to load: ' + esc(err.message) + '</p>';
              });
          }
        } else {
          children.classList.add("hidden");
          if (icon) icon.innerHTML = "&#9654;";
        }
      });
    });
  }

  // --- Initial binding ---
  attachCommissionListeners();

  // =========================================================================
  // Auto-refresh — poll for changes and patch the DOM without flickering
  // =========================================================================

  var POLL_INTERVAL = 3000; // 3 seconds

  // Track the current page from the URL
  function currentPage() {
    var params = new URLSearchParams(window.location.search);
    return Math.max(1, parseInt(params.get("page") || "1", 10) || 1);
  }

  // Update the clock status badge in the header without a full redraw
  function refreshClockStatus() {
    fetchJson("/api/clock-status")
      .then(function(data) {
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
      .catch(function() { /* silent — next poll will retry */ });
  }

  // Update the footer timestamp
  function refreshTimestamp() {
    var footer = document.querySelector("footer p");
    if (footer) {
      footer.innerHTML = "Guild Monitor &middot; Refreshed at " + new Date().toLocaleTimeString();
    }
  }

  // Patch the commission table in place — update existing rows, add new ones,
  // remove stale ones, all while preserving expand/collapse state.
  function refreshCommissions() {
    var page = currentPage();
    fetchJson("/api/commissions?page=" + page)
      .then(function(data) {
        var items = data.items || [];
        var total = data.total || 0;

        // Update the section heading count
        var heading = document.querySelector("#commission-list h2");
        if (heading) {
          heading.innerHTML = 'Commissions <span class="count">(' + total + ')</span>';
        }

        var tbody = document.querySelector("#commission-list tbody");
        if (!tbody) return;

        // Build a set of IDs we received
        var newIds = {};
        items.forEach(function(c) { newIds[c.id] = c; });

        // Track which IDs are already in the DOM
        var existingRows = tbody.querySelectorAll(".commission-row");
        var existingIds = {};
        existingRows.forEach(function(row) {
          existingIds[row.dataset.commissionId] = row;
        });

        // Update existing rows in place (status, dates, spec) — skip if expanded
        Object.keys(existingIds).forEach(function(id) {
          var c = newIds[id];
          var row = existingIds[id];
          if (!c) {
            // Commission no longer on this page — remove both rows
            var detail = document.getElementById("detail-" + id);
            if (detail) detail.remove();
            row.remove();
            return;
          }
          // Patch cells: [expand, id, status, workshop, spec, created, updated]
          var cells = row.querySelectorAll("td");
          if (cells.length >= 7) {
            // Status badge (cell 2)
            var newBadge = badge(c.status);
            if (cells[2].innerHTML !== newBadge) cells[2].innerHTML = newBadge;
            // Spec preview (cell 4)
            var newSpec = esc(truncate(c.content, 120));
            if (cells[4].textContent !== truncate(c.content, 120)) cells[4].innerHTML = newSpec;
            // Updated date (cell 6)
            var newDate = fmtDate(c.updatedAt);
            if (cells[6].textContent !== newDate) cells[6].textContent = newDate;
          }
        });

        // Add new commissions that weren't in the DOM
        items.forEach(function(c) {
          if (existingIds[c.id]) return;
          // Build the two rows (commission + detail) and append to tbody
          var frag = document.createDocumentFragment();
          var tr = document.createElement("tr");
          tr.className = "commission-row";
          tr.dataset.commissionId = c.id;
          tr.innerHTML =
            '<td class="expand-cell"><span class="expand-icon">&#9654;</span></td>' +
            '<td class="mono">' + esc(c.id) + '</td>' +
            '<td>' + badge(c.status) + '</td>' +
            '<td class="mono">' + esc(c.workshop) + '</td>' +
            '<td class="spec-preview">' + esc(truncate(c.content, 120)) + '</td>' +
            '<td class="nowrap">' + fmtDate(c.createdAt) + '</td>' +
            '<td class="nowrap">' + fmtDate(c.updatedAt) + '</td>';
          frag.appendChild(tr);

          var detailTr = document.createElement("tr");
          detailTr.className = "detail-row hidden";
          detailTr.id = "detail-" + c.id;
          detailTr.innerHTML =
            '<td colspan="7"><div class="detail-panel">' +
            '<div class="detail-loading">Loading&hellip;</div>' +
            '</div></td>';
          frag.appendChild(detailTr);

          tbody.appendChild(frag);
        });

        // Re-bind click handlers for any new rows
        attachCommissionListeners();
      })
      .catch(function() { /* silent — next poll will retry */ });
  }

  // --- Start polling ---
  setInterval(function() {
    refreshCommissions();
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
  .badge-posted { background: rgba(108,140,255,0.15); color: var(--accent); }
  .badge-active { background: rgba(251,191,36,0.15); color: var(--amber); }
  .badge-completed { background: rgba(74,222,128,0.15); color: var(--green); }
  .badge-cancelled { background: rgba(255,255,255,0.06); color: var(--text-muted); }
  .badge-failed { background: rgba(248,113,113,0.15); color: var(--red); }
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

  /* Sub Nav */
  nav:not(.top-nav) {
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    padding: 0 2rem;
    display: flex;
    gap: 0;
    max-width: 100%;
    overflow-x: auto;
  }
  nav:not(.top-nav) a {
    color: var(--text-muted);
    text-decoration: none;
    font-size: 0.8rem;
    font-weight: 500;
    padding: 0.6rem 1rem;
    border-bottom: 2px solid transparent;
    transition: color 0.15s, border-color 0.15s;
    white-space: nowrap;
  }
  nav:not(.top-nav) a:hover {
    color: var(--text);
    border-bottom-color: var(--accent-dim);
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
  tbody tr:hover:not(.detail-row) { background: rgba(255,255,255,0.02); }
  .spec-preview {
    max-width: 360px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-muted);
    font-size: 0.82rem;
  }
  .nowrap { white-space: nowrap; }

  /* Commission rows — clickable */
  .commission-row { cursor: pointer; }
  .commission-row.selected { background: rgba(108,140,255,0.06); }
  .expand-cell { width: 1.5rem; text-align: center; }
  .expand-icon {
    display: inline-block;
    font-size: 0.7rem;
    color: var(--text-muted);
    transition: transform 0.15s;
  }

  /* Detail row — expandable panel below commission */
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
  .detail-loading {
    color: var(--text-muted);
    font-style: italic;
    font-size: 0.85rem;
  }

  /* Hierarchy tree */
  .hierarchy-section { margin-bottom: 0.75rem; }
  .hierarchy-section:last-child { margin-bottom: 0; }
  .hierarchy-section h4 {
    font-size: 0.88rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
    color: var(--text);
  }
  .hierarchy-list {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .hierarchy-item {
    border-left: 2px solid var(--border);
    padding-left: 0.75rem;
  }
  .hierarchy-header {
    cursor: pointer;
    padding: 0.35rem 0.5rem;
    border-radius: 4px;
    font-size: 0.82rem;
    transition: background 0.1s;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .hierarchy-header:hover { background: rgba(255,255,255,0.03); }
  .hierarchy-children {
    margin-left: 0.75rem;
    padding-top: 0.25rem;
    padding-bottom: 0.25rem;
  }
  .hierarchy-children.hidden { display: none; }
  .text-muted { color: var(--text-muted); }

  /* Strokes (leaf nodes — no expand) */
  .stroke-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .stroke-item {
    padding: 0.3rem 0.5rem;
    font-size: 0.82rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    border-left: 2px solid var(--border);
    padding-left: 0.75rem;
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

  /* Form */
  .create-form {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .form-row {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .form-row label {
    font-size: 0.82rem;
    font-weight: 500;
    color: var(--text-muted);
  }
  .form-row select,
  .form-row textarea {
    font-family: var(--sans);
    font-size: 0.88rem;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.5rem 0.65rem;
    outline: none;
    transition: border-color 0.15s;
  }
  .form-row select:focus,
  .form-row textarea:focus {
    border-color: var(--accent);
  }
  .form-row textarea {
    font-family: var(--mono);
    font-size: 0.82rem;
    resize: vertical;
    min-height: 120px;
  }
  .form-actions {
    display: flex;
    justify-content: flex-end;
  }
  .form-actions button {
    font-family: var(--sans);
    font-size: 0.85rem;
    font-weight: 500;
    padding: 0.5rem 1.5rem;
    border: none;
    border-radius: 4px;
    background: var(--accent);
    color: #fff;
    cursor: pointer;
    transition: background 0.15s;
  }
  .form-actions button:hover {
    background: #5a7be6;
  }

  /* Utility */
  .mono { font-family: var(--mono); font-size: 0.82rem; }
  .muted { color: var(--text-muted); font-size: 0.85rem; }
  .empty {
    color: var(--text-muted);
    font-style: italic;
    padding: 1rem 0;
  }

  /* Success/Error messages */
  .message {
    padding: 0.75rem 1rem;
    border-radius: var(--radius);
    font-size: 0.85rem;
    margin-bottom: 1rem;
  }
  .message-success {
    background: rgba(74,222,128,0.1);
    border: 1px solid rgba(74,222,128,0.3);
    color: var(--green);
  }
  .message-error {
    background: rgba(248,113,113,0.1);
    border: 1px solid rgba(248,113,113,0.3);
    color: var(--red);
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
