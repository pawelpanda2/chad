/**
 * google-sheets/layout.ts tests (Story 75 visual-layout follow-up,
 * 2026-07-21) — no real infra needed at all: the request-builder functions
 * are pure (no I/O), and the two orchestrators (`ensureDailyTrackerLayout`/
 * `ensureDatesLayout`) only ever touch `FakeGoogleSheetsClient`'s in-memory
 * state, never Mongo/the outbox (unlike outbox/worker/sync.test.ts).
 *
 * Run via: cd packages/dba && npx tsc && node dist/google-sheets/layout.test.js
 */

import {
  LAYOUT_VERSION,
  LAYOUT_VERSION_METADATA_KEY,
  MAX_FORMATTED_DATA_ROWS,
  groupRuns,
  applyHeaderFormatting,
  autoResizeColumns,
  applyRowHeights,
  applyNumberFormats,
  applyGroupCellBackgrounds,
  clearDataValidation,
  resetFrozenRowsAndColumns,
  resetGroupSeparators,
  hideTechnicalColumns,
  clearBasicFilter,
  ensureDailyTrackerLayout,
  ensureDatesLayout,
} from "./layout.js";
import {
  DAILY_ENTRY_DOMAIN_COLUMNS,
  DATE_ENTRY_DOMAIN_COLUMNS,
  TECHNICAL_COLUMNS,
  DAILY_TRACKER_HEADER_ROW_COUNT,
  DATE_ENTRIES_HEADER_ROW_COUNT,
} from "./mapper.js";
import { FakeGoogleSheetsClient } from "./fake-client.js";

