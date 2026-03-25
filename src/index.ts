/**
 * @shardworks/guild-monitor
 *
 * Local web dashboard for monitoring Nexus guild state.
 * Reads guild configuration via @shardworks/nexus-core and serves
 * an HTML dashboard on localhost.
 */

export { startMonitor } from "./server.js";
export type { MonitorOptions } from "./server.js";
