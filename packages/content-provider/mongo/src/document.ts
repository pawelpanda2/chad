/**
 * One MongoDB document = one logical Content Provider item, per the plan
 * in documentation/content-provider (Stage 2 mongo provider). Deliberately
 * NOT a 1:1 copy of the filesystem structure (repoGuid/numeric/numeric/...
 * folders + separate config.yaml + body.txt files) — that shape exists to
 * satisfy a filesystem, not MongoDB. What's preserved is the ability to
 * resolve back to a Content Provider logical address (repoId + loca), so
 * cp-mongo can implement the same ContentProviderStorage contract cp-files
 * and cp-net-adapter do.
 *
 * This is a skeleton only — no CRUD implemented yet, no collection wired
 * into cp-entry. See README.md.
 */

import type { CpItemType } from "cp-core";

export interface CpMongoDocument {
  /** Repo GUID — same value cp-files/cp-net-adapter use as `repoGuid`. */
  repoId: string;
  /** This item's own stable id (matches config.yaml's `id` in the filesystem world). */
  itemId: string;
  /** Parent item's `itemId`, or null for a repo root. */
  parentId: string | null;
  /**
   * Physical/logical address within the repo, slash-joined — same format
   * as cp-files/cp-net-adapter's `loca` and `CpItem.Address` (minus the
   * repoId prefix). Not necessarily numeric-folder-shaped like the
   * filesystem backend requires — Mongo has no such physical constraint,
   * but keeping the same addressing convention is what lets cp-entry
   * route between backends transparently.
   */
  loca: string;
  /** Logical display name — same role as config.yaml's `name`. */
  name: string;
  type: CpItemType;
  /** Only present for type: "Text". */
  body?: string;
  /** e.g. "text/plain", "application/yaml" — declared, not inferred from a file extension (there is no file). */
  bodyFormat?: string;
  /** Arbitrary extra fields — mirrors config.yaml's "loose dict" shape (e.g. googleDocId, refAddress/refGuid for type: "Ref"). */
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
