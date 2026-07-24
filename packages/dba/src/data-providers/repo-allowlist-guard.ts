/**
 * Story 81 — transitional safety net for QNAP TEST's Postgres cutover.
 *
 * QNAP's shared Postgres instance initially contains ONLY `test3`'s
 * migrated data (never `pawel_f`, `kamil_s`, or any other real repo — see
 * `backlog/stories/81/02_plan.md` §"Migration scope"). Without this guard,
 * a non-`test3` write on TEST (primary=postgres) would happily create a
 * brand-new island of data in Postgres for that repo — a real, silent
 * divergence from PROD's Mongo, which still holds that repo's actual data.
 * This guard makes that a loud, typed error instead.
 *
 * Not a general-purpose multi-tenancy feature: gated entirely by
 * `DBA_POSTGRES_REPO_ALLOWLIST` (comma-separated repoGuids), unset (and
 * therefore a no-op) everywhere except QNAP TEST during this migration
 * window. Once QNAP TEST's Postgres holds every real repo (a future,
 * separate cutover), this env var is simply left unset there too.
 */

function readAllowlist(): Set<string> | null {
  const raw = process.env.DBA_POSTGRES_REPO_ALLOWLIST;
  if (!raw || raw.trim() === "") return null;
  return new Set(
    raw
      .split(",")
      .map((guid) => guid.trim())
      .filter((guid) => guid.length > 0)
  );
}

export class RepoNotAllowlistedError extends Error {
  constructor(
    public readonly repoGuid: string,
    public readonly allowlist: string[]
  ) {
    super(
      `QNAP TEST's PostgreSQL primary currently holds data for a limited set of repos only ` +
        `(${allowlist.join(", ") || "(empty)"}). Refusing to write repoGuid "${repoGuid}" — this would silently ` +
        `create a new, divergent island of data instead of the real data that still lives in Mongo/PROD. ` +
        `This is a transitional restriction (Story 81) — see backlog/stories/81/ for the full migration plan.`
    );
    this.name = "RepoNotAllowlistedError";
  }
}

/** No-op when `DBA_POSTGRES_REPO_ALLOWLIST` is unset — throws `RepoNotAllowlistedError` for any other repoGuid when it is. */
export function assertRepoAllowlisted(repoGuid: string): void {
  const allowlist = readAllowlist();
  if (!allowlist) return;
  if (!allowlist.has(repoGuid)) {
    throw new RepoNotAllowlistedError(repoGuid, [...allowlist]);
  }
}
