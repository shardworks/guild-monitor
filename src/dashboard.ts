import type {
  GuildConfig,
  RoleDefinition,
  ToolEntry,
  TrainingEntry,
  WorkshopEntry,
  StandingOrder,
  ClockworksConfig,
} from "@shardworks/nexus-core";
import { renderTopNav, renderHeader } from "./clockworks.js";

/**
 * Render the full dashboard HTML page from the guild config.
 * Server-rendered — no client-side JS framework needed.
 *
 * This is the "Configuration" section of the dashboard — it displays
 * guild configuration state (workshops, roles, tools, engines, training,
 * clockworks). The top-level nav links to the Commissions section.
 */
export function renderDashboard(config: GuildConfig, clockRunning: boolean): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(config.name)} — Configuration</title>
  <style>${CSS}</style>
</head>
<body>
  ${renderHeader(config.name, config.nexus, config.model, clockRunning)}
  ${renderTopNav("configuration")}
  <nav>
    <a href="#workshops">Workshops</a>
    <a href="#roles">Roles</a>
    <a href="#tools">Tools</a>
    <a href="#engines">Engines</a>
    <a href="#training">Training</a>
    <a href="#clockworks">Clockworks</a>
  </nav>
  <main>
    ${renderWorkshops(config.workshops)}
    ${renderRoles(config.roles, config.baseTools)}
    ${renderTools(config.tools)}
    ${renderEngines(config.engines)}
    ${renderTraining(config.curricula, config.temperaments)}
    ${renderClockworks(config.clockworks)}
  </main>
  <footer>
    <p>Guild Monitor &middot; Refreshed at ${new Date().toLocaleTimeString()}</p>
  </footer>
  <script>${POLL_JS}</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

function renderWorkshops(workshops: Record<string, WorkshopEntry>): string {
  const entries = Object.entries(workshops);
  return section("workshops", "Workshops", entries.length, () => {
    if (entries.length === 0) return emptyState("No workshops registered.");
    return `<div class="card-grid">${entries.map(([name, ws]) => `
      <div class="card">
        <h3>${esc(name)}</h3>
        <dl>
          <dt>Remote</dt>
          <dd class="mono">${esc(ws.remoteUrl)}</dd>
          <dt>Added</dt>
          <dd>${formatDate(ws.addedAt)}</dd>
        </dl>
      </div>`).join("")}</div>`;
  });
}

function renderRoles(
  roles: Record<string, RoleDefinition>,
  baseTools: string[],
): string {
  const entries = Object.entries(roles);
  return section("roles", "Roles", entries.length, () => {
    const baseToolsHtml =
      baseTools.length > 0
        ? `<div class="subsection">
            <h3>Base Tools <span class="count">(${baseTools.length})</span></h3>
            <div class="tag-list">${baseTools.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
           </div>`
        : "";

    if (entries.length === 0 && baseTools.length === 0)
      return emptyState("No roles defined.");

    return `${baseToolsHtml}
      <div class="card-grid">${entries.map(([name, role]) => `
        <div class="card">
          <h3>${esc(name)}</h3>
          <dl>
            <dt>Seats</dt>
            <dd>${role.seats === null ? "Unbounded" : role.seats}</dd>
            ${role.instructions ? `<dt>Instructions</dt><dd class="mono">${esc(role.instructions)}</dd>` : ""}
          </dl>
          ${role.tools.length > 0
            ? `<div class="tag-list">${role.tools.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>`
            : '<p class="muted">No role-specific tools</p>'}
        </div>`).join("")}</div>`;
  });
}

function renderTools(tools: Record<string, ToolEntry>): string {
  const entries = Object.entries(tools);
  return section("tools", "Tools", entries.length, () => {
    if (entries.length === 0) return emptyState("No tools installed.");
    return renderToolTable(entries);
  });
}

function renderEngines(engines: Record<string, ToolEntry>): string {
  const entries = Object.entries(engines);
  return section("engines", "Engines", entries.length, () => {
    if (entries.length === 0) return emptyState("No engines installed.");
    return renderToolTable(entries);
  });
}

function renderToolTable(entries: [string, ToolEntry][]): string {
  return `<div class="table-wrap"><table>
    <thead><tr><th>Name</th><th>Upstream</th><th>Package</th><th>Bundle</th><th>Installed</th></tr></thead>
    <tbody>${entries.map(([name, t]) => `
      <tr>
        <td class="mono">${esc(name)}</td>
        <td class="mono">${t.upstream ? esc(t.upstream) : "&mdash;"}</td>
        <td class="mono">${t.package ? esc(t.package) : "&mdash;"}</td>
        <td class="mono">${t.bundle ? esc(t.bundle) : "&mdash;"}</td>
        <td>${formatDate(t.installedAt)}</td>
      </tr>`).join("")}
    </tbody>
  </table></div>`;
}

