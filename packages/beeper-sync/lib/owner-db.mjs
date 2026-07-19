/**
 * Resolves this process's owner user via BEEPER_OWNER_REPO_GUID — required,
 * validated, no default. Background processes (beeper-sync, and its
 * siblings beeper-ws/beeper-oplog, which each keep their own copy of this
 * tiny helper — see documentation/beeper/architecture.md for why these
 * packages already duplicate their own Mongo connection code independently)
 * have no Dashboard session to read a repoGuid from, so the owner must be
 * configured explicitly per machine/container. Story 73: each CHAD user has
 * their own `beeper_<repoGuid>` MongoDB database — this process must never
 * guess a user, never fall back to any default, and never touch the old
 * shared `beeper` database.
 */

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reads and validates BEEPER_OWNER_REPO_GUID. Exits the process (never
 * throws) if it's missing or malformed — this must be checked before any
 * MongoDB connection is opened, so a misconfigured process fails loudly at
 * startup instead of silently reading/writing nothing or the wrong user.
 */
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

/** The one place the `beeper_<repoGuid>` database name is computed. */
export function ownerDatabaseName(repoGuid) {
  return `beeper_${repoGuid}`;
}

/** Redacts credentials out of a Mongo URI before logging it. */
export function redactMongoUri(uri) {
  return uri.replace(/\/\/([^:@/]+):([^@/]+)@/, "//$1:***@");
}
