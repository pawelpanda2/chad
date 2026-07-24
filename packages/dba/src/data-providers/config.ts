/**
 * Configuration for the Mongo/Content-Provider primary+follower layer
 * (Story 72 §4). Read lazily inside functions, not at module load — same
 * reason as `client.ts`'s `getContentProviderApiUrl()`/`mongo.ts`'s
 * `getMongoUri()`: Next.js collects page data at build time, before
 * docker-compose has injected the runtime env, so throwing at import time
 * would fail every build regardless of what's actually configured.
 *
 * No new ad-hoc env system — plain `process.env`, same convention as the
 * rest of `packages/dba`.
 */

import type { DataBackendName } from "./types.js";

export interface DbaDataProvidersConfig {
  mongoEnabled: boolean;
  contentProviderEnabled: boolean;
  /** Story 80 — CHAD's PostgreSQL datastore. Off by default until a repo has actually cut over. */
  postgresEnabled: boolean;
  primaryBackend: DataBackendName;
  followerWritesEnabled: boolean;
  /** Always true in this Story — kept as an explicit field per Story 72 §4's shape, not a live toggle. */
  followerWritesAsync: true;
  /** Always false in this Story — a follower error must never fail the primary's request. */
  failRequestOnFollowerError: false;
  shadowReadsEnabled: boolean;
}

function readBool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultValue;
  return raw === "true" || raw === "1";
}

function readBackendName(name: string, defaultValue: DataBackendName): DataBackendName {
  const raw = process.env[name];
  if (raw === "mongo" || raw === "content-provider" || raw === "postgres") return raw;
  if (raw !== undefined && raw !== "") {
    throw new Error(
      `${name} must be "mongo", "content-provider" or "postgres", got: "${raw}"`
    );
  }
  return defaultValue;
}

/**
 * Reads the current configuration from env vars. Defaults match Story 72
 * §4's "first stage" values (Mongo primary, CP follower, shadow reads on) —
 * Story 80 adds `postgres` as an alternative primary, opt-in via
 * `DBA_PRIMARY_BACKEND=postgres` + `DBA_POSTGRES_ENABLED=true`, never a
 * silent default change to any existing deployment.
 */
export function loadDataProvidersConfig(): DbaDataProvidersConfig {
  const config: DbaDataProvidersConfig = {
    mongoEnabled: readBool("DBA_MONGO_ENABLED", true),
    contentProviderEnabled: readBool("DBA_CONTENT_PROVIDER_ENABLED", true),
    postgresEnabled: readBool("DBA_POSTGRES_ENABLED", false),
    primaryBackend: readBackendName("DBA_PRIMARY_BACKEND", "mongo"),
    followerWritesEnabled: readBool("DBA_FOLLOWER_WRITES_ENABLED", true),
    followerWritesAsync: true,
    failRequestOnFollowerError: false,
    shadowReadsEnabled: readBool("DBA_SHADOW_READS_ENABLED", true),
  };
  validateDataProvidersConfig(config);
  return config;
}

/**
 * Fails startup if the configured primary backend isn't itself enabled
 * (Story 72 §4 — "Nie pozwól uruchomić systemu bez aktywnego primary").
 */
export function validateDataProvidersConfig(config: DbaDataProvidersConfig): void {
  if (!config.mongoEnabled && !config.contentProviderEnabled && !config.postgresEnabled) {
    throw new Error(
      "Invalid data providers config: at least one of mongoEnabled/contentProviderEnabled/postgresEnabled must be true."
    );
  }

  if (config.primaryBackend === "mongo" && !config.mongoEnabled) {
    throw new Error(
      "Invalid data providers config: primaryBackend is \"mongo\" but mongoEnabled is false. " +
        "The primary backend must always be enabled."
    );
  }

  if (config.primaryBackend === "content-provider" && !config.contentProviderEnabled) {
    throw new Error(
      "Invalid data providers config: primaryBackend is \"content-provider\" but " +
        "contentProviderEnabled is false. The primary backend must always be enabled."
    );
  }

  if (config.primaryBackend === "postgres" && !config.postgresEnabled) {
    throw new Error(
      "Invalid data providers config: primaryBackend is \"postgres\" but " +
        "postgresEnabled is false. The primary backend must always be enabled."
    );
  }
}

/**
 * The follower is whichever enabled backend isn't the primary, if any.
 * Story 80: `postgres` never acts as a follower (it's the migration target,
 * not a shadow-mirror participant) — when it's primary, the only possible
 * follower is `content-provider`, same as when `mongo` is primary. This
 * also means Postgres and Mongo are never simultaneously primary+follower
 * of each other (Story 80 §18 — "Nie utrzymuj dwóch primary"); moving data
 * between them is the explicit, one-off migrator script, never the
 * follower/outbox mechanism.
 */
export function resolveFollowerBackendName(
  config: DbaDataProvidersConfig
): DataBackendName | null {
  if (config.primaryBackend === "mongo" || config.primaryBackend === "postgres") {
    return config.contentProviderEnabled ? "content-provider" : null;
  }
  return config.mongoEnabled ? "mongo" : null;
}
