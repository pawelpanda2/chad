/**
 * Connection helper only — no queries here. Points at the SAME shared
 * MongoDB instance planned for contacts/Beeper/dashboard (one instance,
 * separate collections/logical DBs per consumer — see
 * documentation/dashboard/common/features/shared-qnap-services.md),
 * NOT a dedicated Content-Provider-only database.
 *
 * Local dev default matches docker-compose.local.yml's `mongodb` service
 * (chad-mongodb-local-mac-docker, port from MONGODB_PORT/27017). On QNAP,
 * the shared instance has no published host port (internal-only on the
 * chad-shared network) — CP_MONGO_URI must be set explicitly there.
 */

import { MongoClient, type Db } from "mongodb";

const DEFAULT_LOCAL_URI = "mongodb://change_me:change_me@localhost:27017";
const DEFAULT_DB_NAME = "chad";
const DEFAULT_COLLECTION_NAME = "content_provider_items";

let client: MongoClient | undefined;

export function getMongoUri(): string {
  return process.env.CP_MONGO_URI ?? DEFAULT_LOCAL_URI;
}

export function getDbName(): string {
  return process.env.CP_MONGO_DB_NAME ?? DEFAULT_DB_NAME;
}

export function getCollectionName(): string {
  return process.env.CP_MONGO_COLLECTION_NAME ?? DEFAULT_COLLECTION_NAME;
}

async function getClient(): Promise<MongoClient> {
  if (!client) {
    client = new MongoClient(getMongoUri());
    await client.connect();
  }
  return client;
}

export async function getDb(): Promise<Db> {
  const c = await getClient();
  return c.db(getDbName());
}

export async function closeMongoClient(): Promise<void> {
  if (client) {
    await client.close();
    client = undefined;
  }
}
