/**
 * MongoDB connection singleton for the shared `chad` database.
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

// Module-level singleton so repeated calls (and Next.js dev-server HMR
// reloads, which re-run this module but keep the Node process alive) reuse
// one connection instead of leaking a new MongoClient per request.
let clientPromise: Promise<MongoClient> | null = null;

function connect(): Promise<MongoClient> {
  if (!clientPromise) {
    const client = new MongoClient(getMongoUri());
    clientPromise = client.connect();
  }
  return clientPromise;
}

/**
 * Returns the shared `chad` Mongo database handle, connecting once and
 * reusing the connection for the lifetime of the process.
 */
export async function getMongoDb(): Promise<Db> {
  const client = await connect();
  return client.db();
}

/**
 * Closes the shared connection. Only relevant for short-lived scripts
 * (migration tools, tests) — the dashboard's long-lived Next.js process
 * should never call this.
 */
export async function closeMongoConnection(): Promise<void> {
  if (!clientPromise) return;
  const client = await clientPromise;
  await client.close();
  clientPromise = null;
}
