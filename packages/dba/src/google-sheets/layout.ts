/**
 * Visual layout / formatting for the "daily" and "dates" tabs (Story 75
 * visual-layout follow-up, 2026-07-21) — makes each tab actually *look*
 * like the Dashboard's own `views/daily`/`views/dates` tables (column
 * groups, colors, widths, frozen panes, ...), not just contain the same
 * data under the same headers.
 *
 * Every color/width/grouping value here is derived from the Dashboard's own
 * real rendering source — `packages/dashboard/app/(dashboard)/dashboard/
 * views/page.tsx` (`DAILY_COLUMNS`/`DATE_COLUMNS`, `GROUP_HEADER_CLASS`,
 * `CELL_CLASS`) and its Tailwind/shadcn theme
 * (`packages/dashboard/app/globals.css`'s `:root` OKLCH tokens) — not
 * invented. See `ai-docs/google-sheets/architecture.md` §11 for the full
 * Dashboard-element -> Sheets-equivalent audit and exactly which elements
 * have NO faithful equivalent (documented there, never silently dropped).
 *
 * Deliberately separate from `worker.ts`'s per-record sync path (own
 * requirement: "nie resetuj całej zakładki przy każdym zapisie") —
 * `ensureDailyTrackerLayout`/`ensureDatesLayout` are called once per target
 * at process/worker startup (`bootstrap.ts`), gated by
 * `CHAD_SHEET_LAYOUT_VERSION` sheet-scoped developer metadata so a normal
 * restart is a cheap no-op (one read, no `batchUpdate` at all) unless
 * `LAYOUT_VERSION` was actually bumped. `processGoogleSheetsJobOnce` never
 * calls anything in this file.
 *
 * Every request here is either a formatting/structure request (background,
 * border, width, frozen panes, validation, filter, merge, developer
 * metadata) or the one-time group-row label text — never a request that
 * touches a domain/technical column's data value in a data row. This is
 * also why re-applying (e.g. after a version bump) can never destroy data
 * or a user's manually-added extra column: nothing here ever writes to a
 * column outside the fixed domain+technical range, and nothing here ever
 * writes row values below the header rows.
 */

import type { GoogleSheetsClient, GoogleSheetsTarget } from "./types.js";
import {
  DAILY_ENTRY_DOMAIN_COLUMNS,
  DATE_ENTRY_DOMAIN_COLUMNS,
  DAILY_TRACKER_HEADER_ROW_COUNT,
  DATE_ENTRIES_HEADER_ROW_COUNT,
  TECHNICAL_COLUMNS,
  type SheetColumnGroup,
  type SheetColumnSpec,
} from "./mapper.js";

/**
 * Bumped whenever this file's requests change shape/values in a way that
 * needs re-applying to already-laid-out tabs. Stored as sheet-scoped
 * developer metadata (key `CHAD_SHEET_LAYOUT_VERSION`), never a visible
 * column — a layout version is a per-TAB property, not a per-ROW one (see
 * `types.ts`'s `GoogleSheetsTarget.headerRowCount` doc and this file's own
 * header comment).
 *
 * v6 (2026-07-22): `mapper.ts` gained `ITEM_NUMBER_COLUMN` ("N") as the
 * first domain column on both tabs — bumping re-applies header/group/width
 * formatting so it picks up the widened domain-column range. The physical
 * column itself is NOT inserted by this file for the two already-live
 * spreadsheets — that's a one-time structural change (shifts every
 * existing column right by one) done once via a dedicated migration script
 * BEFORE this version's code is deployed, same reasoning as the
 * `insertDimension`-on-first-application case below: this file only ever
 * formats an already-correct column range, it never itself inserts/deletes
 * columns for a version bump (only for the one documented first-ever-row
 * case). A brand new tab (`currentVersion === null`) needs no such script —
 * `ensureHeaders` already writes "N" first because `mapper.ts`'s column
 * arrays do, from its very first header write.
 */
export const LAYOUT_VERSION = "6";
export const LAYOUT_VERSION_METADATA_KEY = "CHAD_SHEET_LAYOUT_VERSION";

/**
 * Cell-level formatting (background tint, alignment, wrap, group
 * separators) is applied to a bounded row range, never an open-ended one
 * ("nie rozszerzaj zakresów bez końca") — this is comfortably more than
 * either user's real row count will reach for years at normal usage, and a
 * future need to raise it is a one-line change + `LAYOUT_VERSION` bump, the
 * same mechanism as any other layout change.
 */
