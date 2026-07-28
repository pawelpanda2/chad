// Live, READ-ONLY PostgreSQL <-> Google Sheets reconciliation for real
// users (pawel_f, kamil_s) — 2026-07-28 audit. Never writes to Postgres or
// to Google Sheets (only `values.get`, never ensureHeaders/appendRow/
// updateRow/batchUpdate). Resolves each user's repoGuid via the read-only
// `chad_admin/users/users-list` lookup — never logs in as pawel_f/kamil_s.
import { diffRecordKeys } from "../../../packages/dba/dist/google-sheets/reconciliation.js";

const DAILY_HEADER_ROW_INDEX = 1; // DAILY_TRACKER_HEADER_ROW_COUNT = 2 (0-indexed: row 2 is index 1)
const SINGLE_HEADER_ROW_INDEX = 0;

async function readSheetValues({ getServiceAccountAccessToken, credentials, spreadsheetId, sheetName }) {
  const token = await getServiceAccountAccessToken(credentials, fetch);
  const range = encodeURIComponent(`'${sheetName.replace(/'/g, "''")}'`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`Sheets API GET failed (${res.status}) for "${sheetName}": ${await res.text().catch(() => "")}`);
  }
  const body = await res.json();
  return body.values || [];
}

/**
 * @returns {Promise<{pgCount:number, sheetCount:number, missing:string[], extra:string[], duplicates:Array<{recordKey:string,count:number}>}>}
 */
export async function reconcileTable({
  dba,
  credentials,
  repoGuid,
  spreadsheetId,
  sheetName,
  headerRowIndex,
  pgItems,
}) {
  const sheetValues = await readSheetValues({
    getServiceAccountAccessToken: dba.getServiceAccountAccessToken,
    credentials,
    spreadsheetId,
    sheetName,
  });
  const header = sheetValues[headerRowIndex] || [];
  const recordKeyCol = header.indexOf("CHAD_RECORD_KEY");
  const dataRows = recordKeyCol === -1 ? [] : sheetValues.slice(headerRowIndex + 1);
  const sheetRecordKeys = dataRows.map((row) => row[recordKeyCol]).filter(Boolean);
  const pgRecordKeys = pgItems.map((item) => `${repoGuid}:${item.loca}`);

  const diff = diffRecordKeys(pgRecordKeys, sheetRecordKeys);
  return {
    pgCount: pgItems.length,
    sheetCount: dataRows.length,
    headerFound: recordKeyCol !== -1,
    ...diff,
  };
}

export { DAILY_HEADER_ROW_INDEX, SINGLE_HEADER_ROW_INDEX };
