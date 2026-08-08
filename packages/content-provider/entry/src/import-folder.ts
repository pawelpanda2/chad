/**
 * Public entry point for the ZIP Folder import feature (Story 109) — the
 * only new CHAD-specific bulk operation cp-entry exposes beyond the 6
 * ContentProviderStorage methods (import isn't part of the real external
 * CP protocol those mirror). Callers (packages/dba) never touch cp-files/
 * cp-postgre directly — always this function.
 */

import type { CpImportCommitError, CpImportCommitResult, CpImportValidationError, ImportFolderLimits } from "cp-core";
import { stageAndValidateZipImport } from "cp-files";
import { commitFolderImportPostgre } from "cp-postgre";
import { getBackendKindForRepo } from "./repo-storage-config.js";

export interface ImportFolderFromZipInput {
  repoGuid: string;
  /** Full CP address of the target parent Folder — already resolved/validated by the DBA caller. */
  parentAddress: string;
  /** Absolute staging directory — already resolved/authorized by the DBA caller (session-scoped, never client input). */
  stagingDir: string;
  zipBytes: Buffer;
  actor: { username: string; repoGuid: string } | null;
  limits?: Partial<ImportFolderLimits>;
}

export type ImportFolderFromZipResult =
  | { phase: "validation-failed"; errors: CpImportValidationError[] }
  | { phase: "commit-failed"; error: CpImportCommitError }
  | { phase: "committed"; result: CpImportCommitResult };

export async function importFolderFromZip(input: ImportFolderFromZipInput): Promise<ImportFolderFromZipResult> {
  const validation = await stageAndValidateZipImport({
    stagingDir: input.stagingDir,
    zipBytes: input.zipBytes,
    limits: input.limits,
  });
  if (!validation.ok) {
    return { phase: "validation-failed", errors: validation.errors };
  }

  const backend = getBackendKindForRepo(input.repoGuid);
  if (backend !== "postgre") {
    return {
      phase: "commit-failed",
      error: {
        code: "BACKEND_NOT_SUPPORTED",
        message: `ZIP import is only supported on the "postgre" backend (this repo is currently routed to "${backend}")`,
      },
    };
  }

  const commit = await commitFolderImportPostgre({
    repoGuid: input.repoGuid,
    parentAddress: input.parentAddress,
    plan: validation.plan,
    actor: input.actor,
  });
  if (!commit.ok) {
    return { phase: "commit-failed", error: commit.error };
  }
  return { phase: "committed", result: commit.result };
}
