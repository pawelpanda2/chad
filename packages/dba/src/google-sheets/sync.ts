/**
 * Entry points business functions (`leads.ts`) call — one `if
 * (config.googleSheetsEnabled) { ... }` block per Daily Entry/Date Entry
 * write, exactly the shape asked for in `backlog/stories/75/01_input.md`'s
 * pseudocode. Never throws: a Google Sheets problem (including
 * misconfiguration) must never turn a successful CHAD write into a failed
 * response — same non-throwing precedent as `data-router.ts`'s
 * `onFollowerEnqueueError`.
 *
 * Takes already-parsed `fields` (not a raw YAML body) — `leads.ts` owns
 * parsing its own YAML bodies and, for Daily Entry, computing the "— AUTO"
 * columns fresh at write time (see `computeDailyAutoFieldsForSheetSync`),
 * so this module stays free of both YAML and Date-Entry-lookup concerns.
 *
 * `input.username` must be the caller's own request-scoped username
 * (`getCurrentUsername()` in `repo-context.ts`, same source `leads.ts`
 * already uses for `repoGuid`) — never a value taken from request body or
 * query, so a user can never enqueue a job that resolves to someone else's
 * spreadsheet (Story 75 follow-up, see `config.ts`'s revision note).
 */

import { randomUUID } from "node:crypto";
import { loadGoogleSheetsConfig, resolveSpreadsheetIdForUser } from "./config.js";
import { enqueueGoogleSheetsSync } from "./outbox.js";
import type { GoogleSheetsSyncKind, SheetRecordType, SheetSyncPayload } from "./types.js";

export interface QueueSheetSyncInput {
  repoGuid: string;
  /** The acting user's CHAD username — see file header doc comment. */
  username: string;
  loca: string;
  itemName: string;
  /** Already-resolved field values (domain fields, plus AUTO fields for daily-entry if applicable). Ignored/empty for `kind: "delete"`. */
  fields: Record<string, string>;
  kind: GoogleSheetsSyncKind;
}

async function queueSheetSyncIfEnabled(
  recordType: SheetRecordType,
  input: QueueSheetSyncInput,
  onEnqueueError: (error: unknown) => void
): Promise<void> {
  let config;
  try {
    config = loadGoogleSheetsConfig();
  } catch (error) {
    onEnqueueError(error);
    return;
  }
  if (!config.enabled) return;

  let spreadsheetId: string;
  try {
    spreadsheetId = resolveSpreadsheetIdForUser(config, input.username);
  } catch (error) {
    onEnqueueError(error);
    return;
  }

  const payload: SheetSyncPayload = {
    recordType,
    recordKey: `${input.repoGuid}:${input.loca}`,
    repoGuid: input.repoGuid,
    username: input.username,
    spreadsheetId,
    loca: input.loca,
    itemName: input.itemName,
    fields: input.fields,
  };

  try {
    await enqueueGoogleSheetsSync({ operationId: randomUUID(), kind: input.kind, payload });
  } catch (error) {
    onEnqueueError(error);
  }
}

/** Enqueues a Google Sheets sync job for one Daily Entry write, if the integration is enabled. */
export async function queueDailyEntrySheetSyncIfEnabled(
  input: QueueSheetSyncInput,
  onEnqueueError: (error: unknown) => void = defaultOnEnqueueError
): Promise<void> {
  return queueSheetSyncIfEnabled("daily-entry", input, onEnqueueError);
}

/** Enqueues a Google Sheets sync job for one Date Entry write, if the integration is enabled. */
export async function queueDateEntrySheetSyncIfEnabled(
  input: QueueSheetSyncInput,
  onEnqueueError: (error: unknown) => void = defaultOnEnqueueError
): Promise<void> {
  return queueSheetSyncIfEnabled("date-entry", input, onEnqueueError);
}

function defaultOnEnqueueError(error: unknown): void {
  console.error("[google-sheets] Failed to enqueue sheet sync job:", error);
}