export const MAX_FORMATTED_DATA_ROWS = 5000;

// ============================================================================
// Colors — computed from the Dashboard's actual Tailwind classes/theme
// tokens, not guessed. See architecture.md §11 for the derivation.
// ============================================================================

interface RgbColor {
  red: number;
  green: number;
  blue: number;
}

function rgb(hexColor: string): RgbColor {
  const clean = hexColor.replace("#", "");
  return {
    red: parseInt(clean.slice(0, 2), 16) / 255,
    green: parseInt(clean.slice(2, 4), 16) / 255,
    blue: parseInt(clean.slice(4, 6), 16) / 255,
  };
}

/** Header-row background per group — Dashboard's `GROUP_HEADER_CLASS` (light-mode value; Sheets has no dark-mode concept to mirror). */
export const GROUP_HEADER_BG: Record<SheetColumnGroup, RgbColor> = {
  none: rgb("#F5F5F5"), // bg-muted (shadcn --muted, oklch(0.97 0 0))
  training: rgb("#DCFCE7"), // bg-green-100
  action: rgb("#FEF3C7"), // bg-amber-100
  texting: rgb("#DBEAFE"), // bg-blue-100
  results: rgb("#FFE4E6"), // bg-rose-100
};

/** Data-row cell background per group — Dashboard's `CELL_CLASS` (its own `*-50` tint at ~60% opacity, flattened onto white here since Sheets fills are opaque, not alpha-blended — see architecture.md §11 for the exact blend math). */
export const GROUP_BODY_BG: Record<SheetColumnGroup, RgbColor> = {
  none: rgb("#FFFFFF"),
  training: rgb("#F6FEF8"),
  action: rgb("#FFFDF3"),
  texting: rgb("#F5FAFF"),
  results: rgb("#FFF7F7"),
};

/** Dashboard's `border` (shadcn --border, oklch(0.922 0 0)) — every grid line. */
const BORDER_COLOR = rgb("#E5E5E5");
const THIN_BORDER = { style: "SOLID", width: 1, color: BORDER_COLOR };

const HEADER_TEXT_FORMAT = { bold: true, fontSize: 9 };
const BODY_TEXT_FORMAT = { fontSize: 9 };

// ============================================================================
// Column width — Dashboard has no fixed pixel widths (browser auto-sizes to
// content: header label width via `whitespace-nowrap` with no truncate).
// Real equivalent, not a guessed heuristic (user feedback, 2026-07-22,
// LAYOUT_VERSION 5): Sheets' own `autoResizeDimensions` request, the same
// action as double-clicking a column border — sizes every column to fit
// its actual current content (header label + whatever data rows already
// exist at the moment layout runs). A one-time action, not a live binding
// — a column won't keep auto-growing after this call as more data is
// appended, only re-fitting the next time layout is (re-)applied (a
// version bump). Still correct for the common case here: layout normally
// runs once per tab's lifetime (idempotent otherwise), by which point real
// data already exists for an established user.
// ============================================================================

const GROUP_HEADER_ROW_HEIGHT_PX = 24;
const COLUMN_HEADER_ROW_HEIGHT_PX = 26;
const DATA_ROW_HEIGHT_PX = 24;

// ============================================================================
// Small helpers shared by both tabs' request builders.
// ============================================================================

function gridRange(sheetId: number, startRow: number, endRow: number, startCol: number, endCol: number) {
  return { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startCol, endColumnIndex: endCol };
}

/** Contiguous [start, end) column runs sharing the same group, in column order — used for both header coloring and group separators. */
export function groupRuns(domainColumns: SheetColumnSpec[]): Array<{ group: SheetColumnGroup; start: number; end: number }> {
  const runs: Array<{ group: SheetColumnGroup; start: number; end: number }> = [];
  for (let i = 0; i < domainColumns.length; i++) {
    const group = domainColumns[i].group;
    const last = runs[runs.length - 1];
    if (last && last.group === group) {
      last.end = i + 1;
    } else {
      runs.push({ group, start: i, end: i + 1 });
    }
  }
  return runs;
}

// ============================================================================
// applyHeaderFormatting — background/bold/alignment/wrap/borders for the
// real column-name header row, + (daily only) the merged group-label row.
// ============================================================================

