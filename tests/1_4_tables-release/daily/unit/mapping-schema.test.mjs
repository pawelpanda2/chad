// Regression guard: the Daily Tracker's on-screen columns
// (fixtures/daily-ui-columns.mjs, a hand-maintained snapshot) must always
// match `DAILY_ENTRY_DOMAIN_COLUMNS` in packages/dba's Google Sheets
// mapper — a drift here means either the Dashboard table or the Sheets
// mirror silently diverged from the other. Uses the BUILT dba output
// (`packages/dba/dist`), never `src/`, exactly like every other
// dist-consuming test/script in this repo (see package.json's
// `test:unit:google-sheets-config`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertUiColumnsMatchMapper, DAILY_ENTRY_DOMAIN_COLUMNS, ITEM_NUMBER_COLUMN } from "../../../support/assertions/assert-mapping.mjs";
import { DAILY_UI_COLUMNS } from "../../../support/fixtures/daily-ui-columns.mjs";

test("Daily Tracker UI columns match the Google Sheets mapper's DAILY_ENTRY_DOMAIN_COLUMNS exactly", () => {
  assert.doesNotThrow(() => assertUiColumnsMatchMapper("daily-entry", DAILY_UI_COLUMNS));
});

test("fails closed when the UI fixture is missing a column the mapper has", () => {
  const missingOne = DAILY_UI_COLUMNS.filter((c) => c.key !== "OUTINGS");
  assert.throws(
    () => assertUiColumnsMatchMapper("daily-entry", missingOne),
    /Column schema drift for daily-entry/
  );
});

test("fails closed when the UI fixture has an extra column the mapper doesn't know about", () => {
  const extra = [...DAILY_UI_COLUMNS, { key: "NOT A REAL COLUMN", label: "NOT A REAL COLUMN" }];
  assert.throws(
    () => assertUiColumnsMatchMapper("daily-entry", extra),
    /Column schema drift for daily-entry/
  );
});

test("fails closed when a shared key's label drifted between UI and mapper", () => {
  const relabelled = DAILY_UI_COLUMNS.map((c) => (c.key === "STATE" ? { ...c, label: "STATUS" } : c));
  assert.throws(
    () => assertUiColumnsMatchMapper("daily-entry", relabelled),
    /Column label drift for daily-entry key=STATE/
  );
});

test("DAILY_ENTRY_DOMAIN_COLUMNS starts with the always-visible N (item number) sentinel, not a real UI column", () => {
  assert.equal(DAILY_ENTRY_DOMAIN_COLUMNS[0], ITEM_NUMBER_COLUMN);
  assert.equal(DAILY_UI_COLUMNS.some((c) => c.key === "N"), false, "N must never appear in the UI fixture itself");
});
