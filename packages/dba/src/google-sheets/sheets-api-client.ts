/**
 * Real `GoogleSheetsClient` (Story 75) — plain REST calls to the Google
 * Sheets API v4 (no `googleapis` dependency, see `02_plan.md` §3). Never
 * imported by any test; tests use `FakeGoogleSheetsClient` instead.
 *
 * Column resolution is always by header **name**, never by fixed index
 * (plan §6) — every method re-reads the current header row first, so a
 * manually reordered/extended header row is always respected.
 *
 * `readHeaderRow` is short-TTL-cached (Story 75 follow-up, 2026-07-22): a
 * single sync job calls it up to 4 times (`ensureHeaders`, `findRowByKey`,
 * `updateRow`/`appendRow`) within milliseconds of each other — with the
 * Sheets API's default free-tier quota (60 read requests/minute/user), a
 * real backfill of ~120 records hit `RESOURCE_EXHAUSTED` (HTTP 429)
 * repeatedly, pushing jobs into the outbox's retry/backoff path instead of
 * syncing promptly. Caching collapses those 4 reads into 1 real network
 * call per job (subsequent calls for the same target within the TTL reuse
 * it), with zero contract change — `ensureHeaders` still returns the true
 * current header list, updating the cache itself when it writes new
 * headers, so nothing here can ever return stale data to a caller that
 * just wrote through it.
 */

import type { GoogleSheetsClient, GoogleSheetsTarget, SheetRowValues } from "./types.js";
import { getServiceAccountAccessToken, type ServiceAccountCredentials } from "./service-account-auth.js";

const API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

/** Long enough to cover one job's own sequential reads (a few ms apart), short enough that a human's manual header edit is picked up well within one worker poll interval. */
const HEADER_CACHE_TTL_MS = 4000;