export function applyHeaderFormatting(
  sheetId: number,
  domainColumns: SheetColumnSpec[],
  headerRowCount: number
): Record<string, unknown>[] {
  const requests: Record<string, unknown>[] = [];
  const totalColumns = domainColumns.length + TECHNICAL_COLUMNS.length;
  const realHeaderRowIndex = headerRowCount - 1; // 0-based

  // The real column-name header row: colored per group, bold, left-aligned
  // (Dashboard never right-aligns anything — see architecture.md §11),
  // no-wrap-equivalent (CLIP), thin border all around.
  for (const run of groupRuns(domainColumns)) {
    requests.push({
      repeatCell: {
        range: gridRange(sheetId, realHeaderRowIndex, realHeaderRowIndex + 1, run.start, run.end),
        cell: {
          userEnteredFormat: {
            backgroundColor: GROUP_HEADER_BG[run.group],
            textFormat: HEADER_TEXT_FORMAT,
            horizontalAlignment: "LEFT",
            verticalAlignment: "MIDDLE",
            wrapStrategy: "CLIP",
            borders: { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER },
          },
        },
        fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy,borders)",
      },
    });
  }
  // Technical columns' header cell — no Dashboard equivalent (CHAD_* isn't
  // a Dashboard concept at all); styled like a neutral header so it reads
  // sanely for the rare case a user unhides one, muted/bold like the "none" group.
  requests.push({
    repeatCell: {
      range: gridRange(sheetId, realHeaderRowIndex, realHeaderRowIndex + 1, domainColumns.length, totalColumns),
      cell: {
        userEnteredFormat: {
          backgroundColor: GROUP_HEADER_BG.none,
          textFormat: HEADER_TEXT_FORMAT,
          horizontalAlignment: "LEFT",
          verticalAlignment: "MIDDLE",
          wrapStrategy: "CLIP",
          borders: { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER },
        },
      },
      fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy,borders)",
    },
  });

  // Daily-only: the decorative group-label row above it (row index 0),
  // merged per group, bold + centered — verbatim mirror of the Dashboard's
  // own group `<tr>` (`text-center font-bold`, colSpan per group,
  // `{g.toUpperCase()}` as the label; the leading "none"-group cell stays
  // blank, matching the Dashboard's own blank colSpan cell there).
  //
  // Format the WHOLE run with `repeatCell` (never includes `userEnteredValue`
  // in its fields mask, so it can never clear a cell's value) and write the
  // group-name TEXT separately, only into the single 1-column-wide anchor
  // cell, via its own narrow `updateCells` — using one `updateCells` across
  // a multi-column range with only one value in `rows[].values[]` previously
  // cleared every other cell in that range (a real bug, caught and fixed
  // 2026-07-21 after it corrupted the real column-name header row on both
  // live spreadsheets — see architecture.md §0c for the full incident/fix).
  if (headerRowCount > 1) {
    for (const run of groupRuns(domainColumns)) {
      const range = gridRange(sheetId, 0, 1, run.start, run.end);
      requests.push({
        repeatCell: {
          range,
          cell: {
            userEnteredFormat: {
              backgroundColor: GROUP_HEADER_BG[run.group],
              textFormat: { bold: true, fontSize: 9 },
              horizontalAlignment: "CENTER",
              verticalAlignment: "MIDDLE",
              borders: { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER },
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,borders)",
        },
      });
      if (run.group !== "none") {
        requests.push({
          updateCells: {
            range: gridRange(sheetId, 0, 1, run.start, run.start + 1),
            rows: [{ values: [{ userEnteredValue: { stringValue: run.group.toUpperCase() } }] }],
            fields: "userEnteredValue",
          },
        });
      }
      if (run.end - run.start > 1) {
        requests.push({ mergeCells: { range, mergeType: "MERGE_ALL" } });
      }
    }
    // Technical columns' row-0 cell — blank, muted, matching the "none" group's own blank treatment.
    requests.push({
      repeatCell: {
        range: gridRange(sheetId, 0, 1, domainColumns.length, totalColumns),
        cell: { userEnteredFormat: { backgroundColor: GROUP_HEADER_BG.none, borders: { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER } } },
        fields: "userEnteredFormat(backgroundColor,borders)",
      },
    });
  }

  return requests;
}

// ============================================================================
// autoResizeColumns — see the header comment above: real `autoResizeDimensions`,
// not a guessed pixel width.
// ============================================================================

export function autoResizeColumns(sheetId: number, domainColumns: SheetColumnSpec[]): Record<string, unknown>[] {
  const totalColumns = domainColumns.length + TECHNICAL_COLUMNS.length;
  return [
    {
      autoResizeDimensions: {
        dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: totalColumns },
      },
    },
  ];
}

