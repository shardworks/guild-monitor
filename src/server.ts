import http from "node:http";
import {
  readGuildConfig,
  findGuildRoot,
  createWrit,
  readWrit,
  listWrits,
  getWritChildren,
  signalEvent,
  listEvents,
  listDispatches,
  clockStart,
  clockStop,
  clockStatus,
  createConversation,
  takeTurn,
  endConversation,
  listAnimas,
  listSessions,
  showSession,
} from "@shardworks/nexus-core";
import type { WritRecord, WritStatus } from "@shardworks/nexus-core";
import { renderDashboard } from "./dashboard.js";
import { renderApiJson } from "./api.js";
import { renderWorkPage } from "./work.js";
import { renderClockworksPage } from "./clockworks.js";
import {
  renderConsultationPage,
  getConsultableRoles,
} from "./consultation.js";
import {
  renderSessionsPage,
  renderSessionDetailPage,
  readSessionRecord,
} from "./sessions.js";

export interface MonitorOptions {
  /**
   * Absolute path to the guild root directory. Defaults to finding the guild
   * from the current working directory.
   */
  home?: string;
  /** Port to serve on. Defaults to 4200. */
  port?: number;
}

/**
 * Start the guild monitor web server.
 * Resolves when the server is listening.
 * Binds to 127.0.0.1 only — not accessible from other machines.
 */
