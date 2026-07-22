# Story 77 — Plan

## Problem

`dashboard/history?view=google-sheets` used plain bordered list rows
(`LIST_ROW_CLASS`) instead of the rounded-card layout already established
elsewhere in the dashboard (`dashboard/leads/details`), and mixed the CHAD
username in with the rest of the content instead of using it as the page's
header identity.

## Reference pattern

`packages/dashboard/app/(dashboard)/dashboard/leads/details/page.tsx` — a
stack of `Card`/`CardContent` blocks (`className="gap-0 py-0"`,
`px-[14px] py-[10-12px]`), `DashboardPageShell contentClassName="gap-1"`
between them. First card = avatar-style header (icon + title + subtitle
link/line), following cards = one topic each.

## Decisions (confirmed with user via AskUserQuestion)

1. Card 1 (header): CHAD username (`data.chadUsername`) as the title,
   replacing `leadName`; the user's spreadsheet link takes the place of the
   `loca` subtitle line (clickable link with `ExternalLink` icon, or the
   existing error/fallback text when no spreadsheet is configured).
2. Card 2 ("Google account"): viewer account login (email + password) only
   — the credential a person actually logs in with. Kept as its own card
   rather than merged into the header.
3. Card 3 ("Service account"): kept as a separate third card (edit-access
   identity, no password) — user chose to keep this information rather than
   drop it.
4. The old standalone "CHAD login" row is removed — the username now lives
   only in the header (card 1), no duplication.
5. "Loading" / "not enabled" / error states unchanged in behavior, just kept
   outside the card stack as before.

## Files touched

- `packages/dashboard/app/(dashboard)/dashboard/history/page.tsx` —
  `GoogleSheetsViewContent` function only; no other view on this page
  (`items`, `daily-tracker`, `dates`) is affected.

## Verification

- `npx tsc --noEmit` on `packages/dashboard` — no new errors.
- Local Docker stack (`chad-dashboard-local-mac-docker`, port 12020) does
  **not** hot-reload from source — it runs a built image. Verifying any
  dashboard UI change there requires
  `bash bash-scripts/dashboard/03_local_mac_docker/06_deploy.sh` (build +
  restart + status) first.
- Logged in as `pawel_f` via Playwright, navigated to
  `/dashboard/history?view=google-sheets`, confirmed via accessibility
  snapshot: header card shows "pawel_f" + spreadsheet link; "Google
  account" card shows the not-configured fallback text (no viewer account
  set locally); "Service account" card shows the service account email.
