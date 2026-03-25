import http from "node:http";
import { readGuildConfig, findGuildRoot } from "@shardworks/nexus-core";
import { renderDashboard } from "./dashboard.js";
import { renderApiJson } from "./api.js";

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
      // Re-read config on every request so the dashboard always shows current state
      const config = readGuildConfig(home);

      if (req.url === "/api/config") {
        const json = renderApiJson(config);
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
        res.end(json);
        return;
      }

      // All other routes serve the dashboard
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
