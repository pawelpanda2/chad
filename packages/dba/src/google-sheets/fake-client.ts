/**
 * In-memory fake `GoogleSheetsClient` (Story 75) — used by every automated
 * test and by any caller that wants to exercise the sync path without a
 * real Google account. Mirrors the header-name-based column resolution
 * `sheets-api-client.ts` implements for real, so tests against this fake
 * exercise the same contract (missing headers get appended, unknown/manual
 * columns are preserved, updates never touch a column absent from the
 * written `values`).
 */

import type { GoogleSheetsClient, GoogleSheetsTarget, SheetRowValues } from "./types.js";

interface FakeSheet {
  headers: string[];
  /** Each row is a plain header-name -> string-value map (sparse — a manual column not set for a row is simply absent). */
  rows: SheetRowValues[];
  /** Stable fake sheetId, assigned the first time this tab is touched — real IDs are opaque integers too. */
  sheetId: number;
  /** metadataKey -> metadataValue, sheet-scoped — enough to make layout.ts's version-idempotency logic testable. */
  developerMetadata: Map<string, string>;
}

let nextFakeSheetId = 1000;

export class FakeGoogleSheetsClient implements GoogleSheetsClient {
  private readonly sheets = new Map<string, FakeSheet>();
  /** Every call made, in order — for tests asserting call counts/args without a real network. */
  public readonly calls: Array<{ method: string; target: GoogleSheetsTarget; args: unknown }> = [];
  /** Every `batchUpdate` request object ever sent, in order, across all targets — the primary assertion surface for layout.ts tests. */
  public readonly batchUpdateRequests: Record<string, unknown>[] = [];
  /** When set, every call throws this instead of doing anything — simulates a Google API failure for retry tests. */
  public failNextCallsWith: Error | null = null;

  private key(target: GoogleSheetsTarget): string {
    return `${target.spreadsheetId}::${target.sheetName}`;
  }

  private sheet(target: GoogleSheetsTarget): FakeSheet {
    const k = this.key(target);
    let sheet = this.sheets.get(k);
    if (!sheet) {
      sheet = { headers: [], rows: [], sheetId: nextFakeSheetId++, developerMetadata: new Map() };
      this.sheets.set(k, sheet);
    }
    return sheet;
  }

  private maybeFail(): void {
    if (this.failNextCallsWith) {
      const error = this.failNextCallsWith;
      throw error;
    }
  }

  /** Test helper: inspect the current header row of a target sheet. */
  getHeaders(target: GoogleSheetsTarget): string[] {
    return [...this.sheet(target).headers];
  }

  /** Test helper: inspect all current rows (1:1 with sheet row order) of a target sheet. */
  getRows(target: GoogleSheetsTarget): SheetRowValues[] {
    return this.sheet(target).rows.map((r) => ({ ...r }));
  }

  async ensureHeaders(target: GoogleSheetsTarget, requiredHeaders: string[]): Promise<string[]> {
    this.calls.push({ method: "ensureHeaders", target, args: { requiredHeaders } });
    this.maybeFail();
    const sheet = this.sheet(target);
    for (const header of requiredHeaders) {
      if (!sheet.headers.includes(header)) {
        sheet.headers.push(header);
      }
    }
    return [...sheet.headers];
  }

  async findRowByKey(target: GoogleSheetsTarget, keyHeader: string, keyValue: string): Promise<number | null> {
    this.calls.push({ method: "findRowByKey", target, args: { keyHeader, keyValue } });
    this.maybeFail();
    const sheet = this.sheet(target);
    const index = sheet.rows.findIndex((row) => row[keyHeader] === keyValue);
    // 1-based; data starts right after the last header row (default 1 header row -> row 2).
    const firstDataRow = (target.headerRowCount ?? 1) + 1;
    return index === -1 ? null : index + firstDataRow;
  }

