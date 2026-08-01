import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { resolveOwnerRepoGuid } from "./owner-db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** repo root: src|dist -> beeper-synch -> plugins -> repo root */
export const REPO_ROOT = resolve(__dirname, "../../..");

export class ConfigError extends Error {}

export interface Config {
  repoRoot: string;
  ownerRepoGuid: string;
  mongodbUri: string;
  beeperRestUrl: string;
  beeperWsUrl: string;
  beeperWsDir: string;
  beeperSyncDir: string;
  beeperOplogDir: string;
  lockFile: string;
  statusFile: string;
  syncIntervalMs: number;
  minBackoffMs: number;
  maxBackoffMs: number;
  logLevel: string;
  instanceId: string;
  /** Local Mongo mirror target (Story 92) — deliberately a SEPARATE env var
   * from the Dashboard's own BEEPER_MONGODB_URI (.env.local): that one's
   * value depends on in-container-vs-host resolution logic that doesn't
   * apply to this plain Mac-host process. Never used for writes other than
   * the mirror refresh itself. */
  localMirrorMongoUri: string;
  mirrorIntervalMs: number;
}

function readNumber(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new ConfigError(`${name} must be a positive number, got ${JSON.stringify(raw)}`);
  }
  return n;
}

/**
 * Loads and validates config for this process. Reads env from
 * `<repoRoot>/.env.mac-beeper` — the SAME file beeper-ws/beeper-sync already
 * use (see .env.mac-beeper.example) — plus a handful of beeper-synch-only
 * orchestrator variables (interval/backoff/log level/instance id), added to
 * that same example file rather than a second, duplicate .env.example.
 *
 * `env` is injectable for tests; defaults to `process.env` merged with the
 * repo's .env.mac-beeper file (dotenv does not override already-set process
 * env vars).
 */
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  envFilePath: string = resolve(REPO_ROOT, ".env.mac-beeper")
): Config {
  if (existsSync(envFilePath)) {
    dotenv.config({ path: envFilePath, processEnv: env });
  }

  const beeperWsDir = resolve(REPO_ROOT, "packages/beeper-ws");
  const beeperSyncDir = resolve(REPO_ROOT, "packages/beeper-sync");
  const beeperOplogDir = resolve(REPO_ROOT, "packages/beeper-oplog");

  if (!existsSync(resolve(beeperWsDir, "package.json"))) {
    throw new ConfigError(`packages/beeper-ws not found at ${beeperWsDir} — this monorepo checkout is incomplete`);
  }
  if (!existsSync(resolve(beeperSyncDir, "package.json"))) {
    throw new ConfigError(`packages/beeper-sync not found at ${beeperSyncDir} — this monorepo checkout is incomplete`);
  }
  if (!existsSync(resolve(beeperOplogDir, "package.json"))) {
    throw new ConfigError(`packages/beeper-oplog not found at ${beeperOplogDir} — this monorepo checkout is incomplete`);
  }

  const mongodbUri = env.MONGODB_URI;
  if (!mongodbUri) {
    throw new ConfigError("MONGODB_URI is not set — copy .env.mac-beeper.example to .env.mac-beeper and fill it in");
  }
  const beeperRestUrl = env.BEEPER_REST_URL;
  if (!beeperRestUrl) {
    throw new ConfigError("BEEPER_REST_URL is not set — copy .env.mac-beeper.example to .env.mac-beeper and fill it in");
  }
  const beeperWsUrl = env.BEEPER_WS_URL;
  if (!beeperWsUrl) {
    throw new ConfigError("BEEPER_WS_URL is not set — copy .env.mac-beeper.example to .env.mac-beeper and fill it in");
  }
  if (!env.BEEPER_API_KEY) {
    throw new ConfigError("BEEPER_API_KEY is not set — copy .env.mac-beeper.example to .env.mac-beeper and fill it in");
  }

  const ownerRepoGuid = resolveOwnerRepoGuid(env);

  const localMirrorMongoUri = env.BEEPER_LOCAL_MIRROR_MONGODB_URI || "mongodb://localhost:27017/?directConnection=true";
  if (hostPortOf(localMirrorMongoUri) === hostPortOf(mongodbUri)) {
    throw new ConfigError(
      `BEEPER_LOCAL_MIRROR_MONGODB_URI resolves to the same host as MONGODB_URI (${hostPortOf(mongodbUri)}) — ` +
        "refusing to configure a mirror that would target its own source."
    );
  }

  const runtimeDir = resolve(REPO_ROOT, ".runtime/beeper-synch");

  return {
    repoRoot: REPO_ROOT,
    ownerRepoGuid,
    mongodbUri,
    beeperRestUrl,
    beeperWsUrl,
    beeperWsDir,
    beeperSyncDir,
    beeperOplogDir,
    lockFile: resolve(runtimeDir, "beeper-synch.pid"),
    statusFile: resolve(runtimeDir, "status.json"),
    syncIntervalMs: readNumber(env, "BEEPER_SYNCH_SYNC_INTERVAL_MS", 5 * 60 * 1000),
    minBackoffMs: readNumber(env, "BEEPER_SYNCH_MIN_BACKOFF_MS", 2_000),
    maxBackoffMs: readNumber(env, "BEEPER_SYNCH_MAX_BACKOFF_MS", 5 * 60 * 1000),
    logLevel: env.BEEPER_SYNCH_LOG_LEVEL || "info",
    instanceId: env.BEEPER_SYNCH_INSTANCE_ID || "mac-default",
    localMirrorMongoUri,
    mirrorIntervalMs: readNumber(env, "BEEPER_SYNCH_MIRROR_INTERVAL_MS", 5 * 60 * 1000),
  };
}

/** host:port only — never credentials. Used only for the same-host sanity check above. */
function hostPortOf(uri: string): string {
  try {
    return new URL(uri.replace(/^mongodb(\+srv)?:\/\//, "http://")).host;
  } catch {
    return "(unresolved)";
  }
}
