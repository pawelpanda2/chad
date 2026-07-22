/**
 * Pure Daily Entry / Date Entry -> Google Sheets row mapping (Story 75,
 * plan §6, revised after direct user feedback on 2026-07-21 to be a
 * faithful mirror of the Dashboard's own tables). No I/O, no Google/Mongo
 * access — fully unit-testable on its own.
 *
 * Column order/labels are copied verbatim from the Dashboard's own source
 * of truth — `DAILY_COLUMNS`/`DATE_COLUMNS` in
 * `packages/dashboard/app/(dashboard)/dashboard/views/page.tsx` — not
 * re-derived from the older, now-stale field list in
 * `human-docs/dashboard/forms/features/daily-tracker-dates.md` §3 (that
 * doc places `OUTINGS` right after `ACTION TIME`; the live UI puts it last,
 * under the `RESULTS` group — the live code wins).
 */

import type { SheetRowValues, SheetSyncPayload } from "./types.js";

/**
 * Current export schema version — bump if the technical/domain column set
 * changes shape. Bumped to "2" (2026-07-22) when the "N" item-number
 * column was added as an always-visible first column (see
 * `ITEM_NUMBER_COLUMN` below) — mirrors the Dashboard's own "n" toggle
 * button (`packages/dashboard/app/(dashboard)/dashboard/views/page.tsx`),
 * which shows `entry.itemName` so the user can correlate a spreadsheet row
 * with the underlying Content Provider item.
 */
export const SHEET_SCHEMA_VERSION = "2";

/**
 * Technical columns — placed *after* every domain column (plan revision,
 * 2026-07-21) so the sheet reads as a faithful copy of the Dashboard table
 * when scanning left to right, with CHAD's own bookkeeping columns tucked
 * out of the way at the end rather than up front.
 */
export const TECHNICAL_COLUMNS = [
  "CHAD_RECORD_KEY",
  "CHAD_REPO_GUID",
  "CHAD_ITEM_NAME",
  "CHAD_LOCA",
  "CHAD_CREATED_AT",
  "CHAD_UPDATED_AT",
  "CHAD_SCHEMA_VERSION",
  "CHAD_SYNC_STATUS",
] as const;

/**
 * Columns that are only ever meaningful at the moment a row is first
 * created — set once on `appendRow`, then never touched again by an
 * `updateRow` call. See `worker.ts`.
 */
export const IMMUTABLE_ON_UPDATE_COLUMNS = [
  "CHAD_CREATED_AT",
  "CHAD_ITEM_NAME",
  "CHAD_REPO_GUID",
  "CHAD_LOCA",
  "N",
] as const;

/**
 * Column group — verbatim copy of the Dashboard's own `Group` type
 * (`packages/dashboard/app/(dashboard)/dashboard/views/page.tsx`). Daily
 * Entry only; Date Entry has no group row in the Dashboard at all (the
 * `isTracker &&` guard around that `<tr>` — Date Entry columns are always
 * `"none"`). Used by `layout.ts` for the daily tab's merged group-label row
 * and group header/cell background colors — pure visual metadata, never
 * read by the value-mapping functions below.
 */
export type SheetColumnGroup = "none" | "training" | "action" | "texting" | "results";

export interface SheetColumnSpec {
  /** The domain field key as stored in `SheetSyncPayload.fields` (matches the Dashboard's `DAILY_COLUMNS`/`DATE_COLUMNS` `key`). For `ITEM_NUMBER_COLUMN` this is a sentinel, not a real `fields` key — see `mapToSheetRow`'s special case. */
  key: string;
  /** The literal sheet column header text (matches the Dashboard's own `label` — e.g. the em-dash in "PULLS — AUTO"). */
  label: string;
  /** Verbatim copy of the Dashboard's own per-column `group` (visual layout only, see `SheetColumnGroup`). */
  group: SheetColumnGroup;
}

