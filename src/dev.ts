#!/usr/bin/env node
/**
 * Development harness for the guild monitor.
 * Usage: npm run dev [-- /path/to/guild]
 *
 * When run with tsx watch, file changes trigger an automatic restart.
 */
import { startMonitor } from "./server.js";

const home = process.argv[2] || undefined;
const port = parseInt(process.env.PORT ?? "4200", 10);

startMonitor({ home, port }).catch((err) => {
  console.error("Failed to start Guild Monitor:", err);
  process.exit(1);
});
