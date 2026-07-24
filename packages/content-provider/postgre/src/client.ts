/**
 * Connection helper for cp-postgre — no queries here.
 * Uses POSTGRES_URI (same env as packages/dba) or CP_POSTGRE_URI.
 */

import { Pool, type PoolClient } from "pg";

let pool: Pool | null = null;

export function getPostgreUri(): string {
  const uri = process.env.CP_POSTGRE_URI ?? process.env.POSTGRES_URI;
  if (!uri) {
    throw new Error(
      "CP_POSTGRE_URI or POSTGRES_URI environment variable is not set"
    );
  }
  return uri;
}

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: getPostgreUri() });
  }
  return pool;
}

export async function withPostgreClient<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function closePostgrePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
