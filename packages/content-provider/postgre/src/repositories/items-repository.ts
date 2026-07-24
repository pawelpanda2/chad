/**
 * PostgreSQL queries against cp_items — no CpItem mapping here.
 */

import { withPostgreClient } from "../client.js";
import type { CpPostgreItemRow } from "../models/row.js";

function addressFor(repoGuid: string, loca: string): string {
  const trimmed = (loca ?? "").replace(/^\/+|\/+$/g, "");
  return trimmed ? `${repoGuid}/${trimmed}` : repoGuid;
}

export async function findByRepoAndLoca(
  repoGuid: string,
  loca: string
): Promise<CpPostgreItemRow | null> {
  const address = addressFor(repoGuid, loca);
  return withPostgreClient(async (client) => {
    const result = await client.query<CpPostgreItemRow>(
      `SELECT id, repo_guid, address, name, type, config, body
         FROM cp_items
        WHERE repo_guid = $1 AND address = $2
        LIMIT 1`,
      [repoGuid, address]
    );
    return result.rows[0] ?? null;
  });
}