/**
 * The "N" item-number column — always the first column on both tabs, never
 * hidden (unlike every other CHAD_* technical column). Mirrors the
 * Dashboard's own "n" toggle button (`views/page.tsx`), which shows
 * `entry.itemName` (the Content Provider item's own zero-padded sequence
 * number, e.g. "01", "02", set once at creation by `generateEntryName` in
 * `leads.ts`) so the user can correlate a spreadsheet row with the
 * underlying `cp_item` (2026-07-22 follow-up — the Dashboard only shows
 * this behind a click, so it was missing from the sheet's default view;
 * here it's always visible instead, matching the "n" button's own value).
 * `key: "N"` is a sentinel handled specially in `mapToSheetRow` (its value
 * comes from `payload.itemName`, not `payload.fields`).
 */
export const ITEM_NUMBER_COLUMN: SheetColumnSpec = { key: "N", label: "N", group: "none" };

/**
 * How many leading rows are headers on each tab (Story 75 visual-layout
 * follow-up, 2026-07-21) — see `types.ts`'s `GoogleSheetsTarget.headerRowCount`
 * doc comment for the full reasoning. `worker.ts`'s `targetFor` is the one
 * place these are actually attached to a `GoogleSheetsTarget`.
 */
export const DAILY_TRACKER_HEADER_ROW_COUNT = 2;
export const DATE_ENTRIES_HEADER_ROW_COUNT = 1;

/**
 * Daily Entry ("Tracker") columns — verbatim copy of `DAILY_COLUMNS` in
 * `packages/dashboard/app/(dashboard)/dashboard/views/page.tsx`, including
 * the four computed "— AUTO" columns (Story 75 originally excluded these
 * since they're not persisted server-side; revised after the user asked
 * for a faithful copy of the actual table, AUTO columns included — see
 * `leads.ts`'s `computeDailyAutoFieldsForSheetSync`, which computes them
 * fresh at sync time from Date Entry data, the same way the Dashboard's own
 * `/api/forms/daily-entry` GET does).
 */
export const DAILY_ENTRY_DOMAIN_COLUMNS: SheetColumnSpec[] = [
  ITEM_NUMBER_COLUMN,
  { key: "DATE", label: "DATE", group: "none" },
  { key: "STATE", label: "STATE", group: "training" },
  { key: "TRAINING TIME", label: "TRAINING TIME", group: "training" },
  { key: "VERBAL EXERCISES", label: "VERBAL EXERCISES", group: "training" },
  { key: "INFIELD", label: "INFIELD", group: "training" },
  { key: "THEORY", label: "THEORY", group: "training" },
  { key: "FIELD REVIEW", label: "FIELD REVIEW", group: "training" },
  { key: "ACTION TIME", label: "ACTION TIME", group: "action" },
  { key: "APPROACHES", label: "APPROACHES", group: "action" },
  { key: "LONG INTERACTIONS", label: "LONG INTERACTIONS", group: "action" },
  { key: "NUMBERS", label: "NUMBERS", group: "action" },
  { key: "PULLS AUTO", label: "PULLS — AUTO", group: "action" },
  { key: "FIRST MESSAGES", label: "FIRST MESSAGES", group: "texting" },
  { key: "RESPONSES", label: "RESPONSES", group: "texting" },
  { key: "DATES SET UP", label: "DATES SET UP", group: "texting" },
  { key: "DATES", label: "DATES", group: "texting" },
  { key: "CLOSES AUTO", label: "CLOSES — AUTO", group: "results" },
  { key: "QUALITY DP AUTO", label: "QUALITY D/P — AUTO", group: "results" },
  { key: "QUALITY C AUTO", label: "QUALITY C — AUTO", group: "results" },
  { key: "OUTINGS", label: "OUTINGS", group: "results" },
];

/**
 * Date Entry ("Dates") columns — verbatim copy of `DATE_COLUMNS` in the
 * same Dashboard file. No "— AUTO" columns exist for this table, and the
 * Dashboard never renders a group-label row for Dates at all (`isTracker &&`
 * guard) — every column is `group: "none"`.
 */
export const DATE_ENTRY_DOMAIN_COLUMNS: SheetColumnSpec[] = [
  ITEM_NUMBER_COLUMN,
  { key: "DATA", label: "DATA", group: "none" },
  { key: "ŹRÓDŁO", label: "ŹRÓDŁO", group: "none" },
  { key: "NAZWA", label: "NAZWA", group: "none" },
  { key: "LINK", label: "LINK", group: "none" },
  { key: "PULL", label: "PULL", group: "none" },
  { key: "CLOSE", label: "CLOSE", group: "none" },
  { key: "JAKOŚĆ", label: "JAKOŚĆ", group: "none" },
];

