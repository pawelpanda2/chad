/**
 * PostgreSQL connection singleton — CHAD's own datastore (Story 80). Mirrors
 * `mongo.ts`'s conventions exactly: lazy env read (not at module load, since
 * Next.js collects page data at build time before docker-compose has
 * injected the runtime env — see `mongo.ts`'s `getMongoUri()` doc comment),
 * one module-level `Pool` reused across the process lifetime.
 *
 * This is the ONLY place in the monorepo allowed to open a `pg` connection —
 * same rule as `mongo.ts` for MongoDB (`packages/dashboard` must never
 * import `pg` directly). Routed through `dev-db-override.ts` so the Dev
 * Panel Settings tab can switch local/`next dev` between local and QNAP
 * Postgres without a process restart.
 */

import { Client, Pool, type PoolClient } from "pg";
import {
  buildPostgresUriForSource,
  getEffectivePostgresUri,
  getPostgresOverrideGeneration,
  type ChadPostgresSource,
} from "./dev-db-override.js";
import { DEV_DB_PROBE_TIMEOUT_MS } from "./offline-readonly-backup/constants.js";

export { DEV_DB_PROBE_TIMEOUT_MS };

function getPostgresUri(): string {
  return getEffectivePostgresUri();
}

let pool: Pool | null = null;
let poolGeneration = -1;

function getPool(): Pool {
  const generation = getPostgresOverrideGeneration();
  if (pool && poolGeneration !== generation) {
    const stale = pool;
    pool = null;
    stale.end().catch(() => {});
  }
  if (!pool) {
    poolGeneration = generation;
    // Short connect timeout so a dead Tailscale/QNAP host cannot hang the
    // Dev Panel forever (café / offline emergency switch).
    pool = new Pool({
      connectionString: getPostgresUri(),
      connectionTimeoutMillis: DEV_DB_PROBE_TIMEOUT_MS,
    });
  }
  return pool;
}

/** Runs `fn` with a pooled client, always releasing it back afterward (success or error). */
export async function withPostgresClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/**
 * One-shot probe against an explicit URI — does NOT mutate the live pool /
 * active Dev Panel source. Used to verify Server PostgreSQL before committing
 * a switch away from offline-readonly-backup.
 */
export async function probePostgresUri(
  uri: string,
  timeoutMs: number = DEV_DB_PROBE_TIMEOUT_MS
): Promise<{ ok: boolean; itemCount?: number; error?: string }> {
  const client = new Client({
    connectionString: uri,
    connectionTimeoutMillis: timeoutMs,
    query_timeout: timeoutMs,
  });
  const timer = setTimeout(() => {
    client.end().catch(() => {});
  }, timeoutMs + 250);
  try {
    await client.connect();
    const { rows } = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM cp_items");
    return { ok: true, itemCount: Number(rows[0]?.count ?? 0) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
    await client.end().catch(() => {});
  }
}

/** Probe the URI for a source without changing the active override. */
export async function probePostgresSource(
  source: ChadPostgresSource,
  timeoutMs: number = DEV_DB_PROBE_TIMEOUT_MS
): Promise<{ ok: boolean; itemCount?: number; error?: string }> {
  try {
    return await probePostgresUri(buildPostgresUriForSource(source), timeoutMs);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Sets the transaction-local `app.*` settings the `cp_items` history
 * trigger reads via `current_setting('app.*', true)` (Story 80 §6) — always
 * via parameterized `set_config()`, never raw `SET LOCAL` string
 * interpolation, so an actor username/repoGuid can never be used for SQL
 * injection. Must be called after `BEGIN` and before the mutating
 * statement, on the same client/transaction.
 */
export async function setMutationContext(
  client: PoolClient,
  context: {
    mutationId?: string | null;
    requestId?: string | null;
    actorUsername?: string | null;
    actorRepoGuid?: string | null;
    actorKind?: string | null;
  }
): Promise<void> {
  await client.query(
    `SELECT
       set_config('app.mutation_id', $1, true),
       set_config('app.request_id', $2, true),
       set_config('app.actor_username', $3, true),
       set_config('app.actor_repo_guid', $4, true),
       set_config('app.actor_kind', $5, true)`,
    [
      context.mutationId ?? "",
      context.requestId ?? "",
      context.actorUsername ?? "",
      context.actorRepoGuid ?? "",
      context.actorKind ?? "",
    ]
  );
}

/** Postgres unique-violation error code (used to detect a raced idempotent-retry or an address conflict). */
export const PG_UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === PG_UNIQUE_VIOLATION;
}

/** Closes the pool. Only relevant for short-lived scripts (migration tools, tests) — the dashboard's long-lived Next.js process should never call this. */
export async function closePostgresConnection(): Promise<void> {
  if (pool) {
    const p = pool;
    pool = null;
    poolGeneration = -1;
    await p.end();
  }
}
