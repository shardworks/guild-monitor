import type { CommissionSummary, WorkshopEntry } from "@shardworks/nexus-core";

const PAGE_SIZE = 15;

/**
 * Render the commissions section — list with pagination and create form.
 */
export function renderCommissionsPage(
  commissions: CommissionSummary[],
  workshops: Record<string, WorkshopEntry>,
  page: number,
  guildName: string,
  nexus: string,
  model: string,
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
  <title>${esc(guildName)} — Commissions</title>
  <style>${CSS}</style>
</head>
<body>
  ${renderHeader(guildName, nexus, model)}
  ${renderTopNav("commissions")}
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
    <p>Guild Monitor v0.1.0 &middot; Refreshed at ${new Date().toLocaleTimeString()}</p>
  </footer>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Sub-renderers
// ---------------------------------------------------------------------------

function renderHeader(
  guildName: string,
  nexus: string,
  model: string,
): string {
  return `<header>
    <div class="header-inner">
      <h1>${esc(guildName)}</h1>
      <div class="header-meta">
        <span class="badge">Nexus ${esc(nexus)}</span>
        <span class="badge badge-alt">Model: ${esc(model)}</span>
      </div>
    </div>
  </header>`;
}

function renderCommissionList(items: CommissionSummary[]): string {
  if (items.length === 0) {
    return `<p class="empty">No commissions found.</p>`;
  }
  return `<div class="table-wrap"><table>
    <thead>
      <tr>
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
      return `<tr>
        <td class="mono">${esc(c.id)}</td>
        <td>${statusBadge(c.status)}</td>
        <td class="mono">${esc(c.workshop)}</td>
        <td class="spec-preview">${esc(preview)}</td>
        <td class="nowrap">${formatDate(c.createdAt)}</td>
        <td class="nowrap">${formatDate(c.updatedAt)}</td>
      </tr>`;
    }).join("")}
    </tbody>
  </table></div>`;
}

function renderPagination(current: number, total: number): string {
  if (total <= 1) return "";

  const links: string[] = [];

  if (current > 1) {
    links.push(`<a href="/commissions?page=${current - 1}" class="page-link">&laquo; Prev</a>`);
  } else {
    links.push(`<span class="page-link disabled">&laquo; Prev</span>`);
  }

  for (let i = 1; i <= total; i++) {
    if (i === current) {
      links.push(`<span class="page-link active">${i}</span>`);
    } else {
      links.push(`<a href="/commissions?page=${i}" class="page-link">${i}</a>`);
    }
  }

  if (current < total) {
    links.push(`<a href="/commissions?page=${current + 1}" class="page-link">Next &raquo;</a>`);
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
// Shared layout pieces exported for dashboard.ts
// ---------------------------------------------------------------------------

/**
 * Render the top-level navigation bar with section links.
 */
export function renderTopNav(active: "configuration" | "commissions"): string {
  return `<nav class="top-nav">
    <a href="/"${active === "configuration" ? ' class="active"' : ""}>Configuration</a>
    <a href="/commissions"${active === "commissions" ? ' class="active"' : ""}>Commissions</a>
  </nav>`;
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
  in_progress: "badge-active",
  active: "badge-active",
  completed: "badge-completed",
  cancelled: "badge-cancelled",
  failed: "badge-failed",
};

function truncate(text: string, maxLen: number): string {
  // Take the first line or first maxLen chars, whichever is shorter
  const firstLine = text.split("\n")[0] ?? "";
  const base = firstLine.length > maxLen ? firstLine.slice(0, maxLen) : firstLine;
  return base.length < firstLine.length ? base + "…" : base;
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
// Styles — extends the base dashboard CSS with commission-specific additions
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

  /* Top Nav — section-level navigation */
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

  /* Sub Nav — within-section navigation */
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
  tbody tr:hover { background: rgba(255,255,255,0.02); }
  .spec-preview {
    max-width: 360px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-muted);
    font-size: 0.82rem;
  }
  .nowrap { white-space: nowrap; }

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
