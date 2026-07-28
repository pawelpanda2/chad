// Pure, backend-agnostic PostgreSQL <-> Google Sheets reconciliation logic
// (Story: pawel_f Daily/History sync-gap investigation, 2026-07-28). No
// network/DB access here — callers supply the already-fetched record lists;
// this module only does the comparison, so it's unit-testable with
// synthetic fixtures and reusable by both the live reconciliation test and
// the History status classification.

/**
 * Compares PostgreSQL record keys against a Google Sheets tab's
 * CHAD_RECORD_KEY column values.
 * @param {string[]} pgRecordKeys
 * @param {string[]} sheetRecordKeys - one entry per data row (may repeat for duplicates)
 * @returns {{missing: string[], extra: string[], duplicates: Array<{recordKey: string, count: number}>}}
 */
export function diffRecordKeys(pgRecordKeys, sheetRecordKeys) {
  const pgSet = new Set(pgRecordKeys);
  const sheetCounts = new Map();
  for (const key of sheetRecordKeys) {
    if (!key) continue;
    sheetCounts.set(key, (sheetCounts.get(key) || 0) + 1);
  }
  const sheetSet = new Set(sheetCounts.keys());

  const missing = pgRecordKeys.filter((k) => !sheetSet.has(k));
  const extra = [...sheetSet].filter((k) => !pgSet.has(k));
  const duplicates = [...sheetCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([recordKey, count]) => ({ recordKey, count }));

  return { missing, extra, duplicates };
}

/**
 * Classifies a record's outbox situation, used both by the live
 * reconciliation test and the "lost outbox" / "no sync yet" regression
 * tests (6.4/6.5 of the 2026-07-28 audit spec).
 *
 * @param {{ hasHistory: boolean, job: null | { status: string, lastError: string|null } }} input
 * @returns {"ok_synced"|"ok_pending"|"failed_visible"|"lost_outbox"|"legacy_no_history"}
 */
export function classifyOutboxState({ hasHistory, job }) {
  if (!hasHistory) {
    // Predates cp_history tracking entirely (or a manual DB write outside
    // the app) — "no sync yet" is a legitimate, non-regressive label here.
    return "legacy_no_history";
  }
  if (!job) {
    // Has a real mutation on record but zero outbox job was ever created —
    // this is the pawel_f Daily bug: a real integrity gap, never a
    // legitimate "no sync yet".
    return "lost_outbox";
  }
  if (job.status === "synced") return "ok_synced";
  if (job.status === "failed") return "failed_visible";
  return "ok_pending";
}
