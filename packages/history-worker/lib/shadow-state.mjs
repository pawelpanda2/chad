// Persistent "last known state" store (Story 78, Input 1 §3.4) —
// `chad.cp_history_last_state`, one document per cp_items sourceId, updated
// progressively as this worker actually processes events. Read back at
// startup to seed the in-memory diff cache so a restart doesn't lose
// before/address/actor context for items this worker already has real
// history for.
//
// Deliberately NOT a bootstrap from cp_items itself — this store only ever
// contains state this worker derived from events it actually observed and
// already wrote to cp_history, so seeding from it at startup can never
// fabricate a "before" for an item whose first-ever history event hasn't
// happened yet (that item correctly still gets beforeUnknown: true on its
// next event, same as before this Story).

export const SHADOW_STATE_COLLECTION = "cp_history_last_state";

export function shadowStateCollection(db) {
  return db.collection(SHADOW_STATE_COLLECTION);
}

/** @returns {Promise<Map<any, {config: object, body: string, actor: object | null}>>} */
export async function loadShadowState(db) {
  const docs = await shadowStateCollection(db).find({}).toArray();
  const map = new Map();
  for (const doc of docs) {
    map.set(doc._id, { config: doc.config, body: doc.body, actor: doc.actor ?? null });
  }
  return map;
}

/**
 * @param {any} sourceId
 * @param {{config: object, body: string, actor: object | null} | null} nextState
 *   `null` deletes the shadow-state entry (item was deleted).
 */
export async function saveShadowState(db, sourceId, nextState) {
  const col = shadowStateCollection(db);
  if (nextState === null) {
    await col.deleteOne({ _id: sourceId });
    return;
  }
  await col.updateOne(
    { _id: sourceId },
    { $set: { config: nextState.config, body: nextState.body, actor: nextState.actor, updatedAt: new Date() } },
    { upsert: true }
  );
}
