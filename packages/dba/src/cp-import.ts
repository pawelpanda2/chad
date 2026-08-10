/**
 * DBA orchestration for the ZIP Folder import feature (Story 109). Owns
 * session/repo context, permissions, and staging-path resolution —
 * everything CHAD-application-specific — then delegates the actual CP
 * domain work (ZIP validation/parsing, atomic commit) to `cp-entry`'s
 * `importFolderFromZip`. See ai-docs/content-provider/ai-start.md and
 * ai-docs/content-provider/zip-import.md for the full layering/contract.
 *
 * Deliberately does NOT contain ZIP parsing, config.yaml/body.txt rules,
 * or SQL — those live in packages/content-provider. The one exception is
 * resolving the target parent Folder, which goes through `cp-entry`'s
 * `entry.GetItem` (a working CP contract already) rather than dba's own
 * `item-ops.ts`/`postgres-cp-provider.ts` shortcut, so this new code path
 * doesn't add to the accepted (but not-to-be-repeated) migration debt.
 */

import { randomUUID } from "node:crypto";
import { ContentProviderError, type CpImportSkipPolicy } from "cp-core";
import { entry, ensurePostgreConnectionUri, importFolderFromZip } from "cp-entry";
import { getCurrentUsername, tryGetCurrentActor } from "./repo-context.js";
import { assertChadWriteAllowed } from "./chad-data-mode.js";
import { getEffectivePostgresUri } from "./dev-db-override.js";
import { assertRepoAllowlisted } from "./data-providers/repo-allowlist-guard.js";
import { assertNotSystemFolderWrite, SystemFolderReadOnlyError } from "./system-folders.js";
import { resolveLogicalNamePath } from "./folders.js";
import {
  assertSafeContactPhotoPath,
  assertSafeUsername,
  getContactPhotosRootDir,
  ContactPhotoError,
} from "./google-contact-photos.js";

export type CpImportErrorCode =
  | "VALIDATION"
  | "PARENT_NOT_FOUND"
  | "PARENT_NOT_FOLDER"
  | "ROOT_NAME_CONFLICT"
  | "SYSTEM_FOLDER_READ_ONLY"
  | "BACKEND_NOT_SUPPORTED"
  | "COMMIT_FAILED"
  | "WRITE_FORBIDDEN"
  | "NOT_CONFIGURED";

export interface CpImportValidationErrorDetail {
  code: string;
  path: string;
  message: string;
}

export interface CpImportSkippedEntryDetail {
  code: string;
  path: string;
  message: string;
}

/**
 * Fixed, hardcoded relaxation for the two specific real-world cases found
 * against a real user export (Story 109 follow-up) — never applied unless
 * the caller explicitly opts in (`ImportCpFolderFromZipInput.skipUnsupported`),
 * which the Dashboard route only sets after the user has been shown exactly
 * what would be skipped and confirmed. Not user-configurable beyond this
 * on/off switch — extending which extensions/types are skippable is a
 * deliberate, separate decision, not something a client can widen itself.
 */
const SKIP_POLICY: CpImportSkipPolicy = { skipRefItems: true, skipUnexpectedFileExtensions: ["wav", "bak"] };

export class CpImportError extends Error {
  constructor(
    public readonly code: CpImportErrorCode,
    message: string,
    public readonly validationErrors?: CpImportValidationErrorDetail[]
  ) {
    super(message);
    this.name = "CpImportError";
  }
}

export interface ImportCpFolderFromZipInput {
  /** Full CP address of the currently-open Folder in the Dashboard's Folders tab. */
  parentAddress: string;
  /**
   * The repo `parentAddress` must belong to — already authorized by the
   * caller (the route's `resolveFoldersRepoAccess` result), NOT re-derived
   * from the session's own repo. Folders lets a session target a repo
   * other than its own (`chad_shared`), so the session's repo and the
   * repo actually being written to are two different things; conflating
   * them here was a real bug (every cross-repo import — e.g. into
   * `chad_shared` — failed with `PARENT_NOT_FOUND`, "address does not
   * belong to the current repo", even for an otherwise-authorized write).
   */
  targetRepoGuid: string;
  zipBytes: Buffer;
  /**
   * Opt-in only — set only after the Dashboard has shown the user exactly
   * what would be skipped (Ref items, .wav/.bak files) and they confirmed
   * proceeding without them. When false/omitted, behavior is unchanged:
   * those cases remain hard validation failures for the whole archive.
   */
  skipUnsupported?: boolean;
}

export interface ImportCpFolderFromZipOutput {
  createdRootAddress: string;
  createdItemCount: number;
  skipped: CpImportSkippedEntryDetail[];
}

