import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  QNAP_TAILSCALE_HOST,
  QNAP_MONGO_PORT,
  QNAP_BEEPER_MONGO_PORT,
  QNAP_POSTGRES_PORT,
} from "./dev-db-hosts.js";
import {
  OFFLINE_READONLY_BACKUP_DATABASE,
  OFFLINE_READONLY_BACKUP_READER_ROLE,
  DEFAULT_OFFLINE_READONLY_BACKUP_PORT,
  CHAD_DATA_MODE_OFFLINE_READONLY_BACKUP,
  CHAD_DATA_MODE_REMOTE_PRIMARY,
} from "./offline-readonly-backup/constants.js";

/**
 * Runtime-switchable data sources for local development.
 *
 * Postgres (CHAD cp_items): `server` (QNAP primary) or `offline-readonly-backup`
 * (emergency read-only snapshot). Mongo (Beeper CRM): `local` vs `qnap`.
 */

export type ChadPostgresSource = "server" | "offline-readonly-backup";
export type DbSource = "local" | "qnap";
/** @deprecated Prefer `DbSource` — kept for existing Mongo callers. */
export type MongoSource = DbSource;

function prefPath(): string {
  if (process.env.DEV_DB_SOURCE_PREF_PATH) return process.env.DEV_DB_SOURCE_PREF_PATH;
  // Local Docker volume persists across container restart.
  if (existsSync("/app/data")) return "/app/data/dev-db-source.json";
  // Bare next / host tools — gitignored .runtime/
  return join(process.cwd(), ".runtime/dev-data-source.json");
}

function normalizePersistedPostgres(raw: unknown): ChadPostgresSource | undefined {
  if (raw === "server" || raw === "offline-readonly-backup") return raw;
  // Legacy Dev Panel values — local mirror is no longer a CHAD data source.
  if (raw === "qnap") return "server";
  if (raw === "local") return "server";
  return undefined;
}

function loadPersistedSources(): { postgres?: ChadPostgresSource; mongo?: DbSource } | null {
  try {
    const path = prefPath();
    if (!existsSync(path)) return null;
    const raw = JSON.parse(readFileSync(path, "utf8")) as { postgres?: unknown; mongo?: unknown };
    const out: { postgres?: ChadPostgresSource; mongo?: DbSource } = {};
    const postgres = normalizePersistedPostgres(raw.postgres);
    if (postgres) out.postgres = postgres;
    if (raw.mongo === "local" || raw.mongo === "qnap") out.mongo = raw.mongo;
    return out;
  } catch {
    return null;
  }
}