function renderTraining(
  curricula: Record<string, TrainingEntry>,
  temperaments: Record<string, TrainingEntry>,
): string {
  const cEntries = Object.entries(curricula);
  const tEntries = Object.entries(temperaments);
  const total = cEntries.length + tEntries.length;

  return section("training", "Training", total, () => {
    if (total === 0) return emptyState("No training content registered.");

    const curriculaHtml =
      cEntries.length > 0
        ? `<div class="subsection">
            <h3>Curricula <span class="count">(${cEntries.length})</span></h3>
            ${renderTrainingTable(cEntries)}
           </div>`
        : "";

    const temperamentsHtml =
      tEntries.length > 0
        ? `<div class="subsection">
            <h3>Temperaments <span class="count">(${tEntries.length})</span></h3>
            ${renderTrainingTable(tEntries)}
           </div>`
        : "";

    return curriculaHtml + temperamentsHtml;
  });
}

function renderTrainingTable(entries: [string, TrainingEntry][]): string {
  return `<div class="table-wrap"><table>
    <thead><tr><th>Name</th><th>Upstream</th><th>Bundle</th><th>Installed</th></tr></thead>
    <tbody>${entries.map(([name, t]) => `
      <tr>
        <td class="mono">${esc(name)}</td>
        <td class="mono">${t.upstream ? esc(t.upstream) : "Local"}</td>
        <td class="mono">${t.bundle ? esc(t.bundle) : "&mdash;"}</td>
        <td>${formatDate(t.installedAt)}</td>
      </tr>`).join("")}
    </tbody>
  </table></div>`;
}

function renderClockworks(clockworks?: ClockworksConfig): string {
  const events = Object.entries(clockworks?.events ?? {});
  const orders = clockworks?.standingOrders ?? [];
  const total = events.length + orders.length;

  return section("clockworks", "Clockworks", total, () => {
    if (!clockworks) return emptyState("No clockworks configuration.");

    const eventsHtml =
      events.length > 0
        ? `<div class="subsection">
            <h3>Custom Events <span class="count">(${events.length})</span></h3>
            <div class="table-wrap"><table>
              <thead><tr><th>Event</th><th>Description</th></tr></thead>
              <tbody>${events.map(([name, ev]) => `
                <tr>
                  <td class="mono">${esc(name)}</td>
                  <td>${ev.description ? esc(ev.description) : "&mdash;"}</td>
                </tr>`).join("")}
              </tbody>
            </table></div>
           </div>`
        : "";

    const ordersHtml =
      orders.length > 0
        ? `<div class="subsection">
            <h3>Standing Orders <span class="count">(${orders.length})</span></h3>
            <div class="table-wrap"><table>
              <thead><tr><th>On Event</th><th>Action</th><th>Target</th></tr></thead>
              <tbody>${orders.map((order) => {
                const { event, verb, target } = parseOrder(order);
                return `<tr>
                  <td class="mono">${esc(event)}</td>
                  <td><span class="badge badge-verb badge-${verb}">${verb}</span></td>
                  <td class="mono">${esc(target)}</td>
                </tr>`;
              }).join("")}
              </tbody>
            </table></div>
           </div>`
        : "";

    if (events.length === 0 && orders.length === 0)
      return emptyState("Clockworks configured but empty.");

    return eventsHtml + ordersHtml;
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function section(
  id: string,
  title: string,
  count: number,
  body: () => string,
): string {
  return `<section id="${id}">
    <h2>${title} <span class="count">(${count})</span></h2>
    ${body()}
  </section>`;
}

function emptyState(msg: string): string {
  return `<p class="empty">${esc(msg)}</p>`;
}

function parseOrder(order: StandingOrder): {
  event: string;
  verb: string;
  target: string;
} {
  if ("run" in order) return { event: order.on, verb: "run", target: order.run };
  if ("summon" in order)
    return { event: order.on, verb: "summon", target: order.summon };
  return { event: order.on, verb: "brief", target: order.brief };
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
// Client-side polling — lightweight, just updates clock badge + timestamp
// ---------------------------------------------------------------------------

const POLL_JS = `
(function() {
  "use strict";
  var POLL_INTERVAL = 3000;

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

  function refreshTimestamp() {
    var footer = document.querySelector("footer p");
    if (footer) {
      footer.innerHTML = "Guild Monitor &middot; Refreshed at " + new Date().toLocaleTimeString();
    }
  }

  setInterval(function() {
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
  .badge-clock-running { background: rgba(74,222,128,0.15); color: var(--green); }
  .badge-clock-stopped { background: rgba(255,255,255,0.06); color: var(--text-muted); }
  .badge-verb {
    font-family: var(--mono);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .badge-run { background: rgba(74,222,128,0.15); color: var(--green); }
  .badge-summon { background: rgba(108,140,255,0.15); color: var(--accent); }
  .badge-brief { background: rgba(251,191,36,0.15); color: var(--amber); }

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

  /* Sub Nav — within-section anchor links */
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
  .subsection { margin-top: 1.25rem; }
  .subsection h3 {
    font-size: 0.95rem;
    font-weight: 500;
    margin-bottom: 0.75rem;
  }

  /* Cards */
  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 1rem;
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.15rem;
  }
  .card h3 {
    font-size: 0.95rem;
    font-weight: 600;
    margin-bottom: 0.6rem;
    color: var(--accent);
  }
  .card dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.3rem 0.75rem;
    font-size: 0.85rem;
  }
  .card dt { color: var(--text-muted); font-weight: 500; }
  .card dd { word-break: break-all; }

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
    .card-grid { grid-template-columns: 1fr; }
  }
`;