function parentAddressToLoca(repoGuid: string, address: string): string {
  if (address === repoGuid) return "";
  const prefix = `${repoGuid}/`;
  if (!address.startsWith(prefix)) {
    throw new CpImportError("PARENT_NOT_FOUND", `Address "${address}" does not belong to the current repo`);
  }
  return address.slice(prefix.length);
}

function resolveImportStagingDir(username: string, importGuid: string): string {
  try {
    const root = getContactPhotosRootDir();
    const safeUsername = assertSafeUsername(username);
    const userDir = assertSafeContactPhotoPath(root, safeUsername);
    const zipDir = assertSafeContactPhotoPath(userDir, "02_files_zip");
    const tempDir = assertSafeContactPhotoPath(zipDir, "temp");
    return assertSafeContactPhotoPath(tempDir, importGuid);
  } catch (err) {
    if (err instanceof ContactPhotoError && err.code === "NOT_CONFIGURED") {
      throw new CpImportError("NOT_CONFIGURED", "Import staging directory is not configured");
    }
    throw err;
  }
}

/**
 * Imports a Folder CP item (and its whole subtree) from an uploaded ZIP as
 * a new child of `input.parentAddress` — the currently-open Folder in the
 * Dashboard. All-or-nothing: either the whole tree is added, or nothing
 * is (see zip-import.md's atomicity section).
 *
 * The repo actually being written to is `input.targetRepoGuid` (the
 * caller's already-authorized target — may differ from the session's own
 * repo, e.g. `chad_shared`), never `getCurrentRepoGuid()`. `username`
 * (for staging paths) and the acting-user identity stamped onto history
 * still come from the current session (repo-context.js) — callers must
 * have already wrapped this call in `runWithRepoContext`.
 */
export async function importCpFolderFromZip(input: ImportCpFolderFromZipInput): Promise<ImportCpFolderFromZipOutput> {
  const repoGuid = input.targetRepoGuid;
  const username = getCurrentUsername();
  const actor = tryGetCurrentActor();

  try {
    assertChadWriteAllowed();
  } catch (err) {
    throw new CpImportError("WRITE_FORBIDDEN", err instanceof Error ? err.message : String(err));
  }
  assertRepoAllowlisted(repoGuid);

  // Hand cp-entry/cp-postgre the SAME effective Postgres connection dba's own
  // reads/writes use (Dev Panel Server vs offline-readonly-backup override) —
  // without this, cp-postgre's independent connection (CP_POSTGRE_URI ??
  // POSTGRES_URI, read directly from env) can silently target a different
  // database than the rest of the app. See postgre-connection.ts's doc
  // comment (found via a real local-Docker smoke test).
  await ensurePostgreConnectionUri(getEffectivePostgresUri());

  const parentLoca = parentAddressToLoca(repoGuid, input.parentAddress);
  let parentItem;
  try {
    parentItem = await entry.GetItem(repoGuid, parentLoca);
  } catch (err) {
    if (err instanceof ContentProviderError) {
      throw new CpImportError("PARENT_NOT_FOUND", `Parent not found at address "${input.parentAddress}"`);
    }
    throw err;
  }
  if (parentItem.Config.type !== "Folder") {
    throw new CpImportError("PARENT_NOT_FOLDER", `Parent at "${input.parentAddress}" is not a Folder (type: "${parentItem.Config.type}")`);
  }

  const parentNames = await resolveLogicalNamePath(input.parentAddress);
  try {
    assertNotSystemFolderWrite(parentNames, "create-child");
  } catch (err) {
    if (err instanceof SystemFolderReadOnlyError) {
      throw new CpImportError("SYSTEM_FOLDER_READ_ONLY", err.message);
    }
    throw err;
  }

  const importGuid = randomUUID();
  const stagingDir = resolveImportStagingDir(username, importGuid);

  const result = await importFolderFromZip({
    repoGuid,
    parentAddress: input.parentAddress,
    stagingDir,
    zipBytes: input.zipBytes,
    actor: actor ? { username: actor.username, repoGuid: actor.repoGuid } : null,
    skipPolicy: input.skipUnsupported ? SKIP_POLICY : undefined,
  });

  if (result.phase === "validation-failed") {
    throw new CpImportError("VALIDATION", "ZIP archive failed validation", result.errors);
  }
  if (result.phase === "commit-failed") {
    const knownCodes: CpImportErrorCode[] = [
      "PARENT_NOT_FOUND",
      "PARENT_NOT_FOLDER",
      "ROOT_NAME_CONFLICT",
      "BACKEND_NOT_SUPPORTED",
    ];
    const code = (knownCodes as string[]).includes(result.error.code) ? (result.error.code as CpImportErrorCode) : "COMMIT_FAILED";
    throw new CpImportError(code, result.error.message);
  }

  return { ...result.result, skipped: result.skipped };
}