  async updateRow(target: GoogleSheetsTarget, rowNumber: number, values: SheetRowValues): Promise<void> {
    this.calls.push({ method: "updateRow", target, args: { rowNumber, values } });
    this.maybeFail();
    const sheet = this.sheet(target);
    const firstDataRow = (target.headerRowCount ?? 1) + 1;
    const index = rowNumber - firstDataRow;
    if (index < 0 || index >= sheet.rows.length) {
      throw new Error(`FakeGoogleSheetsClient.updateRow: no such row ${rowNumber}`);
    }
    // Only the columns present in `values` change — matches the real
    // client's contract (manual/unrelated columns in this row untouched).
    sheet.rows[index] = { ...sheet.rows[index], ...values };
  }

  async appendRow(target: GoogleSheetsTarget, values: SheetRowValues): Promise<void> {
    this.calls.push({ method: "appendRow", target, args: { values } });
    this.maybeFail();
    const sheet = this.sheet(target);
    // Insert at the TOP of the data range (2026-07-22 follow-up — new
    // entries should appear newest-first, mirroring the real client's
    // insert-at-top `appendRow`), never appended at the bottom.
    sheet.rows.unshift({ ...values });
  }

  async getSheetId(target: GoogleSheetsTarget): Promise<number> {
    this.calls.push({ method: "getSheetId", target, args: {} });
    this.maybeFail();
    return this.sheet(target).sheetId;
  }

  async batchUpdate(spreadsheetId: string, requests: Record<string, unknown>[]): Promise<void> {
    this.calls.push({ method: "batchUpdate", target: { spreadsheetId, sheetName: "" }, args: { requests } });
    this.maybeFail();
    this.batchUpdateRequests.push(...requests);
    // Only developer-metadata requests have any effect on Fake state —
    // every other request type (repeatCell, updateDimensionProperties,
    // mergeCells, setDataValidation, setBasicFilter, ...) is purely visual/
    // structural and never read back by any test; layout.test.ts asserts
    // directly on `batchUpdateRequests`'s shape instead (see that file).
    for (const request of requests) {
      const create = request.createDeveloperMetadata as
        | { developerMetadata?: { metadataKey?: string; metadataValue?: string; location?: { sheetId?: number } } }
        | undefined;
      const update = request.updateDeveloperMetadata as
        | {
            dataFilters?: Array<{ developerMetadataLookup?: { metadataKey?: string; metadataLocation?: { sheetId?: number } } }>;
            developerMetadata?: { metadataValue?: string };
          }
        | undefined;

      if (create?.developerMetadata?.metadataKey && create.developerMetadata.location?.sheetId !== undefined) {
        const sheet = this.findSheetById(create.developerMetadata.location.sheetId);
        if (sheet) sheet.developerMetadata.set(create.developerMetadata.metadataKey, create.developerMetadata.metadataValue ?? "");
      }
      if (update?.dataFilters?.[0]?.developerMetadataLookup?.metadataKey && update.developerMetadata?.metadataValue !== undefined) {
        const lookup = update.dataFilters[0].developerMetadataLookup;
        const sheet = lookup.metadataLocation?.sheetId !== undefined ? this.findSheetById(lookup.metadataLocation.sheetId) : undefined;
        if (sheet && lookup.metadataKey) sheet.developerMetadata.set(lookup.metadataKey, update.developerMetadata.metadataValue);
      }
    }
  }

  async getSheetDeveloperMetadata(target: GoogleSheetsTarget, key: string): Promise<string | null> {
    this.calls.push({ method: "getSheetDeveloperMetadata", target, args: { key } });
    this.maybeFail();
    return this.sheet(target).developerMetadata.get(key) ?? null;
  }

  /** Test helper: the batchUpdateRequests sent for one target only (filters out other tabs/spreadsheets). */
  getBatchUpdateRequestsFor(target: GoogleSheetsTarget): Record<string, unknown>[] {
    const sheetId = this.sheet(target).sheetId;
    return this.batchUpdateRequests.filter((r) => JSON.stringify(r).includes(`"sheetId":${sheetId}`));
  }

  private findSheetById(sheetId: number): FakeSheet | undefined {
    for (const sheet of this.sheets.values()) {
      if (sheet.sheetId === sheetId) return sheet;
    }
    return undefined;
  }
}
