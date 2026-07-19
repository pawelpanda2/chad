/**
 * Resolves this process's owner user via BEEPER_OWNER_REPO_GUID — required,
 * validated, no default. beeper-ws has no Dashboard session to read a
 * repoGuid from, so the owner must be configured explicitly per machine.
 * Story 73: each CHAD user has their own `beeper_<repoGuid>` MongoDB
 * database — this process must never guess a user, never fall back to any
 * default, and never touch the old shared `beeper` database.
 *
 * Kept as its own small copy rather than a shared package, matching the
 * existing independence of beeper-ws/beeper-sync/beeper-oplog's own Mongo
 * connection code (see documentation/beeper/architecture.md).
 */

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveOwnerRepoGuid() {
  const repoGuid = process.env.BEEPER_OWNER_REPO_GUID;
  if (!repoGuid || !GUID_RE.test(repoGuid)) {
    console.error(
      `[owner-db] BEEPER_OWNER_REPO_GUID is missing or invalid (${JSON.stringify(repoGuid)}). ` +
        "Refusing to start. This process has no Dashboard session to resolve an owner from, " +
        "so BEEPER_OWNER_REPO_GUID must be set to a full GUID in this process's env file " +
        "(see .env.mac-beeper.example)."
    );
    process.exit(1);
  }
  return repoGuid;
}

export function ownerDatabaseName(repoGuid) {
  return `beeper_${repoGuid}`;
}

export function redactMongoUri(uri) {
  return uri.replace(/\/\/([^:@/]+):([^@/]+)@/, "//$1:***@");
}
