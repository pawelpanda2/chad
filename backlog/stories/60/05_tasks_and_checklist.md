# Story 60 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE      |             | Folder tab: every user (including `pawel_f`) can only ever see/access their own `chad_<username>` repo — no other CHAD users' or other apps' repos visible or reachable, even via a manually edited request |
| 2 | DONE      |             | Folder tab: repo picker is disabled (read-only), cannot be changed or used to select another repo |
| 3 | DONE      |             | Beeper tab: line 1 (header, above the frame) shows only the menu handle, Back, Forw and the page title; every other Beeper button/control moved into a second row inside the outer frame, on all 4 Beeper pages, desktop and mobile |
| 4 | DONE      |             | Page frames: Settings page no longer shows two nested boxes that look like duplicate "outer" frames; they now read as sections inside the one `DashboardPageShell` frame |

# Task 1 — Folder tab: strict per-user repo isolation

**Requested:** On TEST, the Folder tab showed all Content Provider repos —
other users' private repos and other apps' repos — because
`/api/folders/repos` and `/api/folders` had a hardcoded exception for the
`pawel_f` login that bypassed per-user isolation entirely (raw
`getAllRepos()` exposed to the browser, and any client-supplied `repoGuid`
honored). Fix so the only repo any user (including `pawel_f`) can ever
see or fetch is the one named exactly `chad_<username>`, enforced in
`packages/dba`, deny-by-default, with no full list or repo names ever
reaching an unauthorized client, no matter which endpoint is hit or how
the request is shaped.

**Done:**
- New `packages/dba/src/repo-access.ts`: `resolveOwnRepo(username)` fetches
  the real CP repo list (via the existing `getAllRepos()`, which is no
  longer re-exported for browsing purposes) and returns the **single**
  repo whose name is an exact string match for `chad_<username>` — no
  `includes`/`startsWith`/prefix matching, no fallback to "first repo" or
  "all repos", denies (throws `RepoAccessDeniedError`, a fixed error code
  with no repo names in the message) when: no username, zero matches, or
  more than one match (ambiguous). `assertOwnRepo(username, requestedId)`
  additionally denies if a client-supplied repo id doesn't match the
  resolved own repo.
- `packages/dashboard/app/api/folders/repos/route.ts`: removed the
  `pawel_f`-is-special branch entirely; now always calls
  `resolveOwnRepo(user.username)` and returns a single-item list, or a
  generic `403 REPO_ACCESS_DENIED` with no repo names on failure.
- `packages/dashboard/app/api/folders/route.ts`: removed the
  client-`repoGuid`-trusted-for-`pawel_f` branch; now always calls
  `assertOwnRepo(user.username, requestedRepoGuid)`; any mismatch → `403
  FORBIDDEN_REPO`, no repo names in the body.
