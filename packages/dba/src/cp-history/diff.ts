/**
 * Structural diff for CP `config` (JSON-patch-flavored, dependency-free) and
 * line diff for `body` (plain text/YAML/Markdown, via the `diff` package).
 *
 * Ported from the Story 74/78 `packages/history-worker/lib/{config-diff,
 * body-diff}.mjs` change-stream mapper into this package for Story 79's
 * transactional rewrite — same logic, now called synchronously inside
 * `executeCpMutationWithHistory`'s transaction instead of from an async
 * change-stream consumer. Kept dependency-free for config (no json-patch
 * library) for the same reason as the original: the UI needs both old/new
 * values inline without replaying a patch chain, and a full document
 * snapshot per event would be redundant given `afterSnapshot`'s periodic
 * cadence already covers full-state recovery (see `mutate.ts`).
 */

import { diffLines } from "diff";

export interface CpHistoryConfigOp {
  op: "add" | "remove" | "replace";
  path: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export interface CpHistoryBodyHunk {
  added: boolean;
  removed: boolean;
  value: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

function diffObjects(
  before: unknown,
  after: unknown,
  pathPrefix: string,
  ops: CpHistoryConfigOp[]
): CpHistoryConfigOp[] {
  const beforeObj = isPlainObject(before) ? before : {};
  const afterObj = isPlainObject(after) ? after : {};
  const keys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);

  for (const key of keys) {
    const path = `${pathPrefix}/${key}`;
    const hasBefore = Object.prototype.hasOwnProperty.call(beforeObj, key);
    const hasAfter = Object.prototype.hasOwnProperty.call(afterObj, key);
    const beforeValue = beforeObj[key];
    const afterValue = afterObj[key];

    if (!hasBefore && hasAfter) {
      ops.push({ op: "add", path, newValue: afterValue });
    } else if (hasBefore && !hasAfter) {
      ops.push({ op: "remove", path, oldValue: beforeValue });
    } else if (!deepEqual(beforeValue, afterValue)) {
      if (isPlainObject(beforeValue) && isPlainObject(afterValue)) {
        diffObjects(beforeValue, afterValue, path, ops);
      } else {
        ops.push({ op: "replace", path, oldValue: beforeValue, newValue: afterValue });
      }
    }
  }

  return ops;
}

/**
 * @param beforeConfig `null`/`undefined` for an insert (diffs against `{}`).
 * @param afterConfig `null`/`undefined` for a delete (diffs against `{}`).
 */
export function diffConfig(beforeConfig: unknown, afterConfig: unknown): CpHistoryConfigOp[] {
  return diffObjects(beforeConfig, afterConfig, "", []);
}

/**
 * @returns `null` when there is no textual difference (avoids storing a
 *   no-op diff — matters for an insert-with-empty-body or a no-body-change
 *   config-only update).
 */
export function diffBody(beforeBody: string | null | undefined, afterBody: string | null | undefined): CpHistoryBodyHunk[] | null {
  const before = beforeBody ?? "";
  const after = afterBody ?? "";
  if (before === after) return null;

  return diffLines(before, after).map((part) => ({
    added: part.added ?? false,
    removed: part.removed ?? false,
    value: part.value,
  }));
}
