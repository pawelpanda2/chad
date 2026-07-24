/**
 * Entry points business functions (`leads.ts`) call — one `if
 * (config.googleSheetsEnabled) { ... }` block per Daily Entry/Date Entry
 * write. Never throws: a Google Sheets problem (including
 * misconfiguration) must never turn a successful CHAD write into a failed
 * response — same non-throwing precedent as `data-router.ts`'s
 * `onFollowerEnqueueError`.
 *
 * When called inside `runWithGoogleSheetsTxnBuffer` (Postgres mutation
 * path), the job is deferred and flushed on the same client before COMMIT
 * so cp_items + cp_history + outbox stay atomic.
 */

import { randomUUID } from "node:crypto";
import { loadGoogleSheetsConfig, resolveSpreadsheetIdForUser } from "./config.js";
import { enqueueGoogleSheetsSync } from "./outbox.js";
import { checkGoogleSheetsProductionGuard, checkGoogleSheetsWriteAllowed } from "./production-guard.js";
import { deferGoogleSheetsJob, deferGoogleSheetsJobFactory } from "./txn-hook.js";
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
  /** When known (Postgres txn path), becomes outbox operationId / payload.mutationId. */
  mutationId?: string;
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

  const guard = checkGoogleSheetsProductionGuard();
  if (!guard.allowed) {
    console.warn(`[google-sheets] enqueue blocked by production guard: ${guard.reason}`);
    return;
  }

  const writeGuard = checkGoogleSheetsWriteAllowed(input.username);
  if (!writeGuard.allowed) {
    console.warn(`[google-sheets] enqueue blocked for user: ${writeGuard.reason}`);
    return;
  }

  let spreadsheetId: string;
  try {
    spreadsheetId = resolveSpreadsheetIdForUser(config, input.username);
  } catch (error) {
    onEnqueueError(error);
    return;
  }

  const operationId = input.mutationId ?? randomUUID();
  const payload: SheetSyncPayload = {
    recordType,
    recordKey: `${input.repoGuid}:${input.loca}`,
    repoGuid: input.repoGuid,
    username: input.username,
    spreadsheetId,
    loca: input.loca,
    itemName: input.itemName,
    fields: input.fields,
    mutationId: input.mutationId ?? operationId,
  };

  const enqueueInput = { operationId, kind: input.kind, payload };

  if (deferGoogleSheetsJob(enqueueInput)) {
    return;
  }

  try {
    await enqueueGoogleSheetsSync(enqueueInput);
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

/** Enqueues a Google Sheets sync job for one Lead write, if the integration is enabled. */
export async function queueLeadSheetSyncIfEnabled(
  input: QueueSheetSyncInput,
  onEnqueueError: (error: unknown) => void = defaultOnEnqueueError
): Promise<void> {
  return queueSheetSyncIfEnabled("lead", input, onEnqueueError);
}

function defaultOnEnqueueError(error: unknown): void {
  console.error("[google-sheets] Failed to enqueue sheet sync job:", error);
}

/**
 * Registers a create-time sheet sync factory inside an open
 * `runWithGoogleSheetsTxnBuffer`. Resolves spreadsheetId now; fills loca
 * at flush from the created item.
 */
export function prepareSheetSyncFactoryInTxn(
  recordType: SheetRecordType,
  input: Omit<QueueSheetSyncInput, "loca" | "itemName" | "mutationId"> & {
    itemName?: string;
    loca?: string;
  },
  onEnqueueError: (error: unknown) => void = defaultOnEnqueueError
): void {
  let config;
  try {
    config = loadGoogleSheetsConfig();
  } catch (error) {
    onEnqueueError(error);
    return;
  }
  if (!config.enabled) return;

  const guard = checkGoogleSheetsProductionGuard();
  if (!guard.allowed) {
    console.warn(`[google-sheets] enqueue blocked by production guard: ${guard.reason}`);
    return;
  }
  const writeGuard = checkGoogleSheetsWriteAllowed(input.username);
  if (!writeGuard.allowed) {
    console.warn(`[google-sheets] enqueue blocked for user: ${writeGuard.reason}`);
    return;
  }

  let spreadsheetId: string;
  try {
    spreadsheetId = resolveSpreadsheetIdForUser(config, input.username);
  } catch (error) {
    onEnqueueError(error);
    return;
  }

  deferGoogleSheetsJobFactory(({ mutationId, item }) => {
    if (!item && input.kind !== "delete") return null;
    const loca =
      input.loca ||
      (item ? item.config.address.replace(`${input.repoGuid}/`, "") : "");
    const itemName = input.itemName || item?.config.name || "";
    return {
      operationId: mutationId,
      kind: input.kind,
      payload: {
        recordType,
        recordKey: `${input.repoGuid}:${loca}`,
        repoGuid: input.repoGuid,
        username: input.username,
        spreadsheetId,
        loca,
        itemName,
        fields: input.fields,
        mutationId,
      },
    };
  });
}

