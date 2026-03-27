import type { WritRecord, WorkshopEntry, WritTypeDeclaration } from "@shardworks/nexus-core";
import { renderTopNav, renderHeader } from "./clockworks.js";

const PAGE_SIZE = 20;

/** Statuses used for filter buttons. */
const STATUSES = ["all", "ready", "active", "pending", "completed", "failed", "cancelled"] as const;

// ---------------------------------------------------------------------------
// Public render entry point
// ---------------------------------------------------------------------------

export interface WorkPageData {
  /** Top-level writs (or children of the focused writ). */
  writs: WritRecord[];
  /** Total writ count (for heading). */
  totalCount: number;
  /** Guild workshops keyed by name. */
  workshops: Record<string, WorkshopEntry>;
  /** Custom writ types declared in guild.json. */
  writTypes: Record<string, WritTypeDeclaration>;
  /** Currently active status filter (from query param). */
  statusFilter: string;
  /** Current page number. */
  page: number;
  /** If drilling into a specific writ, its record + ancestor breadcrumb. */
  focusedWrit?: WritRecord | null;
  /** Breadcrumb trail from root to focused writ (root first). */
  breadcrumb?: WritRecord[];
  /** Child summary for focused writ (count / completed). */
  focusedChildStats?: { childCount: number; completedCount: number };
  /** Guild name for page chrome. */
  guildName: string;
  nexus: string;
  model: string;
  clockRunning: boolean;
}

/**
 * Render the Work page — writ posting form, status filters, and writ table
 * with inline expand + drill-down navigation.
 */
