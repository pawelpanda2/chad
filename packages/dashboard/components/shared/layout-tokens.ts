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
 *
 * Value measured from the FORMS MENU page (`DashboardPageShell` with no
 * `contentClassName` override, i.e. its own default `p-[10px]`), which the
 * project owner confirmed as the correct/reference spacing (Story 62 Round
 * 3). Pages that had overridden this down to `p-[3px]`/`gap-[3px]` were a
 * bug, not an intentional tighter variant — always use this token (or the
 * shell's own default) instead of a smaller ad-hoc value.
 */
export const FRAME_SECTION_GAP_CLASS = "gap-[10px]";

/**
 * Same 10px value as `FRAME_SECTION_GAP_CLASS`, for spacing stacked
 * elements inside a non-flex container (e.g. a `<form>`) via `space-y-*`
 * instead of `gap-*`. Keep these two in sync.
 */
export const FRAME_SECTION_SPACE_Y_CLASS = "space-y-[10px]";

/**
 * Internal padding for the top frame that holds a page's Save/Create
 * button (with or without a generated-name field). Deliberately tighter
 * than a regular content frame's own padding (`p-4`/`p-3`) — a Save
 * frame's content is short and close to the frame's edge on purpose
 * (Story 62 Round 4).
 */
export const SAVE_FRAME_PADDING_CLASS = "p-[8px]";

/**
 * Fixed width for an editable table's leading action column (pencil/save
 * icons, spinner, "Saved" label). Must stay constant across every state so
 * the column never changes width — apply to both the header cell and every
 * body cell.
 */
export const TABLE_ACTION_COLUMN_WIDTH_CLASS = "w-[72px]";

/**
 * Standard clickable-row style for a "list of items" page (a stack of
 * links/rows inside a single inner frame, as opposed to a table) — a
 * single-color card that highlights with a rounded grey background on
 * hover, no per-row border. Originated on the Views Reports/Leads lists,
 * confirmed by the project owner as the standard and applied to Beeper's
 * contact list (Story 62 Round 5). Always pair with
 * `LIST_ROW_WRAPPER_CLASS` on the containing inner frame and a `divide-y`
 * wrapper around the rows themselves.
 */
export const LIST_ROW_CLASS = "rounded-lg px-[10px] py-[10px] transition-colors hover:bg-accent";

/**
 * Inner frame wrapper for a `LIST_ROW_CLASS` list — same
 * `rounded-lg border bg-muted/10` frame used everywhere else in the
 * Story 62 standard, `p-2` so each row's own `px-[10px] py-[10px]`
 * still reads as evenly spaced from the frame's edge.
 */
export const LIST_ROW_WRAPPER_CLASS = "rounded-lg border bg-muted/10 p-2";