/** Full header set used only to seed a brand-new, empty "daily" tab. */
export const DAILY_TRACKER_SHEET_HEADERS: string[] = [
  ...DAILY_ENTRY_DOMAIN_COLUMNS.map((c) => c.label),
  ...TECHNICAL_COLUMNS,
];

/** Full header set used only to seed a brand-new, empty "dates" tab. */
export const DATE_ENTRIES_SHEET_HEADERS: string[] = [
  ...DATE_ENTRY_DOMAIN_COLUMNS.map((c) => c.label),
  ...TECHNICAL_COLUMNS,
];

export type SyncStatusColumnValue = "ACTIVE" | "DELETED";

function mapToSheetRow(
  domainColumns: SheetColumnSpec[],
  payload: SheetSyncPayload,
  now: string,
  syncStatus: SyncStatusColumnValue
): SheetRowValues {
  const row: SheetRowValues = {};
  for (const column of domainColumns) {
    // ITEM_NUMBER_COLUMN's value comes from payload.itemName, not
    // payload.fields — it's not a domain field at all, just prepended here
    // so it shares the domain columns' ordering/grouping machinery.
    const value = column === ITEM_NUMBER_COLUMN ? payload.itemName : payload.fields[column.key];
    row[column.label] = value === undefined || value === null ? "" : String(value);
  }

  row.CHAD_RECORD_KEY = payload.recordKey;
  row.CHAD_REPO_GUID = payload.repoGuid;
  row.CHAD_ITEM_NAME = payload.itemName;
  row.CHAD_LOCA = payload.loca;
  row.CHAD_CREATED_AT = now;
  row.CHAD_UPDATED_AT = now;
  row.CHAD_SCHEMA_VERSION = SHEET_SCHEMA_VERSION;
  row.CHAD_SYNC_STATUS = syncStatus;
  return row;
}

/**
 * Maps one Daily Entry write (create/update snapshot) to its Sheets row
 * values, by column name. `now` is the sync-time timestamp — used for both
 * `CHAD_UPDATED_AT` and, when this row is being appended for the first
 * time, `CHAD_CREATED_AT`.
 *
 * `CHAD_CREATED_AT`'s "never changes after creation" rule is enforced by
 * the caller (`worker.ts`), not here — see `IMMUTABLE_ON_UPDATE_COLUMNS`.
 */
export function mapDailyEntryToSheetRow(
  payload: SheetSyncPayload,
  now: string,
  syncStatus: SyncStatusColumnValue = "ACTIVE"
): SheetRowValues {
  return mapToSheetRow(DAILY_ENTRY_DOMAIN_COLUMNS, payload, now, syncStatus);
}

/** Same mapping, for the "dates" tab's Date Entry columns. */
export function mapDateEntryToSheetRow(
  payload: SheetSyncPayload,
  now: string,
  syncStatus: SyncStatusColumnValue = "ACTIVE"
): SheetRowValues {
  return mapToSheetRow(DATE_ENTRY_DOMAIN_COLUMNS, payload, now, syncStatus);
}

/**
 * Row values for a delete: only the technical columns change (status ->
 * DELETED, updated timestamp bumped) — every domain column is left out of
 * the returned object entirely, so `updateRow` (which only touches the
 * columns present in `values`) never overwrites the row's last-known domain
 * values with blanks. Shared by both record types (only Daily Entry
 * actually has a real delete today — see `leads.ts`'s `deleteDailyEntry` —
 * but this mapping itself has no record-type-specific content).
 */
export function mapDeleteToSheetRow(payload: SheetSyncPayload, now: string): SheetRowValues {
  return {
    CHAD_RECORD_KEY: payload.recordKey,
    CHAD_UPDATED_AT: now,
    CHAD_SCHEMA_VERSION: SHEET_SCHEMA_VERSION,
    CHAD_SYNC_STATUS: "DELETED",
  };
}
