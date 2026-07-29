import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Status of the one-way QNAP beeper-mongodb -> local Mongo mirror
 * (Story 92). One file per repoGuid — `collections` and counts are never
 * secrets, but the source/target host:port are always host:port only
 * (never credentials, see hostPortOf() in refresh.ts).
 */
export interface BeeperMirrorMetadata {
  repoGuid: string;
  sourceHostPort: string;
  targetHostPort: string;
  lastCheckedAt: string;
  /** Only set on a run that actually produced a good mirror (PASS or NO_CHANGE) — never touched by a FAIL run, so a last-good timestamp always survives an outage. */
  lastSuccessAt?: string;
  result: "PASS" | "NO_CHANGE" | "FAIL";
  /** Per-collection document counts as of the last successful (PASS or NO_CHANGE) run. */
  collections: Record<string, number>;
  lastError?: string;
}

export function beeperMirrorStatusRoot(): string {
  if (process.env.BEEPER_MIRROR_STATUS_ROOT) return process.env.BEEPER_MIRROR_STATUS_ROOT;
  // Local Docker: same bind mount dev-data-source.json already uses
  // (docker-compose.local.yml mounts ./.runtime -> /app/runtime).
  if (existsSync("/app/runtime")) return "/app/runtime/beeper-mongo-mirror";
  return join(process.cwd(), ".runtime/beeper-mongo-mirror");
}

export function beeperMirrorMetadataPath(repoGuid: string): string {
  return join(beeperMirrorStatusRoot(), `${repoGuid}.json`);
}

export function readBeeperMirrorMetadata(repoGuid: string): BeeperMirrorMetadata | null {
  const path = beeperMirrorMetadataPath(repoGuid);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as BeeperMirrorMetadata;
  } catch {
    return null;
  }
}

/** Atomic write (temp file + rename) — same pattern as dev-db-override.ts's persistSources(). */
export function writeBeeperMirrorMetadata(meta: BeeperMirrorMetadata): void {
  const path = beeperMirrorMetadataPath(meta.repoGuid);
  mkdirSync(dirname(path), { recursive: true });
  const body = JSON.stringify(meta, null, 2) + "\n";
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
  try {
    writeFileSync(tmp, body, "utf8");
    renameSync(tmp, path);
  } catch {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    writeFileSync(path, body, "utf8");
  }
}
