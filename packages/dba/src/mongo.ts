/**
 * MongoDB connection singletons — one server, two logical databases:
 * `chad` (CP items, via `MONGODB_URI`) and `beeper` (Beeper CRM
 * contacts/channels/messages, via `BEEPER_MONGODB_URI`). Same physical
 * `chad-mongodb` container, two separate connection strings/databases —
 * beeper-crm.ts's collections predate this monorepo (ported from the
 * standalone `contacts` repo's own `beeper` database) and were never meant
 * to move into `chad` alongside CP items.
 *
 * This is the ONLY place in the monorepo that is allowed to open a MongoDB
 * connection from server-side dashboard/console code — packages/dashboard
 * must never import the `mongodb` driver directly, only functions exported
 * from this package (see documentation/beeper/architecture.md, "Dashboard
 * must not talk to MongoDB directly").
 */

import { MongoClient, type Db } from "mongodb";

// Read lazily (not at module load) — same reason as client.ts's
// getContentProviderApiUrl(): Next.js imports this module while collecting
// page data at build time, before docker-compose has injected the runtime
// env var, so throwing at import time would fail every build.
function getMongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI environment variable is not set");
  }
  return uri;
}

function getBeeperMongoUri(): string {
  const uri = process.env.BEEPER_MONGODB_URI;
  if (!uri) {
    throw new Error("BEEPER_MONGODB_URI environment variable is not set");
  }
  return uri;
}

// Module-level singletons so repeated calls (and Next.js dev-server HMR
// reloads, which re-run this module but keep the Node process alive) reuse
// one connection instead of leaking a new MongoClient per request.
let clientPromise: Promise<MongoClient> | null = null;
let beeperClientPromise: Promise<MongoClient> | null = null;

function connect(): Promise<MongoClient> {
  if (!clientPromise) {
    const client = new MongoClient(getMongoUri());
    clientPromise = client.connect();
  }
  return clientPromise;
}

function connectBeeper(): Promise<MongoClient> {
  if (!beeperClientPromise) {
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
 * Returns the `beeper` Mongo database handle (Beeper CRM
 * contacts/channels/messages/timeline_events), connecting once and reusing
 * the connection for the lifetime of the process. Separate connection from
 * `getMongoDb()` — same physical server, different database.
 */
export async function getBeeperMongoDb(): Promise<Db> {
  const client = await connectBeeper();
  return client.db();
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
