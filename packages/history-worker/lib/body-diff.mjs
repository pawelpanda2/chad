// Text diff for CP `body` (a raw string — Markdown/YAML/plain text/JSON-as-
// text, never a JSON object; see ai-docs/26-07-11_content-provider-mongodb-
// final-item-model.md). A structural JSON patch doesn't apply to a string,
// so `body` gets a line-based diff instead (`diff` — already a dependency
// elsewhere in this monorepo, packages/dropbox-sync).
import { diffLines } from "diff";

/**
 * @param {string} beforeBody
 * @param {string} afterBody
 * @returns {Array<{added?: boolean, removed?: boolean, value: string}> | null}
 *   `null` when there is no textual difference (avoids storing a no-op diff).
 */
export function diffBody(beforeBody, afterBody) {
  const before = beforeBody ?? "";
  const after = afterBody ?? "";
  if (before === after) return null;

  // jsdiff's own hunk shape ({added, removed, value}) is already a good,
  // directly renderable "before/after" representation — stored as-is
  // rather than reinvented.
  return diffLines(before, after).map((part) => ({
    added: part.added ?? false,
    removed: part.removed ?? false,
    value: part.value,
  }));
}
