import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {
  readGuildConfig,
  findGuildRoot,
  listCommissions,
  listWorks,
  listPieces,
  listJobs,
  listStrokes,
  listEvents,
  listDispatches,
  nexusDir,
  commission as postCommission,
} from "@shardworks/nexus-core";
import { renderDashboard } from "./dashboard.js";
import { renderApiJson } from "./api.js";
import { renderWorkPage } from "./work.js";
import { renderClockworksPage } from "./clockworks.js";

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

      // POST /api/commissions — create a new commission
      if (pathname === "/api/commissions" && req.method === "POST") {
        handleCreateCommission(req, res, home);
        return;
      }

      // GET /api/clock-status — lightweight poll target for header badge
      if (pathname === "/api/clock-status" && req.method === "GET") {
        respondJson(res, { running: isClockRunning(home) });
        return;
      }

      // GET /api/commissions?page=N — paginated commission list for polling
      if (pathname === "/api/commissions" && req.method === "GET") {
        const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
        const pageSize = 15;
        const all = listCommissions(home);
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

      // --- Hierarchy API routes ---

      // GET /api/works?commissionId=<id>
      if (pathname === "/api/works" && req.method === "GET") {
        const commissionId = url.searchParams.get("commissionId") ?? undefined;
        const works = listWorks(home, { commissionId });
        respondJson(res, works);
        return;
      }

      // GET /api/pieces?workId=<id>
      if (pathname === "/api/pieces" && req.method === "GET") {
        const workId = url.searchParams.get("workId") ?? undefined;
        const pieces = listPieces(home, { workId });
        respondJson(res, pieces);
        return;
      }

      // GET /api/jobs?pieceId=<id>
      if (pathname === "/api/jobs" && req.method === "GET") {
        const pieceId = url.searchParams.get("pieceId") ?? undefined;
        const jobs = listJobs(home, { pieceId });
        respondJson(res, jobs);
        return;
      }

      // GET /api/strokes?jobId=<id>
      if (pathname === "/api/strokes" && req.method === "GET") {
        const jobId = url.searchParams.get("jobId") ?? undefined;
        const strokes = listStrokes(home, { jobId });
        respondJson(res, strokes);
        return;
      }

      // --- Page routes ---

      // Read clock daemon status for the header badge
      const clockRunning = isClockRunning(home);

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

      // Work section (renamed from Commissions)
      if (pathname === "/work") {
        const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
        const commissions = listCommissions(home);
        const html = renderWorkPage(
          commissions,
          config.workshops,
          page,
          config.name,
          config.nexus,
          config.model,
          clockRunning,
        );
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

// ---------------------------------------------------------------------------
// Clock daemon status — checks if the clockworks daemon process is alive
// ---------------------------------------------------------------------------

/**
 * Check if the clockworks daemon is currently running.
 *
 * Reads the PID from .nexus/clock.pid and sends signal 0 to verify the
 * process is alive. Returns false if the PID file doesn't exist or the
 * process isn't running.
 */
function isClockRunning(home: string): boolean {
  const pidPath = path.join(nexusDir(home), "clock.pid");
  try {
    const pidStr = fs.readFileSync(pidPath, "utf-8").trim();
    const pid = parseInt(pidStr, 10);
    if (Number.isNaN(pid)) return false;
    // signal 0 tests whether the process exists without actually sending a signal
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

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
// POST handler for commission creation
// ---------------------------------------------------------------------------

/**
 * Read a URL-encoded form body from the request, create the commission
 * via nexus-core, and redirect back to the commissions page.
 */
function handleCreateCommission(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  home: string,
): void {
  const chunks: Buffer[] = [];

  req.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
    // Guard against oversized payloads (1 MB limit)
    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    if (total > 1_048_576) {
      req.destroy();
      res.writeHead(413, { "Content-Type": "text/plain" });
      res.end("Payload too large");
    }
  });

  req.on("end", () => {
    try {
      const body = Buffer.concat(chunks).toString("utf-8");
      const params = new URLSearchParams(body);
      const workshop = params.get("workshop") ?? "";
      const spec = params.get("spec") ?? "";

      if (!workshop || !spec) {
        res.writeHead(302, { Location: "/work?error=missing-fields" });
        res.end();
        return;
      }

      postCommission({ home, workshop, spec });

      // Redirect back to commissions list on success
      res.writeHead(302, { Location: "/work?created=1" });
      res.end();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("Failed to create commission:", msg);
      res.writeHead(302, {
        Location: `/work?error=${encodeURIComponent(msg)}`,
      });
      res.end();
    }
  });

  req.on("error", () => {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Request error");
  });
}
