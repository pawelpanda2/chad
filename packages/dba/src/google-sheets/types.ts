/**
 * Shared types for the Google Sheets sync follower (Story 75).
 *
 * Google Sheets is a one-way export/mirror target, not a
 * `CpCompatibleDataProvider` (no `address`/`type`/`id` concept for a
 * spreadsheet row) — this is a deliberately separate, parallel type set
 * from `data-providers/types.ts`/`data-commands.ts`, not a reuse of them.
 * See `backlog/stories/75/02_plan.md` §2 for the reasoning.
 */

/** Which write triggered this sync job. */
export type GoogleSheetsSyncKind = "upsert" | "delete";

/**
 * Which Dashboard table this record belongs to — decides which sheet
 * tab/target, which column mapping, and which header list a job uses (see
 * `worker.ts`). Date Entry never actually produces a `kind: "delete"` job
 * today (no `deleteDateEntry` exists), but the type isn't narrowed to
 * enforce that — it's a real-world fact, not an invariant worth encoding.
 */
export type SheetRecordType = "daily-entry" | "date-entry";

/**
 * Everything needed to write (or mark-delete) exactly one row in Google
 * Sheets — a complete snapshot, not a diff, so replaying the same job twice
 * is always idempotent.
 */
export interface SheetSyncPayload {
  recordType: SheetRecordType;
  /** Stable identity for this record: `${repoGuid}:${loca}` — see plan §5. */
  recordKey: string;
  repoGuid: string;
  /**
   * CHAD username, resolved from the request-scoped repo context (never
   * from request body/query) at enqueue time — see `sync.ts`. Carried on
   * the job for observability/audit only; `spreadsheetId` below is what the
   * worker actually uses to route the write.
   */
  username: string;
  /**
   * This user's own spreadsheet id, resolved once at enqueue time via
   * `resolveSpreadsheetIdForUser` (per-user mapping, Story 75 follow-up —
   * see `config.ts`'s revision note). Baked into the job snapshot rather
   * than re-resolved by the worker so a later remap of a user's spreadsheet
   * never changes where an already-queued job lands — consistent with every
   * other field on this payload being a frozen snapshot, not a live lookup.
   */
  spreadsheetId: string;
  loca: string;
  itemName: string;
  /**
   * Raw fields as already stored (un-typed strings, literal sheet-style
   * keys like `DATE`, `TRAINING TIME`, ...), plus — for `recordType:
   * "daily-entry"` only — the four computed "— AUTO" columns, freshly
   * computed by the caller (`leads.ts`) at write time so the sheet is a
   * faithful mirror of what the Dashboard itself shows (see
   * `leads.ts`'s `computeDailyAutoFieldsForSheetSync`). Empty for
   * `kind: "delete"`.
   */
  fields: Record<string, string>;
}

export interface GoogleSheetsTarget {
  spreadsheetId: string;
  sheetName: string;
  /**
   * How many leading rows are header rows, not data (default 1 wherever
   * unspecified/read as `?? 1`). The "dates" tab has exactly 1 (the column-
   * name row). The "daily" tab has 2 (Story 75 visual-layout follow-up,
   * 2026-07-21): row 1 is a purely decorative, merged group-label row
   * ("TRAINING"/"ACTION"/"TEXTING"/"RESULTS", mirroring the Dashboard's own
   * two-row header — see `layout.ts`), row 2 is the real column-name row
   * `ensureHeaders`/`findRowByKey`/data rows are anchored against. Only
   * `layout.ts`'s `ensureDailyTrackerLayout` ever writes to row 1 — every
   * other function in this module (`ensureHeaders`, `findRowByKey`,
   * `updateRow`, `appendRow`, the whole per-record sync path) only ever
   * reads/writes the LAST header row (index `headerRowCount`) and
   * everything below it, and is otherwise completely unaware row 1 exists.
   */
  headerRowCount?: number;
}

/**
 * A single row as it should appear in the sheet, already resolved to
 * header-name -> string-value pairs — the mapper's output, the client's
 * input. Keeps the client itself free of any Daily-Tracker-specific field
 * knowledge (it only knows how to read/write a header-mapped row).
 */
export type SheetRowValues = Record<string, string>;

/**
 * Server-side Google Sheets client seam. The real implementation
 * (`sheets-api-client.ts`) talks to the Sheets API v4 over `fetch`; tests
 * and any caller without real credentials use `FakeGoogleSheetsClient`
 * (`fake-client.ts`) instead — Google's API is never called from a test.
 */
export interface GoogleSheetsClient {
  /**
   * Ensures the header row contains at least `requiredHeaders`, in order,
   * appending any missing ones at the end (never reordering/removing
   * existing headers, including ones CHAD doesn't know about — "manual"
   * columns). Returns the full current header list, in sheet order, after
   * this call.
   */
  ensureHeaders(target: GoogleSheetsTarget, requiredHeaders: string[]): Promise<string[]>;

  /**
   * Looks up the row whose `keyHeader` column equals `keyValue`. Returns
   * the 1-based sheet row number, or `null` if no such row exists yet.
   */
  findRowByKey(target: GoogleSheetsTarget, keyHeader: string, keyValue: string): Promise<number | null>;

  /**
   * Writes `values` into `rowNumber` (1-based, header row is row 1), only
   * touching the columns named in `values` — any other column in that row
   * (including manual/unknown ones) is left untouched.
   */
  updateRow(target: GoogleSheetsTarget, rowNumber: number, values: SheetRowValues): Promise<void>;

  /** Appends a new row at the end of the sheet with `values` in the right named columns. */
  appendRow(target: GoogleSheetsTarget, values: SheetRowValues): Promise<void>;

  /**
   * Resolves a tab's numeric `sheetId` — every `batchUpdate` request that
   * addresses a range (`GridRange`) needs this, never the tab name. Added
   * for `layout.ts` (Story 75 visual-layout follow-up); the per-record sync
   * path above never needs it.
   */
  getSheetId(target: GoogleSheetsTarget): Promise<number>;

  /**
   * Raw passthrough to the Sheets API's `spreadsheets.batchUpdate` — the
   * only write primitive `layout.ts`'s formatting/structure requests use
   * (`repeatCell`, `updateDimensionProperties`, `updateSheetProperties`,
   * `mergeCells`, `setDataValidation`, `setBasicFilter`,
   * `create`/`updateDeveloperMetadata`, ...). Deliberately untyped
   * (`Record<string, unknown>[]`) rather than modeling the Sheets API's
   * full request union — `layout.ts` is the only caller and already knows
   * the exact shape of what it sends; adding a parallel type for Google's
   * own (large, versioned) request schema here would be pure duplication.
   */
  batchUpdate(spreadsheetId: string, requests: Record<string, unknown>[]): Promise<void>;

  /**
   * Reads one sheet-scoped (tab-scoped) developer-metadata value — used
   * only for `CHAD_SHEET_LAYOUT_VERSION` (`layout.ts`), so a layout
   * re-apply can cheaply no-op when the tab is already on the current
   * version, and so a version bump can be detected and re-applied.
   * Returns `null` if unset (never-yet-laid-out tab, or an old tab from
   * before this Story's follow-up).
   */
  getSheetDeveloperMetadata(target: GoogleSheetsTarget, key: string): Promise<string | null>;
}
