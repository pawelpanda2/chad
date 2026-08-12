/** Default hdr1 accent color — matches examples/chad_hdr_preview_mockup_v7.html. */
export const DEFAULT_HDR1_ACCENT = "#2563eb";

/**
 * Converts a `#rgb`/`#rrggbb` hex color to an `rgba(...)` string at the
 * given alpha. Used to derive hdr1's header/body background tints from a
 * single user-picked accent color (1.5 — one accent color, no independent
 * pickers for background/border). Falls back to the default accent if the
 * input isn't a valid hex color, so a stray/partial value from the color
 * input never breaks rendering.
 */
export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.trim().replace(/^#/, "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  if (full.length !== 6 || [r, g, b].some((n) => Number.isNaN(n))) {
    return hexToRgba(DEFAULT_HDR1_ACCENT, alpha);
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