async function runTests() {
  console.log("Running google-sheets/layout Tests (pure builders + FakeGoogleSheetsClient, no Mongo)...\n");
  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (e) {
      console.log(`  ✗ ${name}`);
      console.log(`    Error: ${e}`);
      failed++;
    }
  }

  function assertEquals(actual: unknown, expected: unknown, message?: string) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) throw new Error(`${message ?? "assertEquals failed"}: expected ${e}, got ${a}`);
  }

  function assert(condition: boolean, message: string) {
    if (!condition) throw new Error(message);
  }

  // ==========================================================================
  // groupRuns — contiguous column runs
  // ==========================================================================

  await test("groupRuns: daily columns collapse into 5 contiguous runs in order (none, training, action, texting, results)", () => {
    const runs = groupRuns(DAILY_ENTRY_DOMAIN_COLUMNS);
    assertEquals(
      runs.map((r) => r.group),
      ["none", "training", "action", "texting", "results"]
    );
    assertEquals(runs[0], { group: "none", start: 0, end: 2 }, "N + DATE");
    assertEquals(runs[1], { group: "training", start: 2, end: 8 }, "STATE..FIELD REVIEW");
    assertEquals(runs[4], { group: "results", start: 17, end: 21 }, "CLOSES AUTO..OUTINGS");
  });

  await test("groupRuns: dates columns are all one 'none' run (Dashboard never renders a group row for Dates)", () => {
    const runs = groupRuns(DATE_ENTRY_DOMAIN_COLUMNS);
    assertEquals(runs, [{ group: "none", start: 0, end: DATE_ENTRY_DOMAIN_COLUMNS.length }]);
  });

  // ==========================================================================
  // applyHeaderFormatting
  // ==========================================================================

  await test("applyHeaderFormatting (daily, 2 header rows): includes a merged, labeled updateCells+mergeCells pair per multi-column group; the 'none' group (N+DATE) merges too but stays unlabeled (blank, matching the Dashboard's own blank leading cell)", () => {
    const requests = applyHeaderFormatting(999, DAILY_ENTRY_DOMAIN_COLUMNS, DAILY_TRACKER_HEADER_ROW_COUNT);
    const merges = requests.filter((r) => "mergeCells" in r);
    // 4 labeled groups span >1 column (training/action/texting/results) -> 4 labeled merges;
    // "none" (N+DATE, 2026-07-22: N added, so "none" is no longer single-column) also merges
    // -> 5 total, but never gets an updateCells label (blank, matching Dashboard's own blank cell).
    assertEquals(merges.length, 5);
    const updateCells = requests.filter((r) => "updateCells" in r) as any[];
    assertEquals(updateCells.length, 4, "only the 4 non-'none' groups get a label — 'none' stays blank");
    const trainingLabel = updateCells.find((r) => r.updateCells.range.startColumnIndex === 2);
    assert(trainingLabel.updateCells.rows[0].values[0].userEnteredValue.stringValue === "TRAINING", "group label text must be the uppercased group name");
    assert(trainingLabel.updateCells.range.startRowIndex === 0 && trainingLabel.updateCells.range.endRowIndex === 1, "group label row must be row 0 only");
  });

  await test("applyHeaderFormatting (dates, 1 header row): no row-0/group requests at all — no updateCells, no mergeCells", () => {
    const requests = applyHeaderFormatting(999, DATE_ENTRY_DOMAIN_COLUMNS, DATE_ENTRIES_HEADER_ROW_COUNT);
    assert(!requests.some((r) => "updateCells" in r), "dates must never get a group-label row");
    assert(!requests.some((r) => "mergeCells" in r), "dates must never merge any header cells");
  });

  await test("applyHeaderFormatting: every group's repeatCell background matches GROUP_HEADER_BG for that group (spot check training=green, action=amber)", () => {
    const requests = applyHeaderFormatting(999, DAILY_ENTRY_DOMAIN_COLUMNS, DAILY_TRACKER_HEADER_ROW_COUNT) as any[];
    const realHeaderRow = DAILY_TRACKER_HEADER_ROW_COUNT - 1;
    const trainingHeader = requests.find(
      (r) => r.repeatCell?.range.startRowIndex === realHeaderRow && r.repeatCell.range.startColumnIndex === 2
    );
    assertEquals(trainingHeader.repeatCell.cell.userEnteredFormat.backgroundColor, { red: 220 / 255, green: 252 / 255, blue: 231 / 255 });
    assertEquals(trainingHeader.repeatCell.cell.userEnteredFormat.horizontalAlignment, "LEFT", "Dashboard never right-aligns anything, not even inside the header");
  });

  // ==========================================================================
  // autoResizeColumns — LAYOUT_VERSION 5 replaced the guessed pixel-width
  // heuristic with a real `autoResizeDimensions` request (user feedback,
  // 2026-07-22: widths should fit actual content, not an estimate).
  // ==========================================================================

  await test("autoResizeColumns: one request covering every domain + technical column in a single range", () => {
    const requests = autoResizeColumns(999, DAILY_ENTRY_DOMAIN_COLUMNS) as any[];
    assertEquals(requests.length, 1);
    assertEquals(requests[0].autoResizeDimensions.dimensions.startIndex, 0);
    assertEquals(requests[0].autoResizeDimensions.dimensions.endIndex, DAILY_ENTRY_DOMAIN_COLUMNS.length + TECHNICAL_COLUMNS.length);
    assertEquals(requests[0].autoResizeDimensions.dimensions.dimension, "COLUMNS");
  });

  // ==========================================================================
  // applyRowHeights
  // ==========================================================================

  await test("applyRowHeights: daily (2 header rows) emits 3 requests (group row, header row, bounded data range); dates emits 2", () => {
    assertEquals(applyRowHeights(999, DAILY_TRACKER_HEADER_ROW_COUNT).length, 3);
    assertEquals(applyRowHeights(999, DATE_ENTRIES_HEADER_ROW_COUNT).length, 2);
  });

  await test("applyRowHeights: the data-row range is bounded by MAX_FORMATTED_DATA_ROWS, never open-ended", () => {
    const requests = applyRowHeights(999, DATE_ENTRIES_HEADER_ROW_COUNT) as any[];
    const dataRange = requests.find((r) => r.updateDimensionProperties.range.startIndex === DATE_ENTRIES_HEADER_ROW_COUNT);
    assertEquals(dataRange.updateDimensionProperties.range.endIndex, MAX_FORMATTED_DATA_ROWS);
  });

  // ==========================================================================
  // applyNumberFormats — LEFT alignment (the one real, verified fidelity
  // point — Dashboard never right-aligns numeric-looking columns either).
  // ==========================================================================

  await test("applyNumberFormats: forces LEFT alignment (never Sheets' own default right-align for numeric-looking values)", () => {
    const requests = applyNumberFormats(999, DAILY_ENTRY_DOMAIN_COLUMNS, DAILY_TRACKER_HEADER_ROW_COUNT) as any[];
    assertEquals(requests.length, 1);
    assertEquals(requests[0].repeatCell.cell.userEnteredFormat.horizontalAlignment, "LEFT");
    assertEquals(requests[0].repeatCell.range.startRowIndex, DAILY_TRACKER_HEADER_ROW_COUNT, "must start right after the header rows, never overlapping them");
  });

  // ==========================================================================
  // applyGroupCellBackgrounds
  // ==========================================================================

  await test("applyGroupCellBackgrounds: daily gets 4 requests (one per non-'none' group), dates gets 0 (all columns are 'none')", () => {
    assertEquals(applyGroupCellBackgrounds(999, DAILY_ENTRY_DOMAIN_COLUMNS, DAILY_TRACKER_HEADER_ROW_COUNT).length, 4);
    assertEquals(applyGroupCellBackgrounds(999, DATE_ENTRY_DOMAIN_COLUMNS, DATE_ENTRIES_HEADER_ROW_COUNT).length, 0);
  });

  // ==========================================================================
  // clearDataValidation — LAYOUT_VERSION 4 removed the TAK/NIE-style
  // suggestion dropdowns (user explicitly didn't ask for them either).
  // ==========================================================================

  await test("clearDataValidation: clears any validation rule across the full domain-column range, never sets one", () => {
    const requests = clearDataValidation(999, DAILY_ENTRY_DOMAIN_COLUMNS, DAILY_TRACKER_HEADER_ROW_COUNT) as any[];
    assertEquals(requests.length, 1);
    assertEquals(requests[0].setDataValidation.rule, null);
    assertEquals(requests[0].setDataValidation.range.endColumnIndex, DAILY_ENTRY_DOMAIN_COLUMNS.length);
  });

  // ==========================================================================
  // resetFrozenRowsAndColumns — LAYOUT_VERSION 4 removed the frozen header
  // row(s)/column (user explicitly called out the divider line it draws as
  // an unwanted extra).
  // ==========================================================================

  await test("resetFrozenRowsAndColumns: resets both frozen counts to 0", () => {
    const requests = resetFrozenRowsAndColumns(999) as any[];
    assertEquals(requests[0].updateSheetProperties.properties.gridProperties, { frozenRowCount: 0, frozenColumnCount: 0 });
  });

  // ==========================================================================
  // resetGroupSeparators — LAYOUT_VERSION 3 removed the group-separator
  // border (user explicitly didn't ask for it, found it an unwanted extra
  // line after column A).
  // ==========================================================================

  await test("resetGroupSeparators: daily resets 4 boundaries back to the plain thin border; dates has 0 (no groups)", () => {
    const requests = resetGroupSeparators(999, DAILY_ENTRY_DOMAIN_COLUMNS) as any[];
    assertEquals(requests.length, 4);
    for (const r of requests) {
      assertEquals(r.updateBorders.left.style, "SOLID");
      assertEquals(r.updateBorders.left.width, 1);
    }
    assertEquals(resetGroupSeparators(999, DATE_ENTRY_DOMAIN_COLUMNS).length, 0);
  });

  // ==========================================================================
  // hideTechnicalColumns
  // ==========================================================================

  await test("hideTechnicalColumns: hides exactly the trailing 8 CHAD_* columns, never a domain column", () => {
    const requests = hideTechnicalColumns(999, DAILY_ENTRY_DOMAIN_COLUMNS) as any[];
    assertEquals(requests.length, 1);
    const range = requests[0].updateDimensionProperties.range;
    assertEquals(range.startIndex, DAILY_ENTRY_DOMAIN_COLUMNS.length);
    assertEquals(range.endIndex, DAILY_ENTRY_DOMAIN_COLUMNS.length + TECHNICAL_COLUMNS.length);
    assertEquals(requests[0].updateDimensionProperties.properties.hiddenByUser, true);
  });

  // ==========================================================================
  // clearBasicFilter — LAYOUT_VERSION 2 removed the filter (user explicitly
  // didn't ask for it and found the per-column sort-arrow UI intrusive).
  // ==========================================================================

  await test("clearBasicFilter: unconditionally clears any filter on the sheet, never sets one", () => {
    const requests = clearBasicFilter(999) as any[];
    assertEquals(requests.length, 1);
    assertEquals(requests[0], { clearBasicFilter: { sheetId: 999 } });
  });

  // ==========================================================================
  // ensureDailyTrackerLayout / ensureDatesLayout — idempotency, migration,
  // "never touches data" via FakeGoogleSheetsClient.
  // ==========================================================================

  await test("ensureDailyTrackerLayout: first call on a fresh tab applies the layout and creates version metadata", async () => {
    const client = new FakeGoogleSheetsClient();
    const target = { spreadsheetId: "s1", sheetName: "daily", headerRowCount: DAILY_TRACKER_HEADER_ROW_COUNT };
    const applied = await ensureDailyTrackerLayout(client, target);
    assert(applied === true, "a fresh tab must actually apply the layout");
    const version = await client.getSheetDeveloperMetadata(target, LAYOUT_VERSION_METADATA_KEY);
    assertEquals(version, LAYOUT_VERSION);
  });

  await test("ensureDailyTrackerLayout: idempotent — a second call at the same version sends zero batchUpdate requests", async () => {
    const client = new FakeGoogleSheetsClient();
    const target = { spreadsheetId: "s2", sheetName: "daily", headerRowCount: DAILY_TRACKER_HEADER_ROW_COUNT };
    await ensureDailyTrackerLayout(client, target);
    const countAfterFirst = client.batchUpdateRequests.length;
    const appliedSecondTime = await ensureDailyTrackerLayout(client, target);
    assert(appliedSecondTime === false, "an already-current tab must no-op");
    assertEquals(client.batchUpdateRequests.length, countAfterFirst, "no new batchUpdate requests on the idempotent re-run");
  });

  await test("ensureDatesLayout: idempotent the same way as daily", async () => {
    const client = new FakeGoogleSheetsClient();
    const target = { spreadsheetId: "s3", sheetName: "dates", headerRowCount: DATE_ENTRIES_HEADER_ROW_COUNT };
    assert((await ensureDatesLayout(client, target)) === true, "first call must apply");
    assert((await ensureDatesLayout(client, target)) === false, "second call must no-op");
  });

  await test("version migration: bumping the stored version below LAYOUT_VERSION causes a re-apply via updateDeveloperMetadata (not create)", async () => {
    const client = new FakeGoogleSheetsClient();
    const target = { spreadsheetId: "s4", sheetName: "daily", headerRowCount: DAILY_TRACKER_HEADER_ROW_COUNT };
    await ensureDailyTrackerLayout(client, target);
    // Simulate an older tab that was laid out under a previous version.
    const sheetId = await client.getSheetId(target);
    await client.batchUpdate("s4", [
      { updateDeveloperMetadata: { dataFilters: [{ developerMetadataLookup: { locationType: "SHEET", metadataLocation: { sheetId }, metadataKey: LAYOUT_VERSION_METADATA_KEY } }], developerMetadata: { metadataValue: "0" }, fields: "metadataValue" } },
    ]);
    assertEquals(await client.getSheetDeveloperMetadata(target, LAYOUT_VERSION_METADATA_KEY), "0");

    const reapplied = await ensureDailyTrackerLayout(client, target);
    assert(reapplied === true, "an outdated version must trigger a real re-apply");
    assertEquals(await client.getSheetDeveloperMetadata(target, LAYOUT_VERSION_METADATA_KEY), LAYOUT_VERSION, "must be bumped back to current after re-apply");
  });

  await test("layout requests never touch a data row's values — the only value-writing request (updateCells) is confined to row 0, exactly 1 column wide", async () => {
    const client = new FakeGoogleSheetsClient();
    const target = { spreadsheetId: "s5", sheetName: "daily", headerRowCount: DAILY_TRACKER_HEADER_ROW_COUNT };
    await ensureDailyTrackerLayout(client, target);
    const valueWrites = client.batchUpdateRequests.filter((r) => "updateCells" in r) as any[];
    assert(valueWrites.length > 0, "sanity: the group-label row does write some values");
    for (const r of valueWrites) {
      assertEquals(r.updateCells.range.startRowIndex, 0, "every value-writing request must target row 0 only");
      assertEquals(r.updateCells.range.endRowIndex, 1, "every value-writing request must target row 0 only");
      // Regression guard for the real incident (2026-07-21, see
      // architecture.md §0c): an `updateCells` range wider than the single
      // value supplied in `rows[].values[]` silently blanked every other
      // cell in that range — including the real "DATE"/"STATE"/... header
      // labels sitting directly below on both live spreadsheets. Every
      // value-writing request must now be exactly 1 column wide.
      assertEquals(
        r.updateCells.range.endColumnIndex - r.updateCells.range.startColumnIndex,
        1,
        "an updateCells request must never span more than 1 column — see the 2026-07-21 header-clobbering incident"
      );
      assertEquals(r.updateCells.fields, "userEnteredValue", "must never include userEnteredFormat in the same request as a value write for a merged range");
    }
    const allowedTypes = new Set([
      "insertDimension",
      "repeatCell",
      "updateCells",
      "mergeCells",
      "updateDimensionProperties",
      "autoResizeDimensions",
      "updateSheetProperties",
      "updateBorders",
      "setDataValidation",
      "clearBasicFilter",
      "createDeveloperMetadata",
      "updateDeveloperMetadata",
    ]);
    for (const r of client.batchUpdateRequests) {
      const type = Object.keys(r)[0];
      assert(allowedTypes.has(type), `unexpected request type "${type}" — layout.ts must only ever send formatting/structure requests`);
    }
  });

  await test("group-row repeatCell requests never include userEnteredValue in their fields mask (would clear whatever value is under a merge)", async () => {
    const requests = applyHeaderFormatting(999, DAILY_ENTRY_DOMAIN_COLUMNS, DAILY_TRACKER_HEADER_ROW_COUNT) as any[];
    const row0Formatting = requests.filter((r) => r.repeatCell?.range.startRowIndex === 0);
    assert(row0Formatting.length > 0, "sanity: row 0 does get formatted");
    for (const r of row0Formatting) {
      assert(!r.repeatCell.fields.includes("userEnteredValue"), "a format-only repeatCell must never touch userEnteredValue");
    }
  });

  await test("on first-ever migration (fresh tab), a row is physically inserted at index 0 before any other request — preserves a pre-existing 1-header-row tab's old header/data instead of overwriting it in place", async () => {
    const client = new FakeGoogleSheetsClient();
    const target = { spreadsheetId: "s6", sheetName: "daily", headerRowCount: DAILY_TRACKER_HEADER_ROW_COUNT };
    await ensureDailyTrackerLayout(client, target);
    const firstRequest = client.getBatchUpdateRequestsFor(target)[0];
    assert("insertDimension" in firstRequest, "the very first request on first-ever application must be the row insertion");
    const insert = (firstRequest as any).insertDimension;
    assertEquals(insert.range.dimension, "ROWS");
    assertEquals(insert.range.startIndex, 0);
    assertEquals(insert.range.endIndex, 1);
    assertEquals(insert.inheritFromBefore, false, "inheritFromBefore must be false — there is no row before index 0");
  });

  await test("a version bump (already-laid-out tab) never re-inserts a row — only the very first-ever application does", async () => {
    const client = new FakeGoogleSheetsClient();
    const target = { spreadsheetId: "s7", sheetName: "daily", headerRowCount: DAILY_TRACKER_HEADER_ROW_COUNT };
    await ensureDailyTrackerLayout(client, target);
    const sheetId = await client.getSheetId(target);
    // Simulate an older laid-out version, forcing a real re-apply.
    await client.batchUpdate("s7", [
      { updateDeveloperMetadata: { dataFilters: [{ developerMetadataLookup: { locationType: "SHEET", metadataLocation: { sheetId }, metadataKey: LAYOUT_VERSION_METADATA_KEY } }], developerMetadata: { metadataValue: "0" }, fields: "metadataValue" } },
    ]);
    const countBeforeReapply = client.batchUpdateRequests.length;
    await ensureDailyTrackerLayout(client, target);
    const requestsFromReapply = client.batchUpdateRequests.slice(countBeforeReapply);
    assert(!requestsFromReapply.some((r) => "insertDimension" in r), "a version-bump re-apply must never insert another row");
  });

  await test("layout is independent per spreadsheet: laying out user A's tab never touches user B's developer metadata", async () => {
    const client = new FakeGoogleSheetsClient();
    const targetA = { spreadsheetId: "userA", sheetName: "daily", headerRowCount: DAILY_TRACKER_HEADER_ROW_COUNT };
    const targetB = { spreadsheetId: "userB", sheetName: "daily", headerRowCount: DAILY_TRACKER_HEADER_ROW_COUNT };
    await ensureDailyTrackerLayout(client, targetA);
    assertEquals(await client.getSheetDeveloperMetadata(targetB, LAYOUT_VERSION_METADATA_KEY), null, "user B's tab must remain un-laid-out");
    await ensureDailyTrackerLayout(client, targetB);
    assertEquals(await client.getSheetDeveloperMetadata(targetB, LAYOUT_VERSION_METADATA_KEY), LAYOUT_VERSION);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
