/**
 * Resolves this process's owner user via BEEPER_OWNER_REPO_GUID — required,
 * validated, no default. Same small, deliberately-duplicated pattern as
 * packages/beeper-ws/owner-db.mjs, packages/beeper-sync/lib/owner-db.mjs and
 * packages/beeper-oplog/owner-db.mjs (see their own header comments) — this
 * process also has no Dashboard session to resolve a repoGuid from, so it
 * must never guess a user and never fall back to any default or to the old
 * shared `beeper` database.
 */

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveOwnerRepoGuid(env: NodeJS.ProcessEnv): string {
  const repoGuid = env.BEEPER_OWNER_REPO_GUID;
  if (!repoGuid || !GUID_RE.test(repoGuid)) {
    throw new Error(
      `BEEPER_OWNER_REPO_GUID is missing or invalid (${JSON.stringify(repoGuid)}). ` +
        "beeper-synch has no Dashboard session to resolve an owner from, so it must be set " +
        "to a full GUID in .env.mac-beeper."
    );
  }
  return repoGuid;
}

export function ownerDatabaseName(repoGuid: string): string {
  return `beeper_${repoGuid}`;
}

export function redactMongoUri(uri: string): string {
  return uri.replace(/\/\/([^:@/]+):([^@/]+)@/, "//$1:***@");
}