// ============================================================================
// applyRowHeights — header row(s) + a bounded data-row range.
// ============================================================================

export function applyRowHeights(sheetId: number, headerRowCount: number): Record<string, unknown>[] {
  const requests: Record<string, unknown>[] = [];
  if (headerRowCount > 1) {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 },
        properties: { pixelSize: GROUP_HEADER_ROW_HEIGHT_PX },
        fields: "pixelSize",
      },
    });
  }
  requests.push({
    updateDimensionProperties: {
      range: { sheetId, dimension: "ROWS", startIndex: headerRowCount - 1, endIndex: headerRowCount },
      properties: { pixelSize: COLUMN_HEADER_ROW_HEIGHT_PX },
      fields: "pixelSize",
    },
  });
  requests.push({
    updateDimensionProperties: {
      range: { sheetId, dimension: "ROWS", startIndex: headerRowCount, endIndex: MAX_FORMATTED_DATA_ROWS },
      properties: { pixelSize: DATA_ROW_HEIGHT_PX },
      fields: "pixelSize",
    },
  });
  return requests;
}

// ============================================================================
// applyNumberFormats — Dashboard has no percent/currency/date formatting
// anywhere (raw ISO date strings, plain numbers-as-strings, no
// Number.toLocaleString) — the one real, verified fidelity point here is
// that NOTHING is right-aligned, including numeric-looking columns
// (APPROACHES/NUMBERS/STATE/...), unlike Sheets' own default of
// auto-right-aligning numbers. This function's real job is enforcing LEFT
// alignment + CLIP wrap on every body cell — "number format" naming kept
// per the task's own requested function name, even though no actual
// NUMBER_FORMAT pattern is applied (there is nothing in the Dashboard to
// mirror — see architecture.md §11).
// ============================================================================

export function applyNumberFormats(sheetId: number, domainColumns: SheetColumnSpec[], headerRowCount: number): Record<string, unknown>[] {
  const totalColumns = domainColumns.length + TECHNICAL_COLUMNS.length;
  return [
    {
      repeatCell: {
        range: gridRange(sheetId, headerRowCount, MAX_FORMATTED_DATA_ROWS, 0, totalColumns),
        cell: {
          userEnteredFormat: {
            horizontalAlignment: "LEFT",
            verticalAlignment: "MIDDLE",
            wrapStrategy: "CLIP",
            textFormat: BODY_TEXT_FORMAT,
          },
        },
        fields: "userEnteredFormat(horizontalAlignment,verticalAlignment,wrapStrategy,textFormat)",
      },
    },
  ];
}

// ============================================================================
// Group cell backgrounds for the body rows — Dashboard's `CELL_CLASS`, one
// repeatCell per contiguous group run (same runs as the header), applied to
// the bounded data-row range.
// ============================================================================

export function applyGroupCellBackgrounds(sheetId: number, domainColumns: SheetColumnSpec[], headerRowCount: number): Record<string, unknown>[] {
  const requests: Record<string, unknown>[] = [];
  for (const run of groupRuns(domainColumns)) {
    if (run.group === "none") continue; // white == Sheets' own default background, nothing to set
    requests.push({
      repeatCell: {
        range: gridRange(sheetId, headerRowCount, MAX_FORMATTED_DATA_ROWS, run.start, run.end),
        cell: { userEnteredFormat: { backgroundColor: GROUP_BODY_BG[run.group] } },
        fields: "userEnteredFormat.backgroundColor",
      },
    });
  }
  return requests;
}

// ============================================================================
// clearDataValidation — LAYOUT_VERSION 1 added non-strict suggestion-list
// dropdowns (TAK/NIE etc.) on a handful of columns as a Sheets-only
// enhancement. The user explicitly did not ask for this either and asked
// for it removed (`LAYOUT_VERSION` 4, §0d) — clears any validation rule
// on the full domain-column range, never sets one.
// ============================================================================

export function clearDataValidation(sheetId: number, domainColumns: SheetColumnSpec[], headerRowCount: number): Record<string, unknown>[] {
  return [
    {
      setDataValidation: {
        range: gridRange(sheetId, headerRowCount, MAX_FORMATTED_DATA_ROWS, 0, domainColumns.length),
        rule: null,
      },
    },
  ];
}

