# Story 77 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE      |             | Restyle `dashboard/history?view=google-sheets` to the rounded-card layout used in `leads/details`, with CHAD username + spreadsheet link as the header card, a "Google account" login/password card, and a separate "Service account" card |

# Task 1 — Restyle Google Sheets history view to rounded-card layout

**Requested:** `/dashboard/history?view=google-sheets` didn't look right —
should look like `/dashboard/leads/details` (rounded card frames), with:
1) a first card showing the CHAD username (e.g. `pawel_f`) instead of a
   lead name, plus a link to the Google Sheet, and
2) a card with the Google account login and password.

**Clarified with user (AskUserQuestion):** keep the service-account email
as its own third card (not dropped); remove the old standalone "CHAD
login" row since the username now lives in the header card.

**Done:** Rewrote `GoogleSheetsViewContent` in
`packages/dashboard/app/(dashboard)/dashboard/history/page.tsx`:
- Header `Card`: avatar icon + `chadUsername` as title, spreadsheet link
  (or fallback/error text) as the subtitle line — same markup shape as the
  Lead Header Card in `leads/details`.
- "Google account" `Card`: viewer account email + password, or the
  existing "not configured" fallback text.
- "Service account" `Card`: service account email + "Edit access, no
  interactive login." note, rendered only when `serviceAccountEmail` is
  present (unchanged condition from before).
- `DashboardPageShell` now uses `contentClassName="gap-1"` to match the
  reference page's card spacing.
- Removed the old separate "CHAD login" row (duplicate of the new header).

**Files changed:**
- `packages/dashboard/app/(dashboard)/dashboard/history/page.tsx`

**Tested:**
- `npx tsc --noEmit` on `packages/dashboard` — no errors.
- Rebuilt and restarted the local Docker stack
  (`bash bash-scripts/dashboard/03_local_mac_docker/06_deploy.sh`) — this
  container does not hot-reload from source.
- Logged in as `pawel_f` (Playwright), navigated to
  `/dashboard/history?view=google-sheets`, confirmed via accessibility
  snapshot: header shows "pawel_f" + the real spreadsheet link; "Google
  account" card shows the not-configured fallback (no local viewer account
  env vars set); "Service account" card shows the real service account
  email. No duplicate username row present.
- Did not get a pixel screenshot (Playwright screenshot tool timed out
  repeatedly in this environment) — verification relied on the
  accessibility-tree snapshot plus direct reuse of `leads/details`'s exact
  Card classes, not a new/guessed layout.

**Status: DONE**
