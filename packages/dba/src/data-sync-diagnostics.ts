/**
 * Shadow-read mismatch diagnostics (Story 72 §16/§17).
 *
 * Never changes what a user sees (the router always returns the primary's
 * result) and never logs full item bodies (§16/§17 — only a redacted
 * preview, long enough to spot an obvious diff without leaking content).
 */

import { getMongoDb } from "./mongo.js";
import type { CpItem } from "./cp-model.js";

export const SYNC_DIAGNOSTICS_COLLECTION = "data_sync_diagnostics";

export type MismatchCategory =
  | "missing-in-primary"
  | "missing-in-follower"
  | "id-mismatch"
  | "address-mismatch"
  | "config-mismatch"
  | "body-mismatch"
  | "type-mismatch"
  | "name-mismatch";

export interface SyncDiagnosticEntry {
  operation: string;
  timestamp: string;
  mismatchCategories: MismatchCategory[];
  primaryItemId: string | null;
  followerItemId: string | null;
  address: string | null;
  /** Truncated preview only — never the full body (§16). */
  detail: string;
}

const BODY_PREVIEW_LENGTH = 80;

function preview(value: string): string {
  return value.length > BODY_PREVIEW_LENGTH ? `${value.slice(0, BODY_PREVIEW_LENGTH)}…` : value;
}

/**
 * Compares a primary read result against the same lookup on the follower
 * and records any mismatch. Returns the categories found (empty = match)
 * — pure/no I/O beyond the final write, so the comparison logic itself is
 * unit-testable without touching Mongo.
 */
export function compareItems(primary: CpItem | null, follower: CpItem | null): MismatchCategory[] {
  const categories: MismatchCategory[] = [];

  if (primary && !follower) {
    categories.push("missing-in-follower");
    return categories;
  }
  if (!primary && follower) {
    categories.push("missing-in-primary");
    return categories;
  }
  if (!primary && !follower) {
    return categories;
  }

  const p = primary!;
  const f = follower!;

  if (p._id !== f._id) categories.push("id-mismatch");
  if (p.config.address !== f.config.address) categories.push("address-mismatch");
  if (p.config.type !== f.config.type) categories.push("type-mismatch");
  if (p.config.name !== f.config.name) categories.push("name-mismatch");
  if (p.body !== f.body) categories.push("body-mismatch");
  if (JSON.stringify(sortedEntries(p.config)) !== JSON.stringify(sortedEntries(f.config))) {
    categories.push("config-mismatch");
  }

  return categories;
}

function sortedEntries(config: Record<string, unknown>): [string, unknown][] {
  return Object.entries(config).sort(([a], [b]) => a.localeCompare(b));
}

export async function recordShadowReadMismatch(
  operation: string,
  primary: CpItem | null,
  follower: CpItem | null
): Promise<void> {
  const categories = compareItems(primary, follower);
  if (categories.length === 0) return;

  const db = await getMongoDb();
  const entry: SyncDiagnosticEntry = {
    operation,
    timestamp: new Date().toISOString(),
    mismatchCategories: categories,
    primaryItemId: primary?._id ?? null,
    followerItemId: follower?._id ?? null,
    address: primary?.config.address ?? follower?.config.address ?? null,
    detail: `primary.body=${preview(primary?.body ?? "")} follower.body=${preview(follower?.body ?? "")}`,
  };

  await db.collection<SyncDiagnosticEntry>(SYNC_DIAGNOSTICS_COLLECTION).insertOne(entry);
}
