// Structural diff for CP `config` objects (plain JSON, mostly flat —
// CpItemConfig — but custom fields may nest). Deliberately dependency-free
// (no json-patch library): output is an RFC6902-flavored op list
// ({op, path, oldValue, newValue}) extended with both old/new values inline
// so the UI never has to replay the patch chain to show "before"/"after"
// for the fields that actually changed (Story 74 — avoids storing a
// redundant full-document snapshot per event while still keeping full
// before/after context for exactly what changed).

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepEqual(a, b) {
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

/**
 * Diffs two plain objects at `pathPrefix`, appending ops to `ops`.
 * `before`/`after` may be `undefined`/`null` (treated as `{}`) — used for
 * insert (before = {}) and delete (after = {}) events.
 */
function diffObjects(before, after, pathPrefix, ops) {
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
      ops.push({ op: "add", path, oldValue: undefined, newValue: afterValue });
    } else if (hasBefore && !hasAfter) {
      ops.push({ op: "remove", path, oldValue: beforeValue, newValue: undefined });
    } else if (!deepEqual(beforeValue, afterValue)) {
      if (isPlainObject(beforeValue) && isPlainObject(afterValue)) {
        // Recurse into nested objects so a small nested change doesn't
        // report the whole subtree as replaced.
        diffObjects(beforeValue, afterValue, path, ops);
      } else {
        ops.push({ op: "replace", path, oldValue: beforeValue, newValue: afterValue });
      }
    }
  }

  return ops;
}

/**
 * @param {object | null | undefined} beforeConfig
 * @param {object | null | undefined} afterConfig
 * @returns {Array<{op: string, path: string, oldValue: unknown, newValue: unknown}>}
 */
export function diffConfig(beforeConfig, afterConfig) {
  return diffObjects(beforeConfig, afterConfig, "", []);
}
