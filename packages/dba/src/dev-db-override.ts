/**
 * Runtime-switchable Mongo data source for local development (Story 83).
 *
 * `DBA_MONGO_MODE` (see `bash-scripts/dashboard/03_local_mac_docker/01_config.sh`)
 * previously only ever decided the target Mongo (local vs. QNAP-over-Tailscale)
 * once, at shell/container-start time, by rewriting `MONGODB_URI`/
 * `BEEPER_MONGODB_URI` before `next dev`/`next start` even began — invisible
 * and unchangeable from inside the running app. This module brings that same
 * decision into the process itself as in-memory state, so the Dev Panel's
 * Settings tab can display AND change it live, without a restart.
 *
 * Deliberately global (module-level), not per-request: there is exactly one
 * Mongo connection pool per process (`mongo.ts`), so "which Mongo" is a
 * process-wide fact, not a per-user one. This is safe ONLY because
 * `setMongoSource` refuses to run outside local dev (see guard below) — a
 * real multi-user deployment (QNAP TEST/PROD) must never let one request
 * change what every other concurrent request talks to.
 */

export type MongoSource = "local" | "qnap";

const QNAP_TAILSCALE_HOST = "100.117.139.83";
const QNAP_MONGO_PORT = "12040";

function defaultSource(): MongoSource {
  return process.env.DBA_MONGO_MODE === "qnap" ? "qnap" : "local";
}

let currentSource: MongoSource = defaultSource();
let generation = 0;

/** The currently selected Mongo source (defaults to `DBA_MONGO_MODE` at process start). */
export function getMongoSource(): MongoSource {
  return currentSource;
}

/** Bumped every time `setMongoSource` changes the source — lets `mongo.ts` detect a stale cached connection. */
export function getDevDbOverrideGeneration(): number {
  return generation;
}

/**
 * Changes which Mongo this process talks to, effective on the next
 * operation (existing cached connections are torn down and reconnected —
 * see `mongo.ts`'s `connect()`/`connectBeeperServer()`).
 *
 * Refuses to run when `NODE_ENV === "production"` — every Docker-built
 * deployment (local-mac-docker, QNAP test, QNAP prod) runs with
 * `NODE_ENV=production` regardless of environment name (see
 * `lib/flags.ts`'s doc comment), so this hard-blocks the one scenario that
 * would actually be dangerous: a shared, multi-user server process where
 * flipping the source would yank the database out from under every other
 * concurrent request. Bare `next dev` (the only place this feature is
 * meant to be used) always has `NODE_ENV !== "production"`.
 */
export function setMongoSource(source: MongoSource): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("setMongoSource is disabled when NODE_ENV=production (local `next dev` only).");
  }
  if (source !== "local" && source !== "qnap") {
    throw new Error(`Invalid Mongo source: "${source}" (must be "local" or "qnap")`);
  }
  if (source === currentSource) return;
  currentSource = source;
  generation += 1;
}

function requireQnapCredentials(): { user: string; pass: string } {
  const user = process.env.MONGO_ROOT_USERNAME;
  const pass = process.env.MONGO_ROOT_PASSWORD;
  if (!user || !pass) {
    throw new Error(
      "MONGO_ROOT_USERNAME/MONGO_ROOT_PASSWORD must be set (via .env.local) to connect to QNAP Mongo."
    );
  }
  return { user, pass };
}

/** Effective `chad` (CP items) Mongo URI, honoring the runtime override. */
export function getEffectiveMongoUri(): string {
  if (currentSource === "qnap") {
    const { user, pass } = requireQnapCredentials();
    return `mongodb://${user}:${pass}@${QNAP_TAILSCALE_HOST}:${QNAP_MONGO_PORT}/chad?authSource=admin&directConnection=true`;
  }
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI environment variable is not set");
  return uri;
}

/** Effective Beeper Mongo *server* URI (no database segment — see `mongo.ts`), honoring the runtime override. */
export function getEffectiveBeeperMongoUri(): string {
  if (currentSource === "qnap") {
    const { user, pass } = requireQnapCredentials();
    return `mongodb://${user}:${pass}@${QNAP_TAILSCALE_HOST}:${QNAP_MONGO_PORT}?authSource=admin&directConnection=true`;
  }
  const uri = process.env.BEEPER_MONGODB_URI;
  if (!uri) throw new Error("BEEPER_MONGODB_URI environment variable is not set");
  return uri;
}

/** Host:port only (no credentials) — safe to show in the Settings UI. */
export function describeEffectiveMongoTarget(): { source: MongoSource; hostPort: string; error?: string } {
  try {
    const uri = getEffectiveMongoUri();
    const parsed = new URL(uri.replace(/^mongodb:\/\//, "http://"));
    return { source: currentSource, hostPort: parsed.host };
  } catch (err) {
    return { source: currentSource, hostPort: "(unresolved)", error: err instanceof Error ? err.message : String(err) };
  }
}
