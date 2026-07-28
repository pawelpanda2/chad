// Thin re-export of dba's own mapper-drift guards, plus one small helper —
// kept in its own file so every mapping-schema test imports from one place
// instead of reaching into packages/dba/dist directly, and so the import
// path only needs to change here if dba's build output ever moves.
import { DBA_DIST } from "./env.mjs";

const mapper = await import(`${DBA_DIST}/google-sheets/mapper.js`);

export const {
  assertUiColumnsMatchMapper,
  assertMappedRowCoversRequiredHeaders,
  DAILY_ENTRY_DOMAIN_COLUMNS,
  DATE_ENTRY_DOMAIN_COLUMNS,
  ITEM_NUMBER_COLUMN,
  DAILY_TRACKER_SHEET_HEADERS,
  DATE_ENTRIES_SHEET_HEADERS,
  TECHNICAL_COLUMNS,
  mapDailyEntryToSheetRow,
  mapDateEntryToSheetRow,
  mapDeleteToSheetRow,
} = mapper;

/** Domain columns (both tabs), minus the `N` sentinel — what a UI fixture should list. */
export function domainColumnsExcludingItemNumber(columns) {
  return columns.filter((c) => c !== ITEM_NUMBER_COLUMN).map(({ key, label }) => ({ key, label }));
}
