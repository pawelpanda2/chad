/**
 * ZIP-import DTOs — backend-independent (Story 109, see
 * ai-docs/content-provider/zip-import.md for the full contract).
 *
 * `cp-files` produces a `CpImportValidationResult` from an uploaded ZIP;
 * `cp-postgre` consumes a validated `CpImportPlan` to commit it. Neither
 * type here does any fs/zip/SQL work — those live in the respective
 * provider packages.
 */

import type { CpItemType } from "./types.js";

/** One CP item in a not-yet-committed import tree. Only "Folder"/"Text" — "Ref" is never accepted. */
export interface CpImportNode {
  /** Zip-relative path this node was read from — for error messages only, never used for placement. */
  sourcePath: string;
  type: Extract<CpItemType, "Folder" | "Text">;
  name: string;
  /** Only meaningful for type "Text". Always "" for type "Folder" (Folders never carry body.txt). */
  body: string;
  /**
   * Extra config.yaml keys beyond id/type/name/address (which are always
   * recomputed at commit time, never trusted from the ZIP) and
   * refAddress/refGuid (rejected outright — no Ref support).
   */
  extraConfig: Record<string, unknown>;
  /** Only Folders may have children; always [] for type "Text". */
  children: CpImportNode[];
}

export interface CpImportPlan {
  root: CpImportNode;
  /** Total node count across the whole tree (root included) — same number validated against maxItemCount. */
  totalItemCount: number;
}

/** One structural or config validation failure — never a raw stack trace for the client. */
export interface CpImportValidationError {
  code: string;
  /** Zip-relative path the error is about (or "" for archive-wide errors like MULTIPLE_ROOT_ITEMS). */
  path: string;
  message: string;
}

/**
 * An entry deliberately left out of the plan (never a silent default —
 * only produced when the caller opted in via `CpImportSkipPolicy`, and
 * always reported back so the caller can show the user exactly what was
 * omitted). Distinct from `CpImportValidationError`: a skip doesn't fail
 * the import, an error does.
 */
export interface CpImportSkippedEntry {
  code: "REF_ITEM_SKIPPED" | "UNEXPECTED_FILE_SKIPPED";
  path: string;
  message: string;
}

/**
 * Opt-in relaxation for two specific, common real-world cases (found
 * against a real user-exported archive, Story 109 follow-up) — never the
 * default. Without this, `type: "Ref"` and any unexpected file are hard
 * validation failures for the WHOLE archive, same as before. A caller only
 * sets this after a user has been shown exactly what would be skipped and
 * explicitly confirmed proceeding without it — see zip-import.md.
 */
export interface CpImportSkipPolicy {
  /** Skip `type: "Ref"` items (and their whole subtree) instead of failing validation. */
  skipRefItems?: boolean;
  /** Skip unexpected files whose extension (case-insensitive, no dot) is in this list — e.g. `["wav","bak"]` — instead of failing validation. The item itself (config.yaml/body.txt) is still validated/imported normally. */
  skipUnexpectedFileExtensions?: string[];
}

export type CpImportValidationResult =
  | { ok: true; plan: CpImportPlan; skipped: CpImportSkippedEntry[] }
  | { ok: false; errors: CpImportValidationError[] };

/** All limits are hard failures — never silent truncation. See cp-files' zip-import.ts for the defaults in force. */
export interface ImportFolderLimits {
  maxZipBytes: number;
  maxEntries: number;
  maxTotalUncompressedBytes: number;
  maxEntryUncompressedBytes: number;
  /** Only enforced once an entry's uncompressed size exceeds this — avoids false positives on small compressible text. */
  maxCompressionRatioCheckThresholdBytes: number;
  maxCompressionRatio: number;
  maxTreeDepth: number;
  maxItemCount: number;
}

export interface CpImportCommitResult {
  createdRootAddress: string;
  createdItemCount: number;
}

/** A committed-phase failure — distinct from validation errors, since the tree already passed validation by this point. */
export interface CpImportCommitError {
  code: "PARENT_NOT_FOUND" | "PARENT_NOT_FOLDER" | "ROOT_NAME_CONFLICT" | "BACKEND_NOT_SUPPORTED" | "COMMIT_FAILED";
  message: string;
}
