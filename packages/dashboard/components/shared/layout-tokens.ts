/**
 * Shared layout spacing/sizing tokens for the DashboardPageShell standard
 * (Story 62). Single source of truth so these values are never copy-pasted
 * as raw Tailwind arbitrary values per page.
 */

/**
 * Gap between the outer DashboardPageShell frame's edge and its inner
 * section frames, and between those inner section frames themselves.
 * Deliberately separate from each section's own internal content padding
 * (e.g. settings/layout.tsx's `p-4` per box), which this token does not
 * touch.
 */
export const FRAME_SECTION_GAP_CLASS = "gap-[3px]";

/**
 * Fixed width for an editable table's leading action column (pencil/save
 * icons, spinner, "Saved" label). Must stay constant across every state so
 * the column never changes width — apply to both the header cell and every
 * body cell.
 */
export const TABLE_ACTION_COLUMN_WIDTH_CLASS = "w-[72px]";
