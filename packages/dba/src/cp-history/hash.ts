/**
 * Deterministic canonicalization + hashing of a cp_items document's
 * business value (Story 79 — replaces the Change-Stream-derived history
 * from Story 74/78 with a hash chain written atomically alongside every
 * mutation).
 *
 * Hashes only ever cover `{config, body}` — the plain `CpItem` shape, never
 * the raw Mongo document. `_historyVersion`/`_lastMutationId`/`_lastActor`/
 * `_lastRequestId` live as top-level sibling fields on the Mongo document
 * (never inside `config`), so as long as callers only ever pass the
 * `CpItem`'s own `config`/`body` in here (never the raw `ItemDoc`), those
 * bookkeeping fields can never leak into the hash and perturb it — see
 * `mutate.ts`, which is the only caller.
 */

import { createHash } from "node:crypto";

/** Recursively sorts object keys so semantically-identical JSON always canonicalizes to the same string, regardless of key insertion order. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

export function canonicalCpStateJson(config: unknown, body: string): string {
  return JSON.stringify({ config: canonicalize(config), body });
}

/** SHA-256 hex digest of the canonical `{config, body}` form. */
export function hashCpState(config: unknown, body: string): string {
  return createHash("sha256").update(canonicalCpStateJson(config, body)).digest("hex");
}
