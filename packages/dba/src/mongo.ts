/**
 * MongoDB connection singletons — one server, N+1 logical databases:
 * `chad` (CP items, via `MONGODB_URI`) and one `beeper_<repoGuid>` per CHAD
 * user (Beeper CRM contacts/channels/messages, via `BEEPER_MONGODB_URI`,
 * which as of Story 73 is a *server* URI with no database segment — the
 * database name is always computed here, never taken from the connection
 * string or from a caller-supplied value).
 *
 * Story 73: each CHAD user gets a fully separate MongoDB database
 * (`beeper_<repoGuid>`), not a shared `beeper` database with an
 * `ownerRepoGuid` field and not collection-name prefixing — see
 * documentation/beeper/architecture.md and
 * documentation/dashboard/common/features/chad-user-data-isolation.md.
 * Before this Story, `getBeeperMongoDb()` took no argument and always
 * returned the single global `beeper` database, which is exactly why
 * `kamil_s` could see `pawel_f`'s contacts — there was no per-user
 * selection at all.
 *
 * This is the ONLY place in the monorepo that is allowed to open a MongoDB
 * connection from server-side dashboard/console code — packages/dashboard
 * must never import the `mongodb` driver directly, only functions exported
 * from this package (see documentation/beeper/architecture.md, "Dashboard
 * must not talk to MongoDB directly").
 */

import { MongoClient, type Db } from "mongodb";
import { getEffectiveMongoUri, getEffectiveBeeperMongoUri, getDevDbOverrideGeneration } from "./dev-db-override.js";

// Read lazily (not at module load) — same reason as client.ts's
// getContentProviderApiUrl(): Next.js imports this module while collecting
// page data at build time, before docker-compose has injected the runtime
// env var, so throwing at import time would fail every build. Routed
// through dev-db-override.ts (Story 83) so the Dev Panel's Settings tab can
// switch local dev between local/QNAP Mongo without a process restart.
function getMongoUri(): string {
  return getEffectiveMongoUri();
}

function getBeeperMongoUri(): string {
  return getEffectiveBeeperMongoUri();
}

// Full-format GUID, case-insensitive (matches how repoGuid is generated
// and stored everywhere else in this codebase — see chad_admin's
// users-list and repo-context.ts).
const GUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertValidRepoGuid(repoGuid: string): void {
  if (typeof repoGuid !== "string" || !GUID_RE.test(repoGuid)) {
    throw new Error(
      `getBeeperMongoDb: invalid repoGuid ${JSON.stringify(
        repoGuid
      )} — expected a full GUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).`
    );
  }
}

// Module-level singletons so repeated calls (and Next.js dev-server HMR
// reloads, which re-run this module but keep the Node process alive) reuse
// one connection instead of leaking a new MongoClient per request. One
// MongoClient per server (this one, and the CP one below) — many Db
// handles off of it, one per repoGuid for Beeper. Db handles themselves are
// not cached: `client.db(name)` is a cheap, stateless lookup, so there is
// nothing worth caching per-user beyond the shared underlying connection.
let clientPromise: Promise<MongoClient> | null = null;
let beeperClientPromise: Promise<MongoClient> | null = null;
// Generation the currently-cached connection was opened under (Story 83) —
// when the Dev Panel's Settings tab flips the Mongo source, the override's
// generation counter bumps and these go stale; the next connect() call
// below tears down the old connection and opens a fresh one against the
// new source instead of silently keeping the old one alive forever.
let connectedGeneration = -1;
let beeperConnectedGeneration = -1;

function connect(): Promise<MongoClient> {
  const generation = getDevDbOverrideGeneration();
  if (clientPromise && connectedGeneration !== generation) {
    const stale = clientPromise;
    clientPromise = null;
    stale.then((client) => client.close()).catch(() => {});
  }
  if (!clientPromise) {
    connectedGeneration = generation;
    const client = new MongoClient(getMongoUri());
    clientPromise = client.connect();
  }
  return clientPromise;
}

function connectBeeperServer(): Promise<MongoClient> {
  const generation = getDevDbOverrideGeneration();
  if (beeperClientPromise && beeperConnectedGeneration !== generation) {
    const stale = beeperClientPromise;
    beeperClientPromise = null;
    stale.then((client) => client.close()).catch(() => {});
  }
  if (!beeperClientPromise) {
    beeperConnectedGeneration = generation;
    const client = new MongoClient(getBeeperMongoUri());
    beeperClientPromise = client.connect();
  }
  return beeperClientPromise;
}

/**
 * Returns the shared `chad` Mongo database handle (CP items), connecting
 * once and reusing the connection for the lifetime of the process.
 */
export async function getMongoDb(): Promise<Db> {
  const client = await connect();
  return client.db();
}

/**
 * Returns the shared `chad`-database MongoClient itself (Story 79) — needed
 * only by `cp-history-write.ts`'s `executeCpMutationWithHistory`, which must
 * open a `ClientSession` for a multi-collection transaction
 * (`cp_items` + `cp_history` in one commit). Everything else in this
 * package should keep using `getMongoDb()`; a session/transaction is only
 * ever needed around a single cp_items mutation + its one cp_history event.
 */
export async function getMongoClient(): Promise<MongoClient> {
  return connect();
}

/**
 * Returns this user's own Beeper Mongo database handle
 * (`beeper_<repoGuid>` — contacts/channels/messages/timeline_events/...),
 * connecting once per process and reusing the connection for every user
 * (many `Db` handles off one shared `MongoClient`/server connection).
 *
 * `repoGuid` is required and validated as a full GUID — there is
 * deliberately no fallback to any other database (not `pawel_f`'s, not the
 * old shared `beeper` db) and no way for a caller to pass an arbitrary
 * database name: the name is always computed here, from an
 * already-verified repoGuid, as `beeper_${repoGuid}`.
 */
export async function getBeeperMongoDb(repoGuid: string): Promise<Db> {
  assertValidRepoGuid(repoGuid);
  const client = await connectBeeperServer();
  return client.db(`beeper_${repoGuid}`);
}

/**
 * Closes both shared connections. Only relevant for short-lived scripts
 * (migration tools, tests) — the dashboard's long-lived Next.js process
 * should never call this.
 */
export async function closeMongoConnection(): Promise<void> {
  if (clientPromise) {
    const client = await clientPromise;
    await client.close();
    clientPromise = null;
  }
  if (beeperClientPromise) {
    const client = await beeperClientPromise;
    await client.close();
    beeperClientPromise = null;
  }
}