// ============================================================================
// resetFrozenRowsAndColumns — LAYOUT_VERSION 1 froze the header row(s) +
// column A, a standard spreadsheet convenience but not something the
// Dashboard itself does (no CSS `sticky` anywhere) and not something the
// user asked for — the divider line it draws was explicitly called out as
// an unwanted extra (`LAYOUT_VERSION` 4, §0d). Resets both frozen counts
// back to 0.
// ============================================================================

export function resetFrozenRowsAndColumns(sheetId: number): Record<string, unknown>[] {
  return [
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 0, frozenColumnCount: 0 } },
        fields: "gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
      },
    },
  ];
}

// ============================================================================
// resetGroupSeparators — LAYOUT_VERSION 1 added a visually stronger left
// border at each group transition on the daily tab. The user explicitly
// did not ask for it and found it an unwanted extra ("dziwna kreska
// oddzielająca" after column A) — removed in LAYOUT_VERSION 2. Resets that
// border back to the plain thin grid border (not just "stop adding it" —
// an already-applied medium border needs an explicit reset to actually
// go away).
// ============================================================================

export function resetGroupSeparators(sheetId: number, domainColumns: SheetColumnSpec[]): Record<string, unknown>[] {
  const runs = groupRuns(domainColumns);
  if (runs.length <= 1) return [];
  const requests: Record<string, unknown>[] = [];
  for (let i = 1; i < runs.length; i++) {
    requests.push({
      updateBorders: {
        range: gridRange(sheetId, 0, MAX_FORMATTED_DATA_ROWS, runs[i].start, runs[i].start + 1),
        left: THIN_BORDER,
      },
    });
  }
  return requests;
}

// ============================================================================
// hideTechnicalColumns — the 8 CHAD_* columns, always last (mapper.ts),
// hidden via `hiddenByUser` rather than moved/deleted — still fully
// readable via "View > Show hidden columns" if a human ever needs to
// inspect them, never lost.
// ============================================================================

export function hideTechnicalColumns(sheetId: number, domainColumns: SheetColumnSpec[]): Record<string, unknown>[] {
  const totalColumns = domainColumns.length + TECHNICAL_COLUMNS.length;
  return [
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: domainColumns.length, endIndex: totalColumns },
        properties: { hiddenByUser: true },
        fields: "hiddenByUser",
      },
    },
  ];
}

// ============================================================================
// clearBasicFilter — LAYOUT_VERSION 1 added a Basic Filter here (per-column
// dropdown arrows). The user explicitly did not ask for it and found it
// intrusive ("dziwne przyciski w tytułach po których się otwiera okno sort
// A-Z") — removed in LAYOUT_VERSION 2. Emits a clear request unconditionally
// (harmless/no-op if no filter exists) so a tab laid out under version 1
// actually loses the filter on re-apply, not just stops re-adding one.
// ============================================================================

export function clearBasicFilter(sheetId: number): Record<string, unknown>[] {
  return [{ clearBasicFilter: { sheetId } }];
}

// ============================================================================
// Orchestrators — the only two exported functions that perform I/O. Each:
// 1. Reads the tab's current CHAD_SHEET_LAYOUT_VERSION (one read, no writes).
// 2. If already current, returns immediately — no batchUpdate at all, so a
//    normal worker restart (bootstrap.ts calls these on every startup) is
//    cheap once a tab is laid out.
// 3. Otherwise resolves the numeric sheetId, builds every request above
//    into one array, appends the version-metadata upsert, and sends it all
//    as a single `batchUpdate` call.
// ============================================================================

async function upsertVersionMetadataRequest(
  client: GoogleSheetsClient,
  target: GoogleSheetsTarget,
  sheetId: number,
  currentVersion: string | null
): Promise<Record<string, unknown>> {
  if (currentVersion === null) {
    return {
      createDeveloperMetadata: {
        developerMetadata: {
          metadataKey: LAYOUT_VERSION_METADATA_KEY,
          metadataValue: LAYOUT_VERSION,
          location: { sheetId },
          visibility: "DOCUMENT",
        },
      },
    };
  }
  return {
    updateDeveloperMetadata: {
      dataFilters: [
        { developerMetadataLookup: { locationType: "SHEET", metadataLocation: { sheetId }, metadataKey: LAYOUT_VERSION_METADATA_KEY } },
      ],
      developerMetadata: { metadataValue: LAYOUT_VERSION },
      fields: "metadataValue",
    },
  };
}

