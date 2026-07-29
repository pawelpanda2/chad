import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Writes a small local JSON status file (no HTTP server — prompt 3.1 says
 * only expose health/status "when actually needed"; a file next to the PID
 * lock is enough for bash-scripts/beeper-synch/status.sh to read). `ready`
 * only ever becomes true after the Mongo preflight succeeded and beeper-ws
 * is actually connected, never merely "process started" (prompt 3.3).
 */
export function writeStatus(statusFile: string, status: Record<string, unknown>): void {
  mkdirSync(dirname(statusFile), { recursive: true });
  writeFileSync(statusFile, JSON.stringify({ updatedAt: new Date().toISOString(), ...status }, null, 2) + "\n", "utf8");
}
