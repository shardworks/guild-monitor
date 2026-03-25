import type { GuildConfig } from "@shardworks/nexus-core";

/** Serialize guild config as JSON for the /api/config endpoint. */
export function renderApiJson(config: GuildConfig): string {
  return JSON.stringify(config, null, 2);
}