- Canonical username source unchanged: the existing, already-validated
  `getCurrentUserFromCookies()` → `resolveCurrentUser()` (session cookie
  validated against `chad_admin`'s real user list) — no new/independent
  username source was introduced, per the instruction not to invent one.
**Files changed:** `packages/dba/src/repo-access.ts` (new),
`packages/dba/src/index.ts`, `packages/dashboard/app/api/folders/repos/route.ts`,
`packages/dashboard/app/api/folders/route.ts`.
**Tested:**
- dba-level unit tests (`packages/dba/src/repo-access.test.ts`, 13 cases,
  all passing) — see `06_others_from_report.md` for the full list mapped
  to the 10 required cases.
- Real manual test against a running dev server (`next dev`, real local
  Content Provider on `:12024`, no Docker rebuild): logged in as `pawel_f`
  via `/api/auth/login`, confirmed `GET /api/folders/repos` now returns
  exactly `{"repos":[{"id":"21d11bdc-...","name":"chad_pawel_f"}]}` (used
  to return every CP repo for this login); `GET /api/folders` with a
  fabricated `repoGuid` for `kamil_s`'s real repo → `403 {"error":
  "FORBIDDEN_REPO"}`; with a random nonexistent GUID → same `403`; with no
  session cookie at all → `401`. Own repo's real request still works and
  returns real data.
**Status: DONE**

# Task 2 — Folder tab: lock the repo picker in the UI

**Requested:** The repo combobox must be disabled/read-only, unable to be
typed into or changed, and must not restore a previously-selected other
user's repo on refresh — as defense-in-depth UX on top of Task 1's
server-side fix, not a replacement for it.
**Done:** `Select` in `folders/page.tsx` now renders with `disabled` and
no `onValueChange` handler (the now-dead repo-switching handler was
removed). Since `/api/folders/repos` (Task 1) only ever returns the
caller's own single repo, there is nothing else to select even in
principle. No `localStorage`/`sessionStorage` was used for the previous
selection (state was already always freshly fetched on mount), so a page
refresh cannot restore a stale/other repo.
**Files changed:** `packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx`.
**Tested:** Real browser test (Playwright, headless Chromium, real
session cookie against the same dev server as Task 1) against
`/dashboard/folders`: the repo trigger shows `chad_pawel_f` with
`disabled=true`; clicking it does not open the option list (verified via
DOM query — no `[role="listbox"]` appears after the click). Screenshot
taken and visually reviewed.
**Status: DONE**

# Task 3 — Beeper tab: header line 1 vs. in-frame second row

**Requested:** Only the menu handle, Back, Forw and a short page name may
appear in the top header row; all other Beeper-specific buttons/controls
move to a second row, inside the outer page frame (not merely a second row
above it), reusing existing toolbar spacing conventions. Verify desktop
and mobile.
**Done:** Across all 4 Beeper pages, `toolbar` now carries only the page
title; a new row (`flex flex-wrap items-center gap-x-3 gap-y-1 border-b
pb-3 mb-3`, matching the visual language already used by
`folders/page.tsx`'s own section) was added as the first child inside
`DashboardPageShell`'s frame:
- `beeper/page.tsx` (contacts list): category `Select`, search `Input`,
  `Inbox`/`Merge suggestions` buttons, contact count.
- `beeper/inbox/page.tsx`: subtitle text + conversation count.
- `beeper/merge/page.tsx`: subtitle text + pair count.
- `beeper/[id]/page.tsx` (contact detail): `Copy for AI`/`Add event`/
  `Merge`/`Save` buttons (the grid below adjusted from `h-full` to
  `flex-1` so it still fills the remaining height correctly now that the
  button row takes some of it).
**Files changed:** `packages/dashboard/app/(dashboard)/dashboard/beeper/page.tsx`,
`beeper/inbox/page.tsx`, `beeper/merge/page.tsx`, `beeper/[id]/page.tsx`.
**Tested:** Real browser test (Playwright, real session, dev server) —
screenshots taken at 1400×900 (desktop) and 390×844 (mobile, both with the
sidebar open by default per existing behavior, and collapsed via the
documented menu handle). Confirmed visually: header row only has the
chevron, "Beeper", Back, Forw; the second row (category/search/Inbox/
Merge/count) sits inside the frame, wraps correctly at mobile width, no
horizontal page overflow (`document.documentElement.scrollWidth ===
clientWidth`, checked programmatically).
**Status: DONE**

# Task 4 — Standardize page frames

**Requested:** Every `DashboardPageShell` page should have exactly one
outer frame, with any additional sections nested inside it, not styled as
competing "outer" frames; no elements outside the outer frame, no doubled
borders, no page-level scroll from wrong height math.
**Done:** Audited all 12 pages using `DashboardPageShell`
(`grep`-verified: every page's returned JSX has `DashboardPageShell` as
its immediate outermost element — no page renders content as a sibling
outside the frame). Grepped all of them for `rounded-xl`/`h-screen`/
`min-h-screen`/`100vh` (the shell's own outer-frame class and known
page-scroll anti-patterns). Found one real violation:
`settings/layout.tsx` rendered **two** `rounded-xl border bg-card` divs
inside the shell's actual outer frame — visually indistinguishable from a
second/third outer frame. Changed both to `rounded-lg border bg-muted/10`
(matching the section style already established in `folders/page.tsx`),
so they now read as sections inside the one outer frame. The one other
`rounded-xl border bg-card shadow-sm` match found (`forms/page.tsx`'s
Reports branch) is legitimate — that branch uses `EditorPageShell`, which
provides no frame of its own, so this is that page's own single frame,
not a duplicate of another. `padded={false}`/`scroll={false}` usages
elsewhere (`forms`, `users`, `statuses`, `views`, `beeper/[id]`) all match
the pre-existing documented exception for tables/own-scroll content, left
untouched.
**Files changed:** `packages/dashboard/app/(dashboard)/dashboard/settings/layout.tsx`.
**Tested:** Static audit via `grep` across all 12 `DashboardPageShell`
pages (not a full manual click-through of every page — see
`06_others_from_report.md` for what wasn't manually verified). `next
build` (full typecheck) passed after the change.
**Status: DONE**
