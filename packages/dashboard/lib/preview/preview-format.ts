/**
 * Shared Preview format selector — no format / hdr1 / hdr2 / md.
 *
 * hdr2 has no dedicated visual design yet (only hdr1 was speced against
 * examples/chad_hdr_preview_mockup_v7.html); selecting it falls back to the
 * pre-existing headers renderer (see headers-renderer.tsx's PreviewContent).
 */
export type PreviewFormat = "no-format" | "hdr1" | "hdr2" | "md";

export const PREVIEW_FORMAT_OPTIONS: { value: PreviewFormat; label: string }[] = [
  { value: "no-format", label: "no format" },
  { value: "hdr1", label: "hdr1" },
  { value: "hdr2", label: "hdr2" },
  { value: "md", label: "md" },
];

// A header line is `//` (optionally indented with tabs/spaces) followed by
// non-whitespace — matches the headers-format spec (human-docs/headers/headers-format.md).
const HDR_HEADER_LINE = /^[\t ]*\/\/\s*\S/m;

// Markdown signals kept deliberately narrow — each one is fairly distinctive
// of actual Markdown syntax on its own, so a single hit is enough. Bare list
// items (`- foo`) are NOT treated as a signal by themselves: they overlap
// with plain bullet notes and with the headers-format's own `-` note lines,
// so alone they'd be an aggressive guess (see 1.3: prefer no-format over a
// wrong parse).
const MD_HEADING_LINE = /^ {0,3}#{1,6}\s+\S/m;
const MD_FENCED_CODE = /^ {0,3}```/m;
const MD_LINK = /\[[^\]\n]+\]\((?:https?:\/\/|\/|mailto:)[^\s)]+\)/;

/**
 * Best-effort format auto-detection for initial mount. Never throws; falls
 * back to "no-format" whenever the content doesn't clearly match a known
 * shape, per 1.3 ("nie zgaduj agresywnie").
 */
export function detectPreviewFormat(content: string): PreviewFormat {
  if (!content || !content.trim()) {
    return "no-format";
  }
  if (HDR_HEADER_LINE.test(content)) {
    return "hdr1";
  }
  if (MD_FENCED_CODE.test(content) || MD_HEADING_LINE.test(content) || MD_LINK.test(content)) {
    return "md";
  }
  return "no-format";
}