export function startMonitor(options?: MonitorOptions): Promise<void> {
  const port = options?.port ?? 4200;
  const home = options?.home ?? findGuildRoot(process.cwd());

  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
      const pathname = url.pathname;

      // Re-read config on every request so the dashboard always shows current state
      const config = readGuildConfig(home);

      // --- API routes ---

      if (pathname === "/api/config") {
        const json = renderApiJson(config);
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
        res.end(json);
        return;
      }

      // POST /api/writs — create a new writ from the patron form
      if (pathname === "/api/writs" && req.method === "POST") {
        handleCreateWrit(req, res, home);
        return;
      }

      // GET /api/clock-status — returns full daemon status for header badge and status card
      if (pathname === "/api/clock-status" && req.method === "GET") {
        respondJson(res, clockStatus(home));
        return;
      }

      // POST /api/clock-start — start the clockworks daemon
      if (pathname === "/api/clock-start" && req.method === "POST") {
        try {
          const result = clockStart(home);
          respondJson(res, result);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Failed to start clockworks";
          res.writeHead(409, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          });
          res.end(JSON.stringify({ error: msg }));
        }
        return;
      }

      // POST /api/clock-stop — stop the clockworks daemon
      if (pathname === "/api/clock-stop" && req.method === "POST") {
        try {
          const result = clockStop(home);
          respondJson(res, result);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Failed to stop clockworks";
          res.writeHead(409, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          });
          res.end(JSON.stringify({ error: msg }));
        }
        return;
      }

      // GET /api/events?page=N — paginated event list for polling
      if (pathname === "/api/events" && req.method === "GET") {
        const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
        const pageSize = 25;
        const all = listEvents(home, { limit: 200 });
        const totalPages = Math.max(1, Math.ceil(all.length / pageSize));
        const currentPage = Math.max(1, Math.min(page, totalPages));
        const start = (currentPage - 1) * pageSize;
        respondJson(res, {
          total: all.length,
          page: currentPage,
          pageSize,
          totalPages,
          items: all.slice(start, start + pageSize),
        });
        return;
      }

      // GET /api/dispatches — recent dispatches for polling
      if (pathname === "/api/dispatches" && req.method === "GET") {
        const dispatches = listDispatches(home, { limit: 50 });
        respondJson(res, dispatches);
        return;
      }

      // --- Writ API routes ---

      // GET /api/writs?parentId=&type=&status=&topLevel=1
      if (pathname === "/api/writs" && req.method === "GET") {
        const topLevel = url.searchParams.get("topLevel") === "1";
        const parentId = url.searchParams.get("parentId") ?? undefined;
        const type = url.searchParams.get("type") ?? undefined;
        const status = url.searchParams.get("status") as WritStatus | undefined ?? undefined;
        let writs = listWrits(home, { parentId, type, status });
        if (topLevel) {
          writs = writs.filter((w) => !w.parentId);
        }
        respondJson(res, writs);
        return;
      }

      // GET /api/writs/:id/children — direct children with progress counts
      if (pathname.startsWith("/api/writs/") && pathname.endsWith("/children") && req.method === "GET") {
        const writId = pathname.slice("/api/writs/".length, -"/children".length);
        const children = getWritChildren(home, writId);
        respondJson(res, children);
        return;
      }

      // GET /api/writs/:id — single writ with children
      if (pathname.startsWith("/api/writs/") && req.method === "GET") {
        const writId = pathname.slice("/api/writs/".length);
        const writ = readWrit(home, writId);
        if (!writ) {
          respondJsonError(res, 404, "Writ not found");
          return;
        }
        const children = getWritChildren(home, writId);
        respondJson(res, { ...writ, children });
        return;
      }

      // --- Consultation API routes (backed by core conversation API) ---

      // GET /api/roles — consultable roles for the dropdown
      if (pathname === "/api/roles" && req.method === "GET") {
        const roles = getConsultableRoles(home);
        respondJson(res, roles);
        return;
      }

      // POST /api/consultation/start — create a conversation and take the first turn
      if (pathname === "/api/consultation/start" && req.method === "POST") {
        handleJsonBody(req, res, async (body) => {
          const role = typeof body.role === "string" ? body.role : "";
          const message = typeof body.message === "string" ? body.message : "";
          if (!role || !message) {
            respondJsonError(res, 400, "Missing role or message.");
            return;
          }
          try {
            // Find the anima for this role
            const animas = listAnimas(home, { status: "active" });
            const match = animas.find((a) => a.roles.includes(role));
            if (!match) {
              respondJsonError(res, 404, `No active anima found for role "${role}".`);
              return;
            }

            // Create a consult conversation with human + anima participants
            const conv = createConversation(home, {
              kind: "consult",
              topic: `Dashboard consultation with ${match.name} (${role})`,
              participants: [
                { kind: "human", name: "patron" },
                { kind: "anima", name: match.name },
              ],
            });

            // Find the anima participant ID for takeTurn
            const animaParticipant = conv.participants.find((p) => p.kind === "anima");
            if (!animaParticipant) {
              respondJsonError(res, 500, "Failed to resolve anima participant.");
              return;
            }

            // Take the first turn — collect all text chunks
            const chunks = takeTurn(home, conv.conversationId, animaParticipant.id, message);
            const textParts: string[] = [];
            for await (const chunk of chunks) {
              if (chunk.type === "text") {
                textParts.push(chunk.text);
              }
            }

            respondJson(res, {
              conversationId: conv.conversationId,
              participantId: animaParticipant.id,
              response: textParts.join("") || "(No response)",
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to start consultation";
            respondJsonError(res, 500, msg);
          }
        });
        return;
      }

      // POST /api/consultation/message — send a follow-up message in an existing conversation
      if (pathname === "/api/consultation/message" && req.method === "POST") {
        handleJsonBody(req, res, async (body) => {
          const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
          const participantId = typeof body.participantId === "string" ? body.participantId : "";
          const message = typeof body.message === "string" ? body.message : "";
          if (!conversationId || !participantId || !message) {
            respondJsonError(res, 400, "Missing conversationId, participantId, or message.");
            return;
          }
          try {
            const chunks = takeTurn(home, conversationId, participantId, message);
            const textParts: string[] = [];
            for await (const chunk of chunks) {
              if (chunk.type === "text") {
                textParts.push(chunk.text);
              }
            }
            respondJson(res, {
              response: textParts.join("") || "(No response)",
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to send message";
            respondJsonError(res, 500, msg);
          }
        });
        return;
      }

      // POST /api/consultation/cleanup — end a conversation (best-effort)
      if (pathname === "/api/consultation/cleanup" && req.method === "POST") {
        handleJsonBody(req, res, async (body) => {
          if (typeof body.conversationId === "string") {
            try {
              endConversation(home, body.conversationId, "abandoned");
            } catch {
              // Best-effort cleanup
            }
          }
          respondJson(res, { ok: true });
        });
        return;
      }

      // --- Session API routes ---

      // GET /api/sessions — list sessions
      if (pathname === "/api/sessions" && req.method === "GET") {
        const sessions = listSessions(home, { limit: 200 });
        respondJson(res, sessions);
        return;
      }

      // GET /api/sessions/:id — session detail
      if (pathname.startsWith("/api/sessions/") && req.method === "GET") {
        const sessionId = pathname.slice("/api/sessions/".length);
        const session = showSession(home, sessionId);
        if (!session) {
          respondJsonError(res, 404, "Session not found");
          return;
        }
        respondJson(res, session);
        return;
      }

      // --- Page routes ---

      // Read clock daemon status for the header badge
      const clockRunning = clockStatus(home).running;

      // Clockworks section
      if (pathname === "/clockworks") {
        const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
        const events = listEvents(home, { limit: 200 });
        const dispatches = listDispatches(home, { limit: 50 });
        const html = renderClockworksPage(
          clockRunning,
          events,
          dispatches,
          page,
          config.name,
          config.nexus,
          config.model,
        );
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(html);
        return;
      }

      // Sessions section — list and detail views
      if (pathname === "/sessions") {
        const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
        const statusFilter = url.searchParams.get("status") ?? "all";
        const sessions = listSessions(home, { limit: 200 });

        // Build anima ID → name lookup
        const animas = listAnimas(home);
        const animaNames: Record<string, string> = {};
        for (const a of animas) {
          animaNames[a.id] = a.name;
        }

        const html = renderSessionsPage({
          sessions,
          animaNames,
          statusFilter,
          page,
          guildName: config.name,
          nexus: config.nexus,
          model: config.model,
          clockRunning,
        });
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(html);
        return;
      }

      // Session detail — /sessions/:id
      if (pathname.startsWith("/sessions/") && pathname !== "/sessions/") {
        const sessionId = decodeURIComponent(pathname.slice("/sessions/".length));
        const session = showSession(home, sessionId);
        if (!session) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Session not found");
          return;
        }

        // Resolve anima name
        const animas = listAnimas(home);
        const animaMatch = animas.find((a) => a.id === session.animaId);
        const animaName = animaMatch?.name ?? session.animaId;

        // Read the session record JSON from disk for transcript data
        const record = readSessionRecord(home, session.recordPath);

        const html = renderSessionDetailPage({
          session,
          animaName,
          record,
          guildName: config.name,
          nexus: config.nexus,
          model: config.model,
          clockRunning,
        });
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(html);
        return;
      }

      // Work section — writs with optional drill-down
      if (pathname === "/work") {
        const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
        const statusFilter = url.searchParams.get("status") ?? "all";
        const focusedWritId = url.searchParams.get("writ") ?? undefined;

        // Always fetch all writs — status filtering is handled client-side
        // via toggleable filter buttons.

        let focusedWrit: WritRecord | null = null;
        let breadcrumb: WritRecord[] = [];
        let focusedChildStats: { childCount: number; completedCount: number } | undefined;
        let writs: WritRecord[];

        if (focusedWritId) {
          // Drill-down mode: show a specific writ and its children
          focusedWrit = readWrit(home, focusedWritId) ?? null;
          if (focusedWrit) {
            // Build breadcrumb by walking up parentId chain
            let current = focusedWrit;
            while (current.parentId) {
              const parent = readWrit(home, current.parentId);
              if (!parent) break;
              breadcrumb.unshift(parent);
              current = parent;
            }
            // Get children for the table
            const childSummaries = getWritChildren(home, focusedWritId);
            focusedChildStats = {
              childCount: childSummaries.length,
              completedCount: childSummaries.filter((c) => c.status === "completed").length,
            };
            // List all child writs (full records for the table)
            writs = listWrits(home, { parentId: focusedWritId });
          } else {
            writs = [];
          }
        } else {
          // Top-level view — fetch all, no status filter
          const allWrits = listWrits(home);
          writs = allWrits.filter((w) => !w.parentId);
        }

        const html = renderWorkPage({
          writs,
          totalCount: writs.length,
          workshops: config.workshops,
          writTypes: config.writTypes ?? {},
          statusFilter,
          page,
          focusedWrit,
          breadcrumb,
          focusedChildStats,
          guildName: config.name,
          nexus: config.nexus,
          model: config.model,
          clockRunning,
        });
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(html);
        return;
      }

      // Redirect old /commissions URL to /work
      if (pathname === "/commissions") {
        res.writeHead(301, { Location: "/work" });
        res.end();
        return;
      }

      // Consultation section
      if (pathname === "/consultation") {
        const roles = getConsultableRoles(home);
        const html = renderConsultationPage(
          config.name,
          config.nexus,
          config.model,
          clockRunning,
          roles,
        );
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(html);
        return;
      }

      // Configuration section (default — serves the original dashboard)
      const html = renderDashboard(config, clockRunning);
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(html);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown error reading guild config";
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(`Error: ${message}`);
    }
  });

  return new Promise<void>((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => {
      console.log(`Guild Monitor listening at http://127.0.0.1:${port}`);
      resolve();
    });
  });
}