/**
 * Lays out the "daily" tab: group-colored two-row header (merged group
 * labels + real column-name row), per-group body tint, column widths, row
 * heights, frozen header rows + DATE column, group separators, hidden
 * CHAD_* columns, a basic filter, and light data validation on the four
 * TAK/NIE-pattern columns. No-ops if `CHAD_SHEET_LAYOUT_VERSION` on this
 * tab already equals `LAYOUT_VERSION`.
 *
 * On the very first-ever application (`currentVersion === null`), a tab
 * that predates this Story's 2-header-row scheme may already have real
 * content sitting where the new decorative group-label row (index 0) needs
 * to go — its OLD single header row (with the real "DATE"/"STATE"/...
 * labels `ensureHeaders` had already written) and any data below it. A
 * physical `insertDimension` (one blank row at index 0) runs FIRST in that
 * case, shifting all existing content down by one row before any other
 * request in the same `batchUpdate` references a row index — so the old
 * header row survives intact at its new position (index 1 = sheet row 2 =
 * exactly where `headerRowCount: 2` now expects to find it) instead of
 * being overwritten in place. Harmless on a genuinely empty/new tab (just
 * one extra blank row, still empty). Never repeated on a later version
 * bump (`currentVersion` already non-null by then, the row already exists).
 */
export async function ensureDailyTrackerLayout(client: GoogleSheetsClient, target: GoogleSheetsTarget): Promise<boolean> {
  const currentVersion = await client.getSheetDeveloperMetadata(target, LAYOUT_VERSION_METADATA_KEY);
  if (currentVersion === LAYOUT_VERSION) return false;

  const sheetId = await client.getSheetId(target);
  const domainColumns = DAILY_ENTRY_DOMAIN_COLUMNS;
  const headerRowCount = DAILY_TRACKER_HEADER_ROW_COUNT;

  const requests: Record<string, unknown>[] = [
    ...(currentVersion === null
      ? [{ insertDimension: { range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 }, inheritFromBefore: false } }]
      : []),
    ...applyHeaderFormatting(sheetId, domainColumns, headerRowCount),
    ...autoResizeColumns(sheetId, domainColumns),
    ...applyRowHeights(sheetId, headerRowCount),
    ...applyNumberFormats(sheetId, domainColumns, headerRowCount),
    ...applyGroupCellBackgrounds(sheetId, domainColumns, headerRowCount),
    ...clearDataValidation(sheetId, domainColumns, headerRowCount),
    ...resetFrozenRowsAndColumns(sheetId),
    ...resetGroupSeparators(sheetId, domainColumns),
    ...hideTechnicalColumns(sheetId, domainColumns),
    ...clearBasicFilter(sheetId),
    await upsertVersionMetadataRequest(client, target, sheetId, currentVersion),
  ];

  await client.batchUpdate(target.spreadsheetId, requests);
  return true;
}

/**
 * Lays out the "dates" tab: single-row colored header, column widths, row
 * heights, frozen header row + DATA column, hidden CHAD_* columns, a basic
 * filter, and light data validation on PULL/CLOSE. No group row (Dashboard
 * never renders one for Dates) — no merges, no group separators. No-ops if
 * `CHAD_SHEET_LAYOUT_VERSION` on this tab already equals `LAYOUT_VERSION`.
 */
export async function ensureDatesLayout(client: GoogleSheetsClient, target: GoogleSheetsTarget): Promise<boolean> {
  const currentVersion = await client.getSheetDeveloperMetadata(target, LAYOUT_VERSION_METADATA_KEY);
  if (currentVersion === LAYOUT_VERSION) return false;

  const sheetId = await client.getSheetId(target);
  const domainColumns = DATE_ENTRY_DOMAIN_COLUMNS;
  const headerRowCount = DATE_ENTRIES_HEADER_ROW_COUNT;

  const requests: Record<string, unknown>[] = [
    ...applyHeaderFormatting(sheetId, domainColumns, headerRowCount),
    ...autoResizeColumns(sheetId, domainColumns),
    ...applyRowHeights(sheetId, headerRowCount),
    ...applyNumberFormats(sheetId, domainColumns, headerRowCount),
    ...clearDataValidation(sheetId, domainColumns, headerRowCount),
    ...resetFrozenRowsAndColumns(sheetId),
    ...hideTechnicalColumns(sheetId, domainColumns),
    ...clearBasicFilter(sheetId),
    await upsertVersionMetadataRequest(client, target, sheetId, currentVersion),
  ];

  await client.batchUpdate(target.spreadsheetId, requests);
  return true;
}
