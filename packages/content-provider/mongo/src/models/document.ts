/**
 * Mongo-specific document shape for one Content Provider item.
 * Shared CpItem / ContentProviderStorage live in cp-core (common/).
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
   * repoId prefix).
   */
  loca: string;
  /** Logical display name — same role as config.yaml's `name`. */
  name: string;
  type: CpItemType;
  /** Only present for type: "Text". */
  body?: string;
  /** e.g. "text/plain", "application/yaml". */
  bodyFormat?: string;
  /** Arbitrary extra fields — mirrors config.yaml's loose dict shape. */
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