// Clock daemon status is now provided by clockStatus() from nexus-core.

// ---------------------------------------------------------------------------
// JSON response helper
// ---------------------------------------------------------------------------

function respondJson(res: http.ServerResponse, data: unknown): void {
  const json = JSON.stringify(data);
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(json);
}

// ---------------------------------------------------------------------------
// POST handler for writ creation
// ---------------------------------------------------------------------------

/**
 * Read a JSON body, create a writ via nexus-core with sourceType 'patron',
 * and signal 'writ.posted'. Returns the created writ as JSON.
 */
function handleCreateWrit(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  home: string,
): void {
  handleJsonBody(req, res, async (body) => {
    const content = typeof body.content === "string" ? body.content.trim() : "";
    const type = typeof body.type === "string" ? body.type : "writ";
    const workshop = typeof body.workshop === "string" && body.workshop ? body.workshop : undefined;

    if (!content) {
      respondJsonError(res, 400, "Content is required.");
      return;
    }

    // First line = title, full content = description
    const lines = content.split("\n");
    const title = lines[0].trim();
    const description = content;

    try {
      const writ = createWrit(home, {
        type,
        title,
        description,
        workshop,
        sourceType: "patron",
      });

      // Signal writ.posted so standing orders can react
      signalEvent(home, "writ.posted", { writId: writ.id, workshop, type }, "guild-monitor");

      respondJson(res, writ);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create writ";
      respondJsonError(res, 500, msg);
    }
  });
}

// ---------------------------------------------------------------------------
// JSON body handler for consultation API routes
// ---------------------------------------------------------------------------

/**
 * Read a JSON body from the request and call the handler with parsed data.
 * Handles payload size limits, parse errors, and request errors uniformly.
 */
function handleJsonBody(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  handler: (body: Record<string, unknown>) => Promise<void>,
): void {
  const chunks: Buffer[] = [];

  req.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    if (total > 1_048_576) {
      req.destroy();
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Payload too large" }));
    }
  });

  req.on("end", () => {
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
      handler(body).catch((err) => {
        const msg = err instanceof Error ? err.message : "Handler error";
        if (!res.headersSent) {
          respondJsonError(res, 500, msg);
        }
      });
    } catch {
      respondJsonError(res, 400, "Invalid JSON body");
    }
  });

  req.on("error", () => {
    if (!res.headersSent) {
      respondJsonError(res, 500, "Request error");
    }
  });
}

/** Send an error response as JSON. */
function respondJsonError(
  res: http.ServerResponse,
  status: number,
  message: string,
): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify({ error: message }));
}
