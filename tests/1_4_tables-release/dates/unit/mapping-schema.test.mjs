// Same regression guard as daily/mapping-schema.test.mjs, for the Dates
// table / "dates" tab.
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertUiColumnsMatchMapper, DATE_ENTRY_DOMAIN_COLUMNS, ITEM_NUMBER_COLUMN } from "../../../support/assertions/assert-mapping.mjs";
import { DATE_UI_COLUMNS } from "../../../support/fixtures/date-ui-columns.mjs";

test("Dates UI columns match the Google Sheets mapper's DATE_ENTRY_DOMAIN_COLUMNS exactly", () => {
  assert.doesNotThrow(() => assertUiColumnsMatchMapper("date-entry", DATE_UI_COLUMNS));
});

test("fails closed when the UI fixture is missing a column the mapper has", () => {
  const missingOne = DATE_UI_COLUMNS.filter((c) => c.key !== "JAKOŚĆ");
  assert.throws(
    () => assertUiColumnsMatchMapper("date-entry", missingOne),
    /Column schema drift for date-entry/
  );
});

test("fails closed when the UI fixture has an extra column the mapper doesn't know about", () => {
  const extra = [...DATE_UI_COLUMNS, { key: "NOT A REAL COLUMN", label: "NOT A REAL COLUMN" }];
  assert.throws(
    () => assertUiColumnsMatchMapper("date-entry", extra),
    /Column schema drift for date-entry/
  );
});

test("fails closed when a shared key's label drifted between UI and mapper", () => {
  const relabelled = DATE_UI_COLUMNS.map((c) => (c.key === "NAZWA" ? { ...c, label: "NAME" } : c));
  assert.throws(
    () => assertUiColumnsMatchMapper("date-entry", relabelled),
    /Column label drift for date-entry key=NAZWA/
  );
});

test("DATE_ENTRY_DOMAIN_COLUMNS starts with the always-visible N (item number) sentinel, not a real UI column", () => {
  assert.equal(DATE_ENTRY_DOMAIN_COLUMNS[0], ITEM_NUMBER_COLUMN);
  assert.equal(DATE_UI_COLUMNS.some((c) => c.key === "N"), false, "N must never appear in the UI fixture itself");
});