export function renderWorkPage(data: WorkPageData): string {
  const {
    writs, totalCount, workshops, writTypes, statusFilter,
    page, focusedWrit, breadcrumb, focusedChildStats,
    guildName, nexus, model, clockRunning,
  } = data;

  const totalPages = Math.max(1, Math.ceil(writs.length / PAGE_SIZE));
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = writs.slice(start, start + PAGE_SIZE);

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
    ${focusedWrit ? renderWritDetail(focusedWrit, breadcrumb ?? [], focusedChildStats) : renderCreateForm(workshops, writTypes)}
    <section id="writ-list">
      ${focusedWrit
        ? `<h2>Children <span class="count">(${totalCount})</span></h2>`
        : `<h2>Writs <span class="count">(${totalCount})</span></h2>`}
      ${renderStatusFilters(statusFilter, focusedWrit?.id)}
      ${renderWritTable(pageItems)}
      ${renderPagination(currentPage, totalPages, statusFilter, focusedWrit?.id)}
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

function renderCreateForm(
  workshops: Record<string, WorkshopEntry>,
  writTypes: Record<string, WritTypeDeclaration>,
): string {
  const workshopNames = Object.keys(workshops);
  const workshopOptions = workshopNames.length > 0
    ? workshopNames.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("")
    : "";

  // Build type options: builtin "writ" + any guild-declared types
  const customTypes = Object.keys(writTypes);
  const allTypes = ["writ", ...customTypes.filter((t) => t !== "writ")];
  const typeOptions = allTypes
    .map((t) => `<option value="${esc(t)}"${t === "writ" ? " selected" : ""}>${esc(t)}</option>`)
    .join("");

  return `<section id="post-writ">
    <h2>Post Writ</h2>
    <form id="writ-form" class="create-form">
      <div class="form-row-inline">
        <div class="form-row">
          <label for="workshop">Workshop</label>
          <select id="workshop" name="workshop">
            <option value="">No workshop</option>
            ${workshopOptions}
          </select>
        </div>
        <div class="form-row">
          <label for="writ-type">Type</label>
          <select id="writ-type" name="type">
            ${typeOptions}
          </select>
        </div>
      </div>
      <div class="form-row">
        <label for="content">Content <span class="text-muted">(first line = title)</span></label>
        <textarea id="content" name="content" rows="6" required
          placeholder="First line becomes the title.&#10;&#10;Remaining lines become the description..."></textarea>
      </div>
      <div class="form-actions">
        <span id="form-message" class="form-message"></span>
        <button type="submit" id="submit-btn">Post Writ</button>
      </div>
    </form>
  </section>`;
}

function renderWritDetail(
  writ: WritRecord,
  breadcrumb: WritRecord[],
  childStats?: { childCount: number; completedCount: number },
): string {
  const crumbs = breadcrumb.map(
    (w) => `<a href="/work?writ=${encodeURIComponent(w.id)}" class="breadcrumb-link">${esc(w.title || w.id)}</a>`,
  );
  // Add "All Writs" root link
  crumbs.unshift(`<a href="/work" class="breadcrumb-link">All Writs</a>`);
  // Current writ as final (non-linked) crumb
  crumbs.push(`<span class="breadcrumb-current">${esc(writ.title || writ.id)}</span>`);

  const progressHtml = childStats && childStats.childCount > 0
    ? `<span class="text-muted">${childStats.completedCount} / ${childStats.childCount} children done</span>`
    : "";

  return `<section id="writ-detail">
    <div class="breadcrumb">${crumbs.join('<span class="breadcrumb-sep">/</span>')}</div>
    <div class="detail-card">
      <div class="detail-card-header">
        <span class="mono">${esc(writ.id)}</span>
        <span class="badge badge-alt">${esc(writ.type)}</span>
        ${statusBadge(writ.status)}
        ${writ.workshop ? `<span class="text-muted">workshop: ${esc(writ.workshop)}</span>` : ""}
        ${progressHtml}
      </div>
      <h2 class="detail-title">${esc(writ.title)}</h2>
      ${writ.description ? `<pre class="detail-description">${esc(writ.description)}</pre>` : ""}
      <div class="detail-meta">
        <span>Source: ${esc(writ.sourceType ?? "unknown")}</span>
        ${writ.sessionId ? `<span>Session: <span class="mono">${esc(writ.sessionId)}</span></span>` : ""}
        <span>Created: ${formatDate(writ.createdAt)}</span>
        <span>Updated: ${formatDate(writ.updatedAt)}</span>
      </div>
    </div>
  </section>`;
}

function renderStatusFilters(active: string, focusedWritId?: string): string {
  const baseUrl = focusedWritId ? `/work?writ=${encodeURIComponent(focusedWritId)}` : "/work";
  const buttons = STATUSES.map((s) => {
    const isActive = s === active;
    const href = s === "all"
      ? baseUrl
      : `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}status=${s}`;
    return `<a href="${href}" class="filter-btn${isActive ? " filter-active" : ""}">${s === "all" ? "All" : capitalize(s)}</a>`;
  });
  return `<div class="status-filters">${buttons.join("")}</div>`;
}

function renderWritTable(items: WritRecord[]): string {
  if (items.length === 0) {
    return `<p class="empty">No writs found.</p>`;
  }
  return `<div class="table-wrap"><table>
    <thead>
      <tr>
        <th></th>
        <th>ID</th>
        <th>Type</th>
        <th>Status</th>
        <th>Workshop</th>
        <th>Title</th>
        <th>Children</th>
        <th>Created</th>
        <th></th>
      </tr>
    </thead>
    <tbody>${items.map((w) => {
      const title = truncate(w.title, 80);
      return `<tr class="writ-row" data-writ-id="${esc(w.id)}">
        <td class="expand-cell"><span class="expand-icon" data-writ-id="${esc(w.id)}">&#9654;</span></td>
        <td class="mono">${esc(w.id)}</td>
        <td><span class="badge badge-alt">${esc(w.type)}</span></td>
        <td>${statusBadge(w.status)}</td>
        <td class="mono">${esc(w.workshop ?? "")}</td>
        <td class="title-cell">${esc(title)}</td>
        <td class="children-cell" data-writ-id="${esc(w.id)}"></td>
        <td class="nowrap">${formatDate(w.createdAt)}</td>
        <td class="drill-cell"><a href="/work?writ=${encodeURIComponent(w.id)}" class="drill-link" title="Open writ">&rarr;</a></td>
      </tr>
      <tr class="detail-row hidden" id="detail-${esc(w.id)}">
        <td colspan="9">
          <div class="detail-panel">
            <div class="detail-loading">Loading&hellip;</div>
          </div>
        </td>
      </tr>`;
    }).join("")}
    </tbody>
  </table></div>`;
}

function renderPagination(
  current: number,
  total: number,
  statusFilter: string,
  focusedWritId?: string,
): string {
  if (total <= 1) return "";

  function pageUrl(p: number): string {
    const params = new URLSearchParams();
    if (focusedWritId) params.set("writ", focusedWritId);
    if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/work${qs ? "?" + qs : ""}`;
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_CLASSES: Record<string, string> = {
  ready: "badge-posted",
  active: "badge-active",
  pending: "badge-pending",
  completed: "badge-completed",
  failed: "badge-failed",
  cancelled: "badge-cancelled",
};

function statusBadge(status: string): string {
  const cls = STATUS_CLASSES[status] ?? "badge-alt";
  return `<span class="badge ${cls}">${esc(status)}</span>`;
}

function truncate(text: string, maxLen: number): string {
  const firstLine = text.split("\n")[0] ?? "";
  return firstLine.length > maxLen ? firstLine.slice(0, maxLen) + "\u2026" : firstLine;
}

function formatDate(iso: string): string {
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

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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
// Client-side JavaScript
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
      ready: "badge-posted", active: "badge-active", pending: "badge-pending",
      completed: "badge-completed", failed: "badge-failed", cancelled: "badge-cancelled"
    }[status] || "badge-alt";
    return '<span class="badge ' + cls + '">' + esc(status) + '</span>';
  }

  function fmtDate(iso) {
    try {
      return new Date(iso).toLocaleDateString("en-US", {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit"
      });
    } catch(e) { return esc(iso); }
  }

  function truncate(text, max) {
    var line = (text || "").split("\\n")[0] || "";
    return line.length > max ? line.slice(0, max) + "\\u2026" : line;
  }

  function fetchJson(url) {
    return fetch(url).then(function(r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  // --- Post writ form (JSON submit) ---

  var form = document.getElementById("writ-form");
  if (form) {
    form.addEventListener("submit", function(e) {
      e.preventDefault();
      var btn = document.getElementById("submit-btn");
      var msg = document.getElementById("form-message");
      var workshop = document.getElementById("workshop").value;
      var type = document.getElementById("writ-type").value;
      var content = document.getElementById("content").value.trim();
      if (!content) return;

      btn.disabled = true;
      btn.textContent = "Posting...";
      msg.textContent = "";
      msg.className = "form-message";

      fetch("/api/writs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workshop: workshop || null, type: type, content: content })
      })
      .then(function(r) {
        if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || "HTTP " + r.status); });
        return r.json();
      })
      .then(function(data) {
        document.getElementById("content").value = "";
        msg.textContent = "Writ posted: " + data.id;
        msg.className = "form-message form-message-ok";
        refreshWrits();
      })
      .catch(function(err) {
        msg.textContent = "Error: " + err.message;
        msg.className = "form-message form-message-err";
      })
      .finally(function() {
        btn.disabled = false;
        btn.textContent = "Post Writ";
      });
    });
  }

  // --- Inline child expand (up to 2 levels) ---

  function renderChildTable(children, depth) {
    if (!children || children.length === 0) return '<p class="empty">No children.</p>';
    var canExpand = depth < 2;
    var html = '<table class="nested-table"><thead><tr>';
    if (canExpand) html += '<th></th>';
    html += '<th>ID</th><th>Type</th><th>Status</th><th>Title</th><th>Children</th><th></th>';
    html += '</tr></thead><tbody>';
    children.forEach(function(c) {
      var hasKids = c.childCount > 0;
      html += '<tr class="writ-child-row" data-writ-id="' + esc(c.id) + '" data-depth="' + depth + '">';
      if (canExpand) {
        html += '<td class="expand-cell">';
        if (hasKids) {
          html += '<span class="expand-icon child-expand" data-writ-id="' + esc(c.id) + '">&#9654;</span>';
        }
        html += '</td>';
      }
      html += '<td class="mono">' + esc(c.id) + '</td>';
      html += '<td>' + badge(c.type || "writ") + '</td>';
      html += '<td>' + badge(c.status) + '</td>';
      html += '<td class="title-cell">' + esc(truncate(c.title, 60)) + '</td>';
      html += '<td>';
      if (hasKids) {
        html += '<span class="progress-indicator">' + c.completedCount + ' / ' + c.childCount + ' done</span>';
      }
      html += '</td>';
      html += '<td><a href="/work?writ=' + encodeURIComponent(c.id) + '" class="drill-link" title="Open">&rarr;</a></td>';
      html += '</tr>';
      if (canExpand && hasKids) {
        html += '<tr class="inline-children hidden" id="inline-' + esc(c.id) + '"><td colspan="7"><div class="inline-panel"></div></td></tr>';
      }
    });
    html += '</tbody></table>';
    return html;
  }

  function attachExpandListeners(container, depth) {
    container.querySelectorAll(".child-expand").forEach(function(icon) {
      if (icon.dataset.bound) return;
      icon.dataset.bound = "1";
      icon.addEventListener("click", function(e) {
        e.stopPropagation();
        var id = icon.dataset.writId;
        var inlineRow = document.getElementById("inline-" + id);
        if (!inlineRow) return;
        var isHidden = inlineRow.classList.contains("hidden");
        if (isHidden) {
          inlineRow.classList.remove("hidden");
          icon.innerHTML = "&#9660;";
          var panel = inlineRow.querySelector(".inline-panel");
          if (panel && !panel.dataset.loaded) {
            panel.innerHTML = '<span class="text-muted">Loading...</span>';
            fetchJson("/api/writs/" + encodeURIComponent(id) + "/children")
              .then(function(children) {
                panel.dataset.loaded = "1";
                panel.innerHTML = renderChildTable(children, depth + 1);
                attachExpandListeners(panel, depth + 1);
              })
              .catch(function(err) {
                panel.innerHTML = '<p class="empty">Failed: ' + esc(err.message) + '</p>';
              });
          }
        } else {
          inlineRow.classList.add("hidden");
          icon.innerHTML = "&#9654;";
        }
      });
    });
  }

  // --- Top-level row expand ---

  function attachWritRowListeners() {
    document.querySelectorAll(".writ-row").forEach(function(row) {
      var icon = row.querySelector(".expand-icon");
      if (!icon || icon.dataset.bound) return;
      icon.dataset.bound = "1";
      icon.style.cursor = "pointer";

      icon.addEventListener("click", function(e) {
        e.stopPropagation();
        var id = icon.dataset.writId;
        var detailRow = document.getElementById("detail-" + id);
        if (!detailRow) return;
        var isHidden = detailRow.classList.contains("hidden");
        if (isHidden) {
          detailRow.classList.remove("hidden");
          icon.innerHTML = "&#9660;";
          var panel = detailRow.querySelector(".detail-panel");
          if (panel && panel.querySelector(".detail-loading")) {
            fetchJson("/api/writs/" + encodeURIComponent(id) + "/children")
              .then(function(children) {
                panel.innerHTML = renderChildTable(children, 1);
                attachExpandListeners(panel, 1);
              })
              .catch(function(err) {
                panel.innerHTML = '<p class="empty">Failed: ' + esc(err.message) + '</p>';
              });
          }
        } else {
          detailRow.classList.add("hidden");
          icon.innerHTML = "&#9654;";
        }
      });
    });
  }

  // --- Load child counts + progress into the Children column cells ---

  function loadChildCounts() {
    document.querySelectorAll(".children-cell").forEach(function(cell) {
      if (cell.dataset.loaded) return;
      cell.dataset.loaded = "1";
      var id = cell.dataset.writId;
      fetchJson("/api/writs/" + encodeURIComponent(id) + "/children")
        .then(function(children) {
          if (children.length === 0) {
            cell.innerHTML = "";
            // Hide expand icon for leaf writs
            var icon = document.querySelector('.expand-icon[data-writ-id="' + id + '"]');
            if (icon) icon.style.visibility = "hidden";
          } else {
            var done = children.filter(function(c) { return c.status === "completed"; }).length;
            cell.innerHTML = '<span class="progress-indicator">' + done + ' / ' + children.length + ' done</span>';
          }
        })
        .catch(function() { /* silent */ });
    });
  }

  // --- Auto-refresh polling ---

  var POLL_INTERVAL = 3000;

  function getUrlParam(name) {
    return new URLSearchParams(window.location.search).get(name) || "";
  }

  function refreshClockStatus() {
    fetchJson("/api/clock-status")
      .then(function(data) {
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

  function refreshWrits() {
    var writId = getUrlParam("writ");
    var status = getUrlParam("status");
    var apiUrl;
    if (writId) {
      apiUrl = "/api/writs/" + encodeURIComponent(writId) + "/children";
    } else {
      apiUrl = "/api/writs?topLevel=1";
      if (status) apiUrl += "&status=" + encodeURIComponent(status);
    }

    fetchJson(apiUrl).then(function(items) {
      var tbody = document.querySelector("#writ-list tbody");
      if (!tbody) return;

      // Build lookup of new items
      var newIds = {};
      items.forEach(function(w) { newIds[w.id] = w; });

      // Update existing rows in place
      var existingRows = tbody.querySelectorAll(".writ-row");
      var existingIds = {};
      existingRows.forEach(function(row) { existingIds[row.dataset.writId] = row; });

      // Remove stale rows
      Object.keys(existingIds).forEach(function(id) {
        if (!newIds[id]) {
          var detail = document.getElementById("detail-" + id);
          if (detail) detail.remove();
          existingIds[id].remove();
        }
      });

      // Patch existing rows — update status badge
      Object.keys(existingIds).forEach(function(id) {
        var w = newIds[id];
        if (!w) return;
        var row = existingIds[id];
        var cells = row.querySelectorAll("td");
        // Status is cell index 3
        if (cells.length >= 8) {
          var newBadge = badge(w.status);
          if (cells[3].innerHTML !== newBadge) cells[3].innerHTML = newBadge;
        }
      });

      // Add new rows not already in DOM
      items.forEach(function(w) {
        if (existingIds[w.id]) return;
        var frag = document.createDocumentFragment();
        var tr = document.createElement("tr");
        tr.className = "writ-row";
        tr.dataset.writId = w.id;
        tr.innerHTML =
          '<td class="expand-cell"><span class="expand-icon" data-writ-id="' + esc(w.id) + '">&#9654;</span></td>' +
          '<td class="mono">' + esc(w.id) + '</td>' +
          '<td><span class="badge badge-alt">' + esc(w.type) + '</span></td>' +
          '<td>' + badge(w.status) + '</td>' +
          '<td class="mono">' + esc(w.workshop || "") + '</td>' +
          '<td class="title-cell">' + esc(truncate(w.title, 80)) + '</td>' +
          '<td class="children-cell" data-writ-id="' + esc(w.id) + '"></td>' +
          '<td class="nowrap">' + fmtDate(w.createdAt) + '</td>' +
          '<td class="drill-cell"><a href="/work?writ=' + encodeURIComponent(w.id) + '" class="drill-link" title="Open">&rarr;</a></td>';
        frag.appendChild(tr);

        var detailTr = document.createElement("tr");
        detailTr.className = "detail-row hidden";
        detailTr.id = "detail-" + w.id;
        detailTr.innerHTML = '<td colspan="9"><div class="detail-panel"><div class="detail-loading">Loading&hellip;</div></div></td>';
        frag.appendChild(detailTr);
        tbody.appendChild(frag);
      });

      attachWritRowListeners();
      loadChildCounts();

      // Update heading count
      var heading = document.querySelector("#writ-list h2");
      if (heading) {
        var label = getUrlParam("writ") ? "Children" : "Writs";
        heading.innerHTML = label + ' <span class="count">(' + items.length + ')</span>';
      }
    }).catch(function() {});
  }

  // --- Initial binding ---
  attachWritRowListeners();
  loadChildCounts();

  setInterval(function() {
    refreshWrits();
    refreshClockStatus();
    refreshTimestamp();
  }, POLL_INTERVAL);
})();
`;

// ---------------------------------------------------------------------------
// Styles — matches the design system used by other tabs
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
  .badge-pending { background: rgba(108,140,255,0.10); color: var(--accent); }
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

  /* Status filters */
  .status-filters {
    display: flex;
    gap: 0.35rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }
  .filter-btn {
    display: inline-block;
    padding: 0.3em 0.8em;
    font-size: 0.8rem;
    font-weight: 500;
    border-radius: 4px;
    text-decoration: none;
    color: var(--text-muted);
    background: var(--surface);
    border: 1px solid var(--border);
    transition: background 0.15s, color 0.15s;
  }
  .filter-btn:hover { background: var(--accent-dim); color: var(--text); }
  .filter-active {
    background: var(--accent-dim);
    color: var(--accent);
    border-color: var(--accent-dim);
    font-weight: 600;
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
  tbody tr:hover:not(.detail-row):not(.inline-children) { background: rgba(255,255,255,0.02); }
  .title-cell {
    max-width: 320px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nowrap { white-space: nowrap; }

  /* Nested tables for inline expand */
  .nested-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
  }
  .nested-table thead th {
    font-size: 0.78rem;
    padding: 0.35rem 0.5rem;
  }
  .nested-table tbody td {
    padding: 0.35rem 0.5rem;
  }

  /* Writ rows — expand icon is clickable */
  .writ-row { }
  .expand-cell { width: 1.5rem; text-align: center; }
  .expand-icon {
    display: inline-block;
    font-size: 0.7rem;
    color: var(--text-muted);
    transition: transform 0.15s;
    cursor: pointer;
  }

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

  /* Progress indicator in children column */
  .progress-indicator {
    font-size: 0.78rem;
    color: var(--text-muted);
    white-space: nowrap;
  }

  /* Detail row — expandable panel */
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

  /* Inline children (nested expand) */
  .inline-children td { padding: 0; border-bottom: none; }
  .inline-children.hidden { display: none; }
  .inline-panel {
    margin: 0.25rem 0 0.25rem 1.5rem;
    padding: 0.5rem;
  }

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

  /* Writ detail card */
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
  .detail-title {
    font-size: 1.1rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
    border-bottom: none;
    padding-bottom: 0;
  }
  .detail-description {
    font-family: var(--mono);
    font-size: 0.82rem;
    color: var(--text-muted);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.75rem 1rem;
    margin-bottom: 0.75rem;
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow-x: auto;
    max-height: 300px;
    overflow-y: auto;
  }
  .detail-meta {
    display: flex;
    gap: 1.25rem;
    font-size: 0.78rem;
    color: var(--text-muted);
    flex-wrap: wrap;
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
  .form-row-inline {
    display: flex;
    gap: 1rem;
  }
  .form-row-inline .form-row {
    flex: 1;
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
    min-height: 100px;
  }
  .form-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 1rem;
  }
  .form-message {
    font-size: 0.82rem;
  }
  .form-message-ok { color: var(--green); }
  .form-message-err { color: var(--red); }
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
  .form-actions button:disabled {
    opacity: 0.6;
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
    .form-row-inline { flex-direction: column; }
  }
`;
