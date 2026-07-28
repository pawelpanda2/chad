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
import { enqueueGoogleSheetsSync, enqueueBlockedGoogleSheetsSync } from "./outbox.js";
import { checkGoogleSheetsProductionGuard, checkGoogleSheetsWriteAllowed } from "./production-guard.js";
import { deferGoogleSheetsJob, deferGoogleSheetsJobFactory } from "./txn-hook.js";
import type { GoogleSheetsSyncKind, SheetRecordType, SheetSyncPayload } from "./types.js";

/**
 * Builds the payload for a job that SHOULD sync but couldn't be enqueued
 * normally (config/guard/mapping failure) — `spreadsheetId` is left empty
 * since it couldn't be resolved; a human fixing the underlying issue and
 * re-running the reconciliation repair (see
 * tests/1_2_google-sheets-sync/integration/reconcile-real-users.test.mjs)
 * is expected to supersede this row, not the worker auto-retrying it (it's
 * inserted already `failed`, not `pending`/`retry`).
 */
function blockedPayload(recordType: SheetRecordType, input: QueueSheetSyncInput): SheetSyncPayload {
  return {
    recordType,
    recordKey: `${input.repoGuid}:${input.loca}`,
    repoGuid: input.repoGuid,
    username: input.username,
    spreadsheetId: "",
    loca: input.loca,
    itemName: input.itemName,
    fields: input.fields,
    mutationId: input.mutationId ?? randomUUID(),
  };
}

/**
 * Same idea as `blockedPayload`, for `prepareSheetSyncFactoryInTxn`'s
 * create-time path — `loca` isn't known until flush time, so this defers a
 * factory (like the normal create path does) instead of building the
 * payload immediately.
 */
function deferBlockedFactory(
  recordType: SheetRecordType,
  input: Omit<QueueSheetSyncInput, "loca" | "itemName" | "mutationId"> & { itemName?: string; loca?: string },
  reason: string
): void {
  deferGoogleSheetsJobFactory(({ mutationId, item }) => {
    if (!item) return null;
    const loca = input.loca || item.config.address.replace(`${input.repoGuid}/`, "");
    const itemName = input.itemName || item.config.name || "";
    return {
      operationId: mutationId,
      kind: input.kind,
      blockedReason: reason,
      payload: {
        recordType,
        recordKey: `${input.repoGuid}:${loca}`,
        repoGuid: input.repoGuid,
        username: input.username,
        spreadsheetId: "",
        loca,
        itemName,
        fields: input.fields,
        mutationId,
      },
    };
  });
}

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
    // Config itself is broken (e.g. Compose-stripped SPREADSHEET_MAP JSON)
    // — this is a "should sync, couldn't" case (unlike the two guard checks
    // below, which are deliberate environment/user policy, not a config
    // error), so it must leave a visible, failed outbox row rather than
    // nothing (2026-07-28 — see the pawel_f Daily lost-outbox finding in
    // tests/release-audit-report.md for why "nothing" is never acceptable
    // here).
    onEnqueueError(error);
    await enqueueBlockedGoogleSheetsSync({
      operationId: input.mutationId ?? randomUUID(),
      kind: input.kind,
      payload: blockedPayload(recordType, input),
      reason: `loadGoogleSheetsConfig failed: ${error instanceof Error ? error.message : String(error)}`,
    }).catch(() => {});
    return;
  }
  if (!config.enabled) return; // deliberate global policy off — not a per-record gap.

  const guard = checkGoogleSheetsProductionGuard();
  if (!guard.allowed) {
    // Deliberate environment policy (e.g. LOCAL without explicit opt-in) —
    // applies to every mutation in this environment, not a per-record
    // integrity gap, so no outbox row (would otherwise flood the table).
    console.warn(`[google-sheets] enqueue blocked by production guard: ${guard.reason}`);
    return;
  }

  const writeGuard = checkGoogleSheetsWriteAllowed(input.username);
  if (!writeGuard.allowed) {
    // Deliberate non-prod write allowlist (protects pawel_f/kamil_s from
    // accidental TEST-triggered syncs) — also environment/user policy, not
    // a per-record gap.
    console.warn(`[google-sheets] enqueue blocked for user: ${writeGuard.reason}`);
    return;
  }

  let spreadsheetId: string;
  try {
    spreadsheetId = resolveSpreadsheetIdForUser(config, input.username);
  } catch (error) {
    // The user passed every guard above (eligible to sync in this
    // environment) but has no spreadsheet mapping — a real configuration
    // gap for a record that should sync, not a policy no-op.
    onEnqueueError(error);
    await enqueueBlockedGoogleSheetsSync({
      operationId: input.mutationId ?? randomUUID(),
      kind: input.kind,
      payload: blockedPayload(recordType, input),
      reason: `resolveSpreadsheetIdForUser failed: ${error instanceof Error ? error.message : String(error)}`,
    }).catch(() => {});
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
    deferBlockedFactory(recordType, input, `loadGoogleSheetsConfig failed: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  if (!config.enabled) return; // deliberate global policy off — not a per-record gap.

  const guard = checkGoogleSheetsProductionGuard();
  if (!guard.allowed) {
    // Deliberate environment policy — see queueSheetSyncIfEnabled's own comment.
    console.warn(`[google-sheets] enqueue blocked by production guard: ${guard.reason}`);
    return;
  }
  const writeGuard = checkGoogleSheetsWriteAllowed(input.username);
  if (!writeGuard.allowed) {
    // Deliberate non-prod write allowlist — see queueSheetSyncIfEnabled's own comment.
    console.warn(`[google-sheets] enqueue blocked for user: ${writeGuard.reason}`);
    return;
  }

  let spreadsheetId: string;
  try {
    spreadsheetId = resolveSpreadsheetIdForUser(config, input.username);
  } catch (error) {
    onEnqueueError(error);
    deferBlockedFactory(recordType, input, `resolveSpreadsheetIdForUser failed: ${error instanceof Error ? error.message : String(error)}`);
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

