/**
 * Runtime-switchable data sources for local development (Story 83 + Story 81).
 *
 * Originally only Mongo (local vs QNAP-over-Tailscale). After Story 80/81 the
 * primary CHAD datastore is PostgreSQL — the Dev Panel Settings tab now
 * switches Postgres and Mongo independently.
 *
 * Deliberately global (module-level), not per-request: there is one connection
 * pool per process, so "which DB" is a process-wide fact. Safe ONLY because
 * setters refuse to run outside local `next dev` (`NODE_ENV !== "production"`).
 */

export type DbSource = "local" | "qnap";
/** @deprecated Prefer `DbSource` — kept for existing callers. */
export type MongoSource = DbSource;

const QNAP_TAILSCALE_HOST = "100.117.139.83";
const QNAP_MONGO_PORT = "12040";
const QNAP_POSTGRES_PORT = "12042";
/** Host-published port of `chad-postgres-local-mac-docker` (see docker-compose.local.yml). */
const LOCAL_POSTGRES_PORT = "5433";

function isQnapPostgresUri(uri: string): boolean {
  return uri.includes(QNAP_TAILSCALE_HOST) || uri.includes(`:${QNAP_POSTGRES_PORT}`);
}

function defaultMongoSource(): DbSource {
  return process.env.DBA_MONGO_MODE === "qnap" ? "qnap" : "local";
}

function defaultPostgresSource(): DbSource {
  const uri = process.env.POSTGRES_URI ?? "";
  if (uri && isQnapPostgresUri(uri)) return "qnap";
  // Align with the shell switch that now also rewrites POSTGRES_URI in
  // bash-scripts/dashboard/03_local_mac_docker/01_config.sh when mode=qnap.
  if (process.env.DBA_MONGO_MODE === "qnap") return "qnap";
  return "local";
}

let currentMongoSource: DbSource = defaultMongoSource();
let currentPostgresSource: DbSource = defaultPostgresSource();
let mongoGeneration = 0;
let postgresGeneration = 0;

/** The currently selected Mongo source (defaults from `DBA_MONGO_MODE`). */
export function getMongoSource(): DbSource {
  return currentMongoSource;
}

/** The currently selected Postgres source (local volume vs QNAP Tailscale). */
export function getPostgresSource(): DbSource {
  return currentPostgresSource;
}

/** Bumped when Mongo source changes — `mongo.ts` tears down stale clients. */
export function getDevDbOverrideGeneration(): number {
  return mongoGeneration;
}

/** Bumped when Postgres source changes — `postgres.ts` tears down the stale pool. */
export function getPostgresOverrideGeneration(): number {
  return postgresGeneration;
}

function assertLocalDev(action: string): void {
  // Allow on bare `next dev` (NODE_ENV !== production) AND on the official
  // local-mac-docker stack (CHAD_ENVIRONMENT=local, even though that image
  // builds with NODE_ENV=production). Never on QNAP TEST/PROD.
  const chadEnv = process.env.CHAD_ENVIRONMENT;
  const allowed =
    chadEnv === "local" || (chadEnv !== "test" && chadEnv !== "prod" && process.env.NODE_ENV !== "production");
  if (!allowed) {
    throw new Error(
      `${action} is disabled outside local (CHAD_ENVIRONMENT=local or bare next dev). Got CHAD_ENVIRONMENT=${chadEnv ?? "(unset)"} NODE_ENV=${process.env.NODE_ENV ?? "(unset)"}.`
    );
  }
}

function assertSource(source: unknown, label: string): asserts source is DbSource {
  if (source !== "local" && source !== "qnap") {
    throw new Error(`Invalid ${label} source: "${String(source)}" (must be "local" or "qnap")`);
  }
}

export function setMongoSource(source: DbSource): void {
  assertLocalDev("setMongoSource");
  assertSource(source, "Mongo");
  if (source === currentMongoSource) return;
  currentMongoSource = source;
  mongoGeneration += 1;
}

export function setPostgresSource(source: DbSource): void {
  assertLocalDev("setPostgresSource");
  assertSource(source, "Postgres");
  if (source === currentPostgresSource) return;
  currentPostgresSource = source;
  postgresGeneration += 1;
}

function isQnapMongoUri(uri: string): boolean {
  return uri.includes(QNAP_TAILSCALE_HOST) || uri.includes(`:${QNAP_MONGO_PORT}`);
}

function requireQnapMongoCredentials(): { user: string; pass: string } {
  const user = process.env.MONGO_ROOT_USERNAME;
  const pass = process.env.MONGO_ROOT_PASSWORD;
  if (!user || !pass) {
    throw new Error(
      "MONGO_ROOT_USERNAME/MONGO_ROOT_PASSWORD must be set (via .env.local) to connect to QNAP Mongo."
    );
  }
  return { user, pass };
}

