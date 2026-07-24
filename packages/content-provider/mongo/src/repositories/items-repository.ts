/**
 * Mongo queries for cp items — no mapping to CpItem here (provider does that).
 */

import { getDb, getCollectionName } from "../client.js";
import type { CpMongoDocument } from "../models/document.js";

export async function findByRepoAndLoca(
  repoGuid: string,
  loca: string
): Promise<CpMongoDocument | null> {
  const db = await getDb();
  const collection = db.collection<CpMongoDocument>(getCollectionName());
  return collection.findOne({ repoId: repoGuid, loca: loca ?? "" });
}
