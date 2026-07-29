import { MongoClient } from "mongodb";
import { ownerDatabaseName } from "./owner-db.js";
import type { Config } from "./config.js";

/**
 * Confirms the target Mongo (whatever `MONGODB_URI` in .env.mac-beeper
 * currently points at — local or QNAP's beeper-mongodb over Tailscale) is
 * reachable and that this owner's database is usable, BEFORE spawning
 * beeper-ws/beeper-sync. This is what lets beeper-synch tell a Mongo
 * connectivity error apart from a Beeper Desktop connectivity error
 * (prompt 3.3) instead of letting a child process crash-loop with an
 * opaque stack trace.
 */
export async function preflightMongo(config: Config): Promise<void> {
  const client = new MongoClient(config.mongodbUri, { serverSelectionTimeoutMS: 5_000 });
  try {
    await client.connect();
    const db = client.db(ownerDatabaseName(config.ownerRepoGuid));
    await db.command({ ping: 1 });
  } finally {
    await client.close();
  }
}