/** Wraps a sheet/tab name in single quotes for A1 notation if it needs it (spaces, etc.) — safe to always apply. */
function quoteSheetName(sheetName: string): string {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

function columnIndexToLetter(indexZeroBased: number): string {
  let n = indexZeroBased + 1;
  let letters = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

export class GoogleSheetsApiClient implements GoogleSheetsClient {
  private readonly headerCache = new Map<string, { headers: string[]; expiresAt: number }>();
  /** sheetId never changes for the life of a tab (only if the tab itself is deleted/recreated) — cached indefinitely, no TTL, unlike headerCache. Added 2026-07-22 when appendRow started needing it on every call (insert-at-top rewrite), to avoid adding a fresh quota-consuming read per append. */
  private readonly sheetIdCache = new Map<string, number>();

  constructor(
    private readonly credentials: ServiceAccountCredentials,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  private headerCacheKey(target: GoogleSheetsTarget): string {
    return `${target.spreadsheetId}::${target.sheetName}::${target.headerRowCount ?? 1}`;
  }

  private setHeaderCache(target: GoogleSheetsTarget, headers: string[]): void {
    this.headerCache.set(this.headerCacheKey(target), { headers, expiresAt: Date.now() + HEADER_CACHE_TTL_MS });
  }

  private async authorizedFetch(url: string, init?: RequestInit): Promise<Response> {
    const token = await getServiceAccountAccessToken(this.credentials, this.fetchImpl);
    const response = await this.fetchImpl(url, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      throw new Error(
        `Google Sheets API error (HTTP ${response.status}) for ${describeUrl(url)}: ${bodyText}`
      );
    }
    return response;
  }

  private async readHeaderRow(target: GoogleSheetsTarget): Promise<string[]> {
    const cached = this.headerCache.get(this.headerCacheKey(target));
    if (cached && cached.expiresAt > Date.now()) return cached.headers;

    const headerRow = target.headerRowCount ?? 1;
    const range = `${quoteSheetName(target.sheetName)}!${headerRow}:${headerRow}`;
    const url = `${API_BASE}/${target.spreadsheetId}/values/${encodeURIComponent(range)}`;
    const response = await this.authorizedFetch(url);
    const body = (await response.json()) as { values?: string[][] };
    const headers = body.values?.[0] ?? [];
    this.setHeaderCache(target, headers);
    return headers;
  }

  async ensureHeaders(target: GoogleSheetsTarget, requiredHeaders: string[]): Promise<string[]> {
    const headerRow = target.headerRowCount ?? 1;
    const current = await this.readHeaderRow(target);
    const missing = requiredHeaders.filter((h) => !current.includes(h));
    if (missing.length === 0) return current;

    const updated = [...current, ...missing];
    const range = `${quoteSheetName(target.sheetName)}!${headerRow}:${headerRow}`;
    const url = `${API_BASE}/${target.spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
    await this.authorizedFetch(url, {
      method: "PUT",
      body: JSON.stringify({ range, majorDimension: "ROWS", values: [updated] }),
    });
    this.setHeaderCache(target, updated);
    return updated;
  }

  async findRowByKey(target: GoogleSheetsTarget, keyHeader: string, keyValue: string): Promise<number | null> {
    const headers = await this.readHeaderRow(target);
    const columnIndex = headers.indexOf(keyHeader);
    if (columnIndex === -1) {
      throw new Error(
        `findRowByKey: header "${keyHeader}" not found in sheet "${target.sheetName}" — call ensureHeaders first`
      );
    }
    const columnLetter = columnIndexToLetter(columnIndex);
    // Data starts immediately after the last header row (§ GoogleSheetsTarget.headerRowCount).
    const firstDataRow = (target.headerRowCount ?? 1) + 1;
    const range = `${quoteSheetName(target.sheetName)}!${columnLetter}${firstDataRow}:${columnLetter}`;
    const url = `${API_BASE}/${target.spreadsheetId}/values/${encodeURIComponent(range)}`;
    const response = await this.authorizedFetch(url);
    const body = (await response.json()) as { values?: string[][] };
    const column = body.values ?? [];
    const index = column.findIndex((row) => (row[0] ?? "") === keyValue);
    return index === -1 ? null : index + firstDataRow;
  }

  async updateRow(target: GoogleSheetsTarget, rowNumber: number, values: SheetRowValues): Promise<void> {
    const headers = await this.readHeaderRow(target);
    const data = Object.entries(values).map(([header, value]) => {
      const columnIndex = headers.indexOf(header);
      if (columnIndex === -1) {
        throw new Error(
          `updateRow: header "${header}" not found in sheet "${target.sheetName}" — call ensureHeaders first`
        );
      }
      const columnLetter = columnIndexToLetter(columnIndex);
      const range = `${quoteSheetName(target.sheetName)}!${columnLetter}${rowNumber}`;
      return { range, majorDimension: "ROWS", values: [[value]] };
    });

    const url = `${API_BASE}/${target.spreadsheetId}/values:batchUpdate`;
    await this.authorizedFetch(url, {
      method: "POST",
      body: JSON.stringify({ valueInputOption: "RAW", data }),
    });
  }

  /**
   * Inserts a brand-new physical row at the very top of the data range
   * (immediately after the last header row), pushing every existing data
   * row down by one — new entries appear newest-first, top to bottom,
   * mirroring the order CHAD's own `cp_history` oplog captures them in
   * (2026-07-22 follow-up: previously appended at the bottom, oldest-first,
   * which the user flagged as wrong — Sheets should read like the oplog: a
   * one-way mirror where each new event lands at the top).
   *
   * `insertDimension` with `inheritFromBefore: false` means the new row
   * inherits formatting from the row AFTER it (the previously-first data
   * row) rather than from the header row above — the correct body-row
   * formatting, not header formatting.
   *
   * Previously used `findNextEmptyDataRow` + a `values.update` PUT to the
   * computed bottom row (itself a fix for `values.append`'s
   * `insertDataOption=INSERT_ROWS` table-detection heuristic getting
   * confused by this tab's blank-A1 2-header-row layout — see git history
   * for that incident). `insertDimension` sidesteps both problems at once:
   * it's an explicit structural insert, not a heuristic, and always targets
   * a known fixed row (`firstDataRow`), never a computed "next empty" one.
   */
  async appendRow(target: GoogleSheetsTarget, values: SheetRowValues): Promise<void> {
    const headers = await this.readHeaderRow(target);
    const row = headers.map((header) => values[header] ?? "");
    const sheetId = await this.getSheetId(target);
    const firstDataRow = (target.headerRowCount ?? 1) + 1;

    await this.batchUpdate(target.spreadsheetId, [
      {
        insertDimension: {
          range: { sheetId, dimension: "ROWS", startIndex: firstDataRow - 1, endIndex: firstDataRow },
          inheritFromBefore: false,
        },
      },
    ]);

    const range = `${quoteSheetName(target.sheetName)}!A${firstDataRow}`;
    const url = `${API_BASE}/${target.spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
    await this.authorizedFetch(url, {
      method: "PUT",
      body: JSON.stringify({ range, majorDimension: "ROWS", values: [row] }),
    });
  }

  async getSheetId(target: GoogleSheetsTarget): Promise<number> {
    const cacheKey = `${target.spreadsheetId}::${target.sheetName}`;
    const cached = this.sheetIdCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const url = `${API_BASE}/${target.spreadsheetId}?fields=${encodeURIComponent("sheets.properties(sheetId,title)")}`;
    const response = await this.authorizedFetch(url);
    const body = (await response.json()) as { sheets?: Array<{ properties?: { sheetId?: number; title?: string } }> };
    const match = (body.sheets ?? []).find((s) => s.properties?.title === target.sheetName);
    if (!match?.properties?.sheetId && match?.properties?.sheetId !== 0) {
      throw new Error(`getSheetId: tab "${target.sheetName}" not found in spreadsheet`);
    }
    this.sheetIdCache.set(cacheKey, match.properties.sheetId);
    return match.properties.sheetId;
  }

  async batchUpdate(spreadsheetId: string, requests: Record<string, unknown>[]): Promise<void> {
    if (requests.length === 0) return;
    const url = `${API_BASE}/${spreadsheetId}:batchUpdate`;
    await this.authorizedFetch(url, {
      method: "POST",
      body: JSON.stringify({ requests }),
    });
  }

  async getSheetDeveloperMetadata(target: GoogleSheetsTarget, key: string): Promise<string | null> {
    const sheetId = await this.getSheetId(target);
    const url = `${API_BASE}/${target.spreadsheetId}/developerMetadata:search`;
    const response = await this.authorizedFetch(url, {
      method: "POST",
      body: JSON.stringify({
        dataFilters: [
          {
            developerMetadataLookup: {
              locationType: "SHEET",
              metadataLocation: { sheetId },
              metadataKey: key,
            },
          },
        ],
      }),
    });
    const body = (await response.json()) as {
      matchedDeveloperMetadata?: Array<{ developerMetadata?: { metadataValue?: string } }>;
    };
    return body.matchedDeveloperMetadata?.[0]?.developerMetadata?.metadataValue ?? null;
  }
}

/** Strips the spreadsheet id out of a URL for error messages — avoids logging it as if it were a secret-adjacent value repeatedly, keeps error text short. */
function describeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname.split("/").slice(0, 3).join("/") + "/...";
  } catch {
    return "sheets API request";
  }
}
