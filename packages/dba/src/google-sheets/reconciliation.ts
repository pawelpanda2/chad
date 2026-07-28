/**
 * Product-code PostgreSQL <-> Google Sheets reconciliation (2026-07-28,
 * following the pawel_f Daily lost-outbox finding — see
 * tests/release-audit-report.md). Previously this diff/classification logic
 * lived only in tests/support/google-sheets/reconciliation.mjs; moved here
 * so `packages/dba/scripts/reconcile-google-sheets.mjs` (the real,
 * operator-facing dry-run/apply repair tool) and the regression tests share
 * one implementation, never two copies that can drift.
 */

export interface RecordKeyDiff {
  missing: string[];
  extra: string[];
  duplicates: Array<{ recordKey: string; count: number }>;
}

/** Compares PostgreSQL record keys against a Google Sheets tab's CHAD_RECORD_KEY column values. */
export function diffRecordKeys(pgRecordKeys: string[], sheetRecordKeys: string[]): RecordKeyDiff {
  const pgSet = new Set(pgRecordKeys);
  const sheetCounts = new Map<string, number>();
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

export type OutboxState = "ok_synced" | "ok_pending" | "failed_visible" | "lost_outbox" | "legacy_no_history";

/**
 * Classifies a record's outbox situation — `lost_outbox` (real cp_history,
 * zero outbox job ever) is the exact shape of the pawel_f Daily bug and
 * must never be reported as the same "no sync yet" state as
 * `legacy_no_history` (a record that predates the integration entirely,
 * where no-sync-yet is the correct, permanent answer).
 */
export function classifyOutboxState(input: {
  hasHistory: boolean;
  job: { status: string; lastError?: string | null } | null;
}): OutboxState {
  if (!input.hasHistory) return "legacy_no_history";
  if (!input.job) return "lost_outbox";
  if (input.job.status === "synced") return "ok_synced";
  if (input.job.status === "failed") return "failed_visible";
  return "ok_pending";
}