function requirePostgresCredentials(forQnap: boolean): { user: string; pass: string; db: string } {
  const user = process.env.POSTGRES_USER || "chad";
  const db = process.env.POSTGRES_DB || "chad";
  // Local volume password and QNAP chad-postgres password often drift —
  // prefer POSTGRES_QNAP_PASSWORD when targeting the server.
  const pass = forQnap
    ? process.env.POSTGRES_QNAP_PASSWORD || process.env.POSTGRES_PASSWORD
    : process.env.POSTGRES_PASSWORD;
  if (!pass) {
    throw new Error(
      forQnap
        ? "POSTGRES_QNAP_PASSWORD (or POSTGRES_PASSWORD) must be set to connect to QNAP Postgres."
        : "POSTGRES_PASSWORD must be set to connect to local Postgres."
    );
  }
  return { user, pass, db };
}

/** Effective `chad` (CP items) Mongo URI, honoring the runtime override. */
export function getEffectiveMongoUri(): string {
  if (currentMongoSource === "qnap") {
    const envUri = process.env.MONGODB_URI;
    if (envUri && isQnapMongoUri(envUri)) return envUri;
    const { user, pass } = requireQnapMongoCredentials();
    return `mongodb://${user}:${pass}@${QNAP_TAILSCALE_HOST}:${QNAP_MONGO_PORT}/chad?authSource=admin&directConnection=true`;
  }
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI environment variable is not set");
  if (!isQnapMongoUri(uri)) return uri;
  const inLocalDocker = process.env.CHAD_ENVIRONMENT === "local" && process.env.NODE_ENV === "production";
  if (inLocalDocker) {
    const user = process.env.MONGO_ROOT_USERNAME || "change_me";
    const pass = process.env.MONGO_ROOT_PASSWORD || "change_me";
    return `mongodb://${user}:${pass}@mongodb:27017/chad?authSource=admin`;
  }
  return uri;
}

/** Effective Beeper Mongo *server* URI (no database segment), honoring the runtime override. */
export function getEffectiveBeeperMongoUri(): string {
  if (currentMongoSource === "qnap") {
    const envUri = process.env.BEEPER_MONGODB_URI;
    if (envUri && isQnapMongoUri(envUri)) return envUri;
    const { user, pass } = requireQnapMongoCredentials();
    return `mongodb://${user}:${pass}@${QNAP_TAILSCALE_HOST}:${QNAP_MONGO_PORT}?authSource=admin&directConnection=true`;
  }
  const uri = process.env.BEEPER_MONGODB_URI;
  if (!uri) throw new Error("BEEPER_MONGODB_URI environment variable is not set");
  if (!isQnapMongoUri(uri)) return uri;
  const inLocalDocker = process.env.CHAD_ENVIRONMENT === "local" && process.env.NODE_ENV === "production";
  if (inLocalDocker) {
    const user = process.env.MONGO_ROOT_USERNAME || "change_me";
    const pass = process.env.MONGO_ROOT_PASSWORD || "change_me";
    return `mongodb://${user}:${pass}@mongodb:27017?authSource=admin`;
  }
  return uri;
}

/** Effective Postgres URI for CHAD cp_items (Story 80/81 primary), honoring the runtime override. */
export function getEffectivePostgresUri(): string {
  if (currentPostgresSource === "qnap") {
    const envUri = process.env.POSTGRES_URI;
    if (envUri && isQnapPostgresUri(envUri) && !process.env.POSTGRES_QNAP_PASSWORD) {
      // Process already started pointed at QNAP with a working URI — keep it.
      return envUri;
    }
    const { user, pass, db } = requirePostgresCredentials(true);
    return `postgres://${user}:${pass}@${QNAP_TAILSCALE_HOST}:${QNAP_POSTGRES_PORT}/${db}`;
  }

  const envUri = process.env.POSTGRES_URI;
  if (envUri && !isQnapPostgresUri(envUri)) {
    return envUri;
  }
  // Env still points at QNAP (e.g. DBA_MONGO_MODE=qnap rewrite) — build a
  // local URI. Inside official local-mac-docker the sibling service is
  // `postgres:5432`; on bare next on the Mac host it's published :5433.
  const { user, pass, db } = requirePostgresCredentials(false);
  const inLocalDocker = process.env.CHAD_ENVIRONMENT === "local" && process.env.NODE_ENV === "production";
  const host = inLocalDocker ? "postgres" : "127.0.0.1";
  const port = inLocalDocker ? "5432" : LOCAL_POSTGRES_PORT;
  return `postgres://${user}:${pass}@${host}:${port}/${db}`;
}

function describeUriHostPort(uri: string): string {
  const parsed = new URL(uri.replace(/^mongodb(\+srv)?:\/\//, "http://").replace(/^postgres(ql)?:\/\//, "http://"));
  return parsed.host;
}

/** Host:port only (no credentials) — safe to show in the Settings UI. */
export function describeEffectiveMongoTarget(): { source: DbSource; hostPort: string; error?: string } {
  try {
    return { source: currentMongoSource, hostPort: describeUriHostPort(getEffectiveMongoUri()) };
  } catch (err) {
    return {
      source: currentMongoSource,
      hostPort: "(unresolved)",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function describeEffectivePostgresTarget(): { source: DbSource; hostPort: string; error?: string } {
  try {
    return { source: currentPostgresSource, hostPort: describeUriHostPort(getEffectivePostgresUri()) };
  } catch (err) {
    return {
      source: currentPostgresSource,
      hostPort: "(unresolved)",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