function persistSources(postgres: ChadPostgresSource, mongo: DbSource): void {
  try {
    const path = prefPath();
    mkdirSync(dirname(path), { recursive: true });
    const body = JSON.stringify(
      {
        postgres,
        mongo,
        chadDataMode: postgresSourceToMode(postgres),
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    );
    // Atomic write: temp → rename (survives crash mid-write; no secrets in file).
    const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
    writeFileSync(tmp, body, "utf8");
    renameSync(tmp, path);
  } catch {
    // Preference is best-effort — volume may be missing on bare next dev.
  }
}

function postgresSourceToMode(source: ChadPostgresSource): string {
  return source === "offline-readonly-backup"
    ? CHAD_DATA_MODE_OFFLINE_READONLY_BACKUP
    : CHAD_DATA_MODE_REMOTE_PRIMARY;
}

function isQnapPostgresUri(uri: string): boolean {
  // "chad-postgres" (docker-compose container_name, docker-compose.qnap.shared.yml)
  // is how the QNAP-hosted TEST/PROD dashboard containers themselves reach the
  // same Postgres — same-host container network, never over Tailscale. Without
  // this, getEffectivePostgresUri() below treated that URI as "not the QNAP
  // server" and rebuilt a Tailscale-IP connection instead (requiring
  // POSTGRES_QNAP_PASSWORD to be exported standalone in-container, which it
  // isn't — only embedded in POSTGRES_URI), breaking real cp_items reads/writes
  // on TEST/PROD (2026-07-27, found while verifying the TEST deploy after the
  // compose consolidation).
  return (
    uri.includes(QNAP_TAILSCALE_HOST) || uri.includes(`:${QNAP_POSTGRES_PORT}`) || uri.includes("chad-postgres")
  );
}

function defaultMongoSource(): DbSource {
  const persisted = loadPersistedSources();
  if (persisted?.mongo) return persisted.mongo;
  // Red rules Rule 2: LOCAL reaches live Beeper Mongo over Tailscale by
  // default. "local" is the offline readonly backup opt-in only.
  return process.env.DBA_MONGO_MODE === "local" ? "local" : "qnap";
}

function defaultPostgresSource(): ChadPostgresSource {
  const persisted = loadPersistedSources();
  if (persisted?.postgres) return persisted.postgres;
  const uri = process.env.POSTGRES_URI ?? "";
  if (uri.includes(OFFLINE_READONLY_BACKUP_DATABASE) || uri.includes(OFFLINE_READONLY_BACKUP_READER_ROLE)) {
    return "offline-readonly-backup";
  }
  if (uri && isQnapPostgresUri(uri)) return "server";
  if (process.env.CHAD_DATA_MODE === "offline-readonly-backup") return "offline-readonly-backup";
  return "server";
}

let currentMongoSource: DbSource = defaultMongoSource();
let currentPostgresSource: ChadPostgresSource = defaultPostgresSource();
let mongoGeneration = 0;
let postgresGeneration = 0;

export function getMongoSource(): DbSource {
  return currentMongoSource;
}

export function getPostgresSource(): ChadPostgresSource {
  return currentPostgresSource;
}

export function getDevDbOverrideGeneration(): number {
  return mongoGeneration;
}

export function getPostgresOverrideGeneration(): number {
  return postgresGeneration;
}

function assertLocalDev(action: string): void {
  const chadEnv = process.env.CHAD_ENVIRONMENT;
  const allowed =
    chadEnv === "local" || (chadEnv !== "test" && chadEnv !== "prod" && process.env.NODE_ENV !== "production");
  if (!allowed) {
    throw new Error(
      `${action} is disabled outside local (CHAD_ENVIRONMENT=local or bare next dev). Got CHAD_ENVIRONMENT=${chadEnv ?? "(unset)"} NODE_ENV=${process.env.NODE_ENV ?? "(unset)"}.`
    );
  }
}

function assertMongoSource(source: unknown, label: string): asserts source is DbSource {
  if (source !== "local" && source !== "qnap") {
    throw new Error(`Invalid ${label} source: "${String(source)}" (must be "local" or "qnap")`);
  }
}

function assertPostgresSource(source: unknown): asserts source is ChadPostgresSource {
  if (source !== "server" && source !== "offline-readonly-backup") {
    throw new Error(
      `Invalid postgres source: "${String(source)}" (must be "server" or "offline-readonly-backup")`
    );
  }
}

function applyChadDataModeEnv(source: ChadPostgresSource): void {
  process.env.CHAD_DATA_MODE = postgresSourceToMode(source);
}

export function setMongoSource(source: DbSource): void {
  assertLocalDev("setMongoSource");
  assertMongoSource(source, "Mongo");
  if (source === currentMongoSource) return;
  currentMongoSource = source;
  mongoGeneration += 1;
  persistSources(currentPostgresSource, currentMongoSource);
}

export function setPostgresSource(source: ChadPostgresSource): void {
  assertLocalDev("setPostgresSource");
  assertPostgresSource(source);
  if (source === currentPostgresSource) return;
  currentPostgresSource = source;
  postgresGeneration += 1;
  applyChadDataModeEnv(source);
  persistSources(currentPostgresSource, currentMongoSource);
}

/** Legacy CHAD Mongo shape (dead port 12040) — kept for getEffectiveMongoUri only. */
function isQnapMongoUri(uri: string): boolean {
  return (
    uri.includes(QNAP_TAILSCALE_HOST) || uri.includes(`:${QNAP_MONGO_PORT}`) || uri.includes(`:${QNAP_BEEPER_MONGO_PORT}`)
  );
}

/**
 * Beeper Server Mongo only — port 12041 (`beeper-mongodb`). Never treat the
 * removed chad-mongodb port 12040 (or any Tailscale URI without :12041) as
 * Beeper: that was the "No contacts found" root cause (env pointed at a
 * dead listener while Dev Panel showed Server Mongo).
 */
function isQnapBeeperMongoUri(uri: string): boolean {
  return uri.includes(`:${QNAP_BEEPER_MONGO_PORT}`);
}

/** @deprecated CHAD's own legacy Mongo credentials — no active connection uses these anymore (removed 2026-07-27). Kept only for `getEffectiveMongoUri()`'s dead-but-not-deleted code path. */
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

function requireQnapBeeperMongoCredentials(): { user: string; pass: string } {
  const user = process.env.BEEPER_MONGO_ROOT_USERNAME;
  const pass = process.env.BEEPER_MONGO_ROOT_PASSWORD;
  if (!user || !pass) {
    throw new Error(
      "BEEPER_MONGO_ROOT_USERNAME/BEEPER_MONGO_ROOT_PASSWORD must be set (via .env.local) to connect to QNAP Beeper Mongo."
    );
  }
  return { user, pass };
}

function requirePostgresCredentials(forQnap: boolean): { user: string; pass: string; db: string } {
  const user = process.env.POSTGRES_USER || "chad";
  const db = process.env.POSTGRES_DB || "chad";
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

function requireOfflineReaderCredentials(): { user: string; pass: string; db: string; host: string; port: string } {
  const pass = process.env.OFFLINE_READONLY_BACKUP_READER_PASSWORD;
  if (!pass) {
    throw new Error(
      "OFFLINE_READONLY_BACKUP_READER_PASSWORD must be set to connect to offline-readonly-backup."
    );
  }
  const inLocalDocker = process.env.CHAD_ENVIRONMENT === "local" && process.env.NODE_ENV === "production";
  return {
    user: OFFLINE_READONLY_BACKUP_READER_ROLE,
    pass,
    db: OFFLINE_READONLY_BACKUP_DATABASE,
    host: inLocalDocker ? "host.docker.internal" : "127.0.0.1",
    port: process.env.OFFLINE_READONLY_BACKUP_POSTGRES_PORT || DEFAULT_OFFLINE_READONLY_BACKUP_PORT,
  };
}

/** Build Postgres URI for a source without mutating the active override. */
export function buildPostgresUriForSource(source: ChadPostgresSource): string {
  if (source === "offline-readonly-backup") {
    const { user, pass, db, host, port } = requireOfflineReaderCredentials();
    return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${db}`;
  }
  // "server" — real shared QNAP Postgres (red-rules Rule 1). Never silently
  // redirect to a local mirror.
  const envUri = process.env.POSTGRES_URI;
  if (envUri && isQnapPostgresUri(envUri) && !process.env.POSTGRES_QNAP_PASSWORD) {
    return envUri;
  }
  const { user, pass, db } = requirePostgresCredentials(true);
  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${QNAP_TAILSCALE_HOST}:${QNAP_POSTGRES_PORT}/${db}`;
}

/** Build Beeper Mongo URI for a source without mutating the active override. */
export function buildBeeperMongoUriForSource(source: DbSource): string {
  if (source === "qnap") {
    if (process.env.BEEPER_MONGO_ROOT_USERNAME && process.env.BEEPER_MONGO_ROOT_PASSWORD) {
      const { user, pass } = requireQnapBeeperMongoCredentials();
      return `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${QNAP_TAILSCALE_HOST}:${QNAP_BEEPER_MONGO_PORT}?authSource=admin&directConnection=true`;
    }
    const envUri = process.env.BEEPER_MONGODB_URI;
    if (envUri && isQnapBeeperMongoUri(envUri)) return envUri;
    const { user, pass } = requireQnapBeeperMongoCredentials();
    return `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${QNAP_TAILSCALE_HOST}:${QNAP_BEEPER_MONGO_PORT}?authSource=admin&directConnection=true`;
  }
  const uri = process.env.BEEPER_MONGODB_URI;
  if (!uri) throw new Error("BEEPER_MONGODB_URI environment variable is not set");
  if (!isQnapBeeperMongoUri(uri) && !uri.includes(QNAP_TAILSCALE_HOST) && !uri.includes(`:${QNAP_MONGO_PORT}`)) {
    return uri;
  }
  const inLocalDocker = process.env.CHAD_ENVIRONMENT === "local" && process.env.NODE_ENV === "production";
  if (inLocalDocker) {
    const user = process.env.MONGO_ROOT_USERNAME || "change_me";
    const pass = process.env.MONGO_ROOT_PASSWORD || "change_me";
    return `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@mongodb:27017?authSource=admin`;
  }
  return uri;
}

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

export function getEffectiveBeeperMongoUri(): string {
  return buildBeeperMongoUriForSource(currentMongoSource);
}

export function getEffectivePostgresUri(): string {
  return buildPostgresUriForSource(currentPostgresSource);
}

function describeUriHostPort(uri: string): string {
  const parsed = new URL(uri.replace(/^mongodb(\+srv)?:\/\//, "http://").replace(/^postgres(ql)?:\/\//, "http://"));
  return parsed.host;
}

/** @deprecated Describes CHAD's own legacy Mongo target — nothing in CHAD's runtime uses this anymore. Use `describeEffectiveBeeperMongoTarget()` for the Dev Panel's Beeper block. */
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

/** Beeper CRM's own Mongo target — what the Dev Panel's "Beeper CRM" block should describe (never CHAD's). */
export function describeEffectiveBeeperMongoTarget(): { source: DbSource; hostPort: string; error?: string } {
  try {
    return { source: currentMongoSource, hostPort: describeUriHostPort(getEffectiveBeeperMongoUri()) };
  } catch (err) {
    return {
      source: currentMongoSource,
      hostPort: "(unresolved)",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function describeEffectivePostgresTarget(): {
  source: ChadPostgresSource;
  hostPort: string;
  error?: string;
} {
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

applyChadDataModeEnv(currentPostgresSource);
