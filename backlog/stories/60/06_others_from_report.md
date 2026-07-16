# Story 60 — Others from report

## Security tests mapped to the 10 required cases

`packages/dba/src/repo-access.test.ts` (13 assertions, all passing,
run via `node dist/repo-access.test.js` after `pnpm --filter dba build`,
same hand-rolled convention as the existing `headers-parser.test.ts` —
this repo has no test runner configured, per its `package.json`):

1. `pawel_f` receives only `chad_pawel_f` — ✅ ("pawel_f receives only
   chad_pawel_f").
2. Other CHAD repos not returned — ✅ ("other CHAD users' repos are not
   returned").
3. Other apps' repos not returned — ✅ ("other apps' repos are not
   returned").
4. Manual repo id/name override denied — ✅ ("manually requesting another
   repo id is denied") + real curl test against `kamil_s`'s real repo GUID
   (see `05_tasks_and_checklist.md` Task 1).
5. No fallback on no match — ✅ ("no matching repo denies access, no
   fallback") + ambiguous/duplicate-name case ("ambiguous (duplicate)
   match denies access, no first-match fallback").
6. No username → no list — ✅ ("missing username denies access (no list
   returned)", covers `undefined`/`null`/`''`).
7. No repo names in error payload — ✅ ("denial error payload contains no
   repo names") + real curl test confirming the live route's JSON body is
   `{"error":"FORBIDDEN_REPO"}` only.
8. Refresh doesn't restore a disallowed selection — verified by
   inspection: `folders/page.tsx` never persisted the selected repo to
   `localStorage`/`sessionStorage`; state was always re-fetched fresh on
   mount, and the backend can now never return anything but the caller's
   own repo, so there is nothing disallowed to restore.
9. Combobox non-editable — ✅ real browser test (Playwright): `disabled`
   attribute present, click does not open the listbox.
10. Direct request bypassing the UI still blocked — ✅ real curl tests
    (no browser/UI involved) against both `/api/folders/repos` and
    `/api/folders?repoGuid=...`.

Two extra tests beyond the required 10, added because the strict-equality
requirement explicitly called out `startsWith`/`includes` as forbidden:
"prefix match (`chad_pawel_f_extra`) is not treated as a match" and
"substring match (`something_chad_pawel_f`) is not treated as a match".

## Architectural decision: pure matching logic extracted for testability

`resolveOwnRepo()`/`assertOwnRepo()` do real network I/O (they call the
Content Provider). To unit-test the actual isolation *rule* without a
live CP, the matching logic was extracted into pure, exported functions
(`pickOwnRepo`, `checkRequestedRepo`, `extractRepoInfos`) that the async
wrappers delegate to. This is the smallest change that made the rule
itself independently testable; it does not change the public behavior of
`resolveOwnRepo`/`assertOwnRepo`.

## Finding, not fixed: `/dashboard/content-provider` is a dead page

While reading `next lint` output, noticed
`app/(dashboard)/dashboard/content-provider/page.tsx` — a **different**,
older "Content Provider" admin page (lists all repos + documents, no
per-user filtering at all in its UI code) with a sidebar entry, distinct
from the "Folder(s)" tab this Story fixed. Checked its backing routes:
`app/api/content-provider/{repos,nodes,index}/route.ts.bak` — all three
are `.ts.bak`, not live `.ts` files, so Next.js does not compile them and
every fetch this page makes 404s at runtime. **Not a live vulnerability**
today, but worth flagging: if anyone ever renames those `.bak` files back
to `.ts` without also applying this Story's isolation model, the same
critical leak would reappear on a different route. Not fixed here —
out of this Story's named scope ("zakładka Folder" specifically), and
its backing code (`@/content-provider/typescript`,
`packages/net-content-provider`) is mid-rewrite per existing project
memory (`project_net_content_provider_rewrite`), so intentionally not
touched. Recommend a future Story either wires it through the same
`packages/dba` isolation this Story added, or removes the dead page/sidebar
entry if it's not planned to come back.

## Known limitation: page-frame audit was static, not click-through

Task 4's audit of all 12 `DashboardPageShell` pages was a `grep`-based
static check (outermost-JSX-element check + class-name search for
duplicate frame styling / page-scroll anti-patterns), not a manual
click-through of every one of the 12 pages in a browser. The one page
actually changed (`settings/layout.tsx`) and the two Beeper-adjacent areas
(Folder tab, Beeper tabs) were manually verified in a real browser
(Playwright + a real logged-in session against a real Content Provider).
The other 9 pages (`forms`, `leads/details`, `statuses`, `todo-msg`,
`users`, `views`) were not independently re-verified visually in this
Story beyond the static audit and the full `next build` typecheck passing
— flagging this so it isn't mistaken for a full manual regression pass.

## Known pre-existing behavior, not a regression

The sidebar defaults to **open** on mobile viewports too (documented,
intentional behavior per `responsive-layout-standard.md`, predating this
Story) — so a first screenshot of Beeper at 390px width showed the sidebar
still covering most of the screen until the documented collapse handle is
tapped. Confirmed this is unrelated to Task 2/3's changes: after
collapsing the sidebar (the same handle every other page uses), Beeper's
new in-frame second row wraps correctly with no horizontal page overflow.
