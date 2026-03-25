import http from "node:http";
import {
  readGuildConfig,
  findGuildRoot,
  listCommissions,
  commission as postCommission,
} from "@shardworks/nexus-core";
import { renderDashboard } from "./dashboard.js";
import { renderApiJson } from "./api.js";
import { renderCommissionsPage } from "./commissions.js";

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

      // --- Page routes ---

      // Commissions section
      if (pathname === "/commissions") {
        const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
        const commissions = listCommissions(home);
        const html = renderCommissionsPage(
          commissions,
          config.workshops,
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

      // Configuration section (default — serves the original dashboard)
      const html = renderDashboard(config);
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
        res.writeHead(302, { Location: "/commissions?error=missing-fields" });
        res.end();
        return;
      }

      postCommission({ home, workshop, spec });

      // Redirect back to commissions list on success
      res.writeHead(302, { Location: "/commissions?created=1" });
      res.end();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("Failed to create commission:", msg);
      res.writeHead(302, {
        Location: `/commissions?error=${encodeURIComponent(msg)}`,
      });
      res.end();
    }
  });

  req.on("error", () => {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Request error");
  });
}
