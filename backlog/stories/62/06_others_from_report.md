# Story 62 — Others from report

## Documentation/organizational work done during this Story (not a Checklist item, per the Story standard)

Corrected the stale `documentation/stories/<N>/` path (the location
described by the project's own standard docs before this Story) to the
actual current location, `backlog/stories/<N>/` (repo root — the user had
already moved the folder there; the standard docs just hadn't caught up).
Edited six forward-looking documentation files, each a simple path swap
plus a short explanatory note in the two most load-bearing ones:

- `documentation/ai-docs/begin_here/01_ai_start.md`
- `documentation/ai-docs/begin_here/02_what-and-where.md` (added a dated
  note under the "Stories" section explaining the move)
- `documentation/ai-docs/begin_here/03_story-standard.md` (added a dated
  note at the top, and fixed the directory-tree example block)
- `documentation/dashboard/forms/features/reports-form.md`
- `documentation/dashboard/common/features/voice-recording.md`
- `documentation/ai-docs/deploy/dashboard-deployment-scripts.md`

**Second rename, mid-Story:** the user renamed
`documentation/ai-docs/knowledge/` to `documentation/ai-docs/begin_here/`
(same four files, same numbering, only the containing folder's name
changed). Re-applied the same fix to all six files above plus this Story's
own `03_knowledge.md`, and added a short dated note to
`02_what-and-where.md` and `03_story-standard.md` recording the rename, the
same way the `backlog/stories/` move was recorded.

**Deliberately not touched:** the file contents inside `backlog/stories/53/`
through `backlog/stories/56/` themselves still say `documentation/stories/
...` in a few citations (e.g. `reports-form.md` pointing at
`backlog/stories/56/01_input.md` — that citation was fixed, but Story 56's
*own* `01_input.md`/`02_plan.md` text, if it references its own old path
internally, was left as-is). Those are each Story's own historical record
of what was true when it was written — the Story standard explicitly says
not to rewrite another Story's history. Confirmed via `grep` after the
edits that no forward-looking doc still points at the old path (only the
two explanatory notes themselves, which intentionally mention the old path
for context, remain).

## Architectural/scope decisions recorded here (see `02_plan.md` for the full list with reasoning)

The seven numbered "Decisions" in `02_plan.md` (new `title` shell prop,
`FRAME_SECTION_GAP_CLASS` token, 150px pane, username source/fallback,
sidebar casing left alone, FOLDER/Folders naming flagged not resolved,
Statuses deviations called out on purpose) are the substantive open
questions from this Story. Repeating only the two that most need an
explicit yes/no before implementation starts:

1. Username: `displayName || username`, or always `username`?
2. Sidebar menu labels: leave title-case as today, or uppercase them to
   match the new page-title convention?

## Known limitations / explicitly out of scope

- `settings/page.tsx` (the "Profile" tab) is stock template content with
  fake data and a no-op submit handler — this Story's frame/title/gap fix
  does not make Settings "real", only correctly laid out. Recorded so it
  isn't mistaken for done-done later.
- `DAILY TRACKER`'s edit/save feature will very likely need a new backend
  route (`app/api/forms/daily-entry/route.ts` today only handles create,
  no edit endpoint was found) — not designed in this planning Story,
  flagged for implementation time.
- The mobile-viewport table-scroll bug is only actually documented in
  `backlog/stories/01_todo/note.md`, a pre-Story freeform note, not in any
  `documentation/dashboard/**/bugs/*.md` file. This Story's planned Task 9
  fixes it for the new Daily Tracker table only; Users and Statuses (where
  the bug is named as currently existing) are not touched by this Story —
  they're listed in the migration plan for a later pass.
- `documentation/dashboard/views/views-tracker.md` exists but is empty (0
  bytes) — flagged for the documentation task at implementation time
  (populate it or point it at the new shared standard doc).

## New global architecture doc: endpoint rules (Input 5)

Before implementing `updateDailyEntry`, wrote
`documentation/ai-docs/begin_here/05_endpoint-rules.md` per the user's
explicit request: when it's fine to add a missing endpoint/`dba` method,
where Content Provider logic must live, the ban on pretend-Save/stubs,
compatibility rules for changing an existing endpoint, naming convention,
post-implementation verification. Indexed in `02_what-and-where.md` in a
new section placed before "Deploy" (as instructed — it's a
pre-implementation rule, not a deployment one) and added to
`01_ai_start.md`'s reading order, ahead of `04_deployment-rules.md` despite
its higher file number (numbering reflects creation order, not the
requested reading order — called out explicitly in both docs so this
isn't confusing later). Also added the previously-unindexed
`documentation/dashboard/forms/features/daily-tracker-dates.md` to
`02_what-and-where.md`'s Dashboard section per Input 7 point 10.

## Plan revisions after user feedback (Input 2, 3, 4 — see `01_input.md`)

The original plan (this file's earlier content, still below) was revised
before implementation started, per the user's approval-with-corrections:

- Narrowed strictly to `SETTINGS` + `DAILY TRACKER`; dropped
  `auth-page-shell.tsx`/login entirely from this pass (kept only in the
  migration-plan appendix).
- Split "gap between frames" (~3px, now a shared token) from "padding
  inside each frame's content" (untouched) — these had been conflated in
  the first draft.
- Confirmed the `md:` (768px) breakpoint for the 150px pane against the
  codebase's existing `DESKTOP_QUERY` convention, rather than assuming it.
- Finalized the row action-column design as `[💾][✎]` (Save + "Edit Item"
  pencil, pencil always visible even read-only) after two rounds of
  correction — first from a vague "open row on click" idea, then
  explicitly rejecting a plain-letter button in favor of the two-icon
  design with tooltip/`aria-label`.
- Investigated the daily-entry save data path **before** designing the
  Save/Delete UI (per explicit instruction not to build a pretend Save).
  Found: no edit endpoint exists yet for daily entries, but the
  `GetItem`-then-`Put` pattern it would need already works for Reports and
  Statuses — described as a minimal, low-risk `dba` addition
  (`updateDailyEntry`), **not implemented without separate confirmation**.
  Delete is a harder, separate blocker: Content Provider's delete is an
  empty stub project-wide, so no Delete button is being built this pass
  regardless of confirmation on the save piece — full detail in
  `03_knowledge.md` §10 and `02_plan.md`'s "Backend gap" section.

## Real bug found and fixed during implementation (not part of the original plan)

`GET /api/auth/session` always returned `{ user: null }` for every real
login — it queried the Prisma `User` table using the session cookie's
first segment as a Prisma id, but the real cookie (set by
`/api/auth/login`) is `${repoGuid}:${timestamp}`, resolved everywhere else
via `getCurrentUserFromCookies()` against the real `chad_admin` CP user
list. Discovered while building the username-in-sidebar feature (Task 3)
— confirmed live (logged in as `pawel_f`, the endpoint still returned
`null`). Fixed to use the real mechanism; verified nothing else depended
on the broken behavior (`middleware.ts` only referenced the route by path
string). Full detail in `05_tasks_and_checklist.md` Task 3.

## Verification performed (real, not just static analysis)

- `pnpm --filter dba build`, `pnpm --filter dashboard exec tsc --noEmit`,
  `next build`, and `eslint` on every touched file — all clean.
- Deployed to local-mac-docker via the project's own
  `bash-scripts/dashboard/03_local_mac_docker/07_deploy.sh` (build +
  re-start + status) — not TEST/PROD, per instruction.
- Real HTTP save round trip against the running stack: `PATCH
  /api/forms/daily-entry` with deliberately-bogus AUTO-field values
  included, confirmed the server rejects/strips them, the real field
  value persists, entry count stays the same, and unrelated rows are
  untouched — then reverted the test value.
- Real Playwright browser checks against the running stack on both a
  1440×900 desktop viewport and an iPhone 12 (390px) mobile viewport:
  screenshots of Settings and Daily Tracker in both, a measured 150.0px
  desktop right pane, a measured 2px (i.e. absent) mobile right pane, the
  Edit-mode floppy/pencil action column, the single-entry detail dialog
  with a disabled Delete button, and a scroll-clamp test on the mobile
  Tracker table confirming no overscroll past real data range.
- **Not separately load-tested:** multiple simultaneously-dirty rows
  through the bulk Save button against the live stack (Task 8) — the
  single-row path it wraps is confirmed working, so this is a reasonable,
  non-blocking follow-up rather than an unresolved risk.
- **Not tested:** a real touch-drag gesture (as opposed to programmatic
  `scrollLeft` clamping) on a physical or emulated touchscreen — see
  Task 10's write-up for why the clamping check performed is considered
  sufficient evidence for `overscroll-contain`'s documented guarantee.

## Follow-up proposals (not scheduled)

- Once Settings + Daily Tracker ship and are approved, open the remaining
  page migrations as their own Story/Stories rather than folding them into
  this one — full inventory with per-page state is already recorded in
  `03_knowledge.md` §9 so that work doesn't need to re-derive current
  state from scratch.
- The other `(auth)` route-group pages (`register`, `forgot-password`,
  `setup-2fa`, `verify-email`) are natural candidates for the new
  `auth-page-shell.tsx` once it exists from the login migration — not
  opened here.
