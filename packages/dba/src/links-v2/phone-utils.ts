/**
 * Phone normalization for Links V2 matching. Deliberately independent of
 * `lead-beeper-links.ts`'s identical-looking helpers — Links V2 has zero
 * code coupling to the old Links module (Story 90), see `types.ts`.
 */

/** Digits-only phone key. Returns null if too short to be a real match (avoids matching on short/garbled fragments). */
export function normalizePhoneDigits(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, "");
  if (digits.length < 9) return null;
  return digits;
}

/** Exact match, or same last 9 digits (covers missing/extra country code, e.g. "48600123456" vs "600123456"). */
export function phoneDigitsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const a9 = a.slice(-9);
  const b9 = b.slice(-9);
  return a9.length === 9 && a9 === b9;
}
