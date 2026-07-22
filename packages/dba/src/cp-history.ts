/**
 * `cp_history` read-side backend dispatcher (Story 80). Story 74/79 built
 * this directly on MongoDB (now `cp-history-mongo.ts`); Story 80 adds a
 * PostgreSQL-backed implementation (`cp-history-postgres.ts`) and turns this
 * module into a thin dispatcher on `loadDataProvidersConfig().primaryBackend`,
 * so the Dashboard History UI/API routes (`packages/dashboard/app/api/
 * content-provider/history/...`) need zero changes to read whichever
 * backend a repo has cut over to.
 */

import { loadDataProvidersConfig } from "./data-providers/config.js";
import * as mongoHistory from "./cp-history-mongo.js";
import * as postgresHistory from "./cp-history-postgres.js";
import type { ListCpHistoryInput, ListCpHistoryResult, CpHistoryDetail } from "./cp-history-types.js";

export type {
  CpHistoryActorKind,
  CpHistoryConfigOp,
  CpHistoryBodyHunk,
  CpHistoryActor,
  CpHistoryListItem,
  CpHistoryDetail,
  ListCpHistoryInput,
  ListCpHistoryResult,
} from "./cp-history-types.js";

interface CpHistoryReadBackend {
  listCpHistory(input: ListCpHistoryInput): Promise<ListCpHistoryResult>;
  getCpHistoryEntry(id: string, repoGuid: string): Promise<CpHistoryDetail | null>;
  resolveDailyTrackerAddressPrefix(repoGuid: string): Promise<string | null>;
  listDailyTrackerHistory(input: Omit<ListCpHistoryInput, "addressPrefix">): Promise<ListCpHistoryResult>;
  resolveDateEntriesAddressPrefix(repoGuid: string): Promise<string | null>;
  listDateEntriesHistory(input: Omit<ListCpHistoryInput, "addressPrefix">): Promise<ListCpHistoryResult>;
  getCpHistoryForItem(sourceId: string, repoGuid: string): Promise<CpHistoryDetail[]>;
}

function backend(): CpHistoryReadBackend {
  return loadDataProvidersConfig().primaryBackend === "postgres" ? postgresHistory : mongoHistory;
}

export async function listCpHistory(input: ListCpHistoryInput): Promise<ListCpHistoryResult> {
  return backend().listCpHistory(input);
}

export async function getCpHistoryEntry(id: string, repoGuid: string): Promise<CpHistoryDetail | null> {
  return backend().getCpHistoryEntry(id, repoGuid);
}

export async function resolveDailyTrackerAddressPrefix(repoGuid: string): Promise<string | null> {
  return backend().resolveDailyTrackerAddressPrefix(repoGuid);
}

export async function listDailyTrackerHistory(
  input: Omit<ListCpHistoryInput, "addressPrefix">
): Promise<ListCpHistoryResult> {
  return backend().listDailyTrackerHistory(input);
}

export async function resolveDateEntriesAddressPrefix(repoGuid: string): Promise<string | null> {
  return backend().resolveDateEntriesAddressPrefix(repoGuid);
}

export async function listDateEntriesHistory(
  input: Omit<ListCpHistoryInput, "addressPrefix">
): Promise<ListCpHistoryResult> {
  return backend().listDateEntriesHistory(input);
}

export async function getCpHistoryForItem(sourceId: string, repoGuid: string): Promise<CpHistoryDetail[]> {
  return backend().getCpHistoryForItem(sourceId, repoGuid);
}
