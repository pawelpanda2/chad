# Story 74 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE      |             | Local MongoDB runs as a healthy single-node replica set `rs0` (survives stack restart) |
| 2 | DONE      |             | History → Daily Tracker menu is reachable from the sidebar and shows real data |
| 3 | DONE      |             | A real Daily Tracker create (insert) is recorded in History with correct address/actor |
| 4 | DONE      |             | A real Daily Tracker edit (update) is recorded in History with a readable before/after diff |
| 5 | DONE      |             | A real Daily Tracker delete is recorded in History, including a correctly attributed actor |
| 6 | DONE      |             | History survives a history-worker restart with no gap and no duplicate entries |
| 7 | DONE      |             | Only one History UI/menu exists (duplicate `daily-tracker-history` route removed) |
| 8 | DONE      |             | History detail (expand row) shows actual before/after values, not just field names |
| 9 | DONE      |             | Daily Tracker and History are back to their exact pre-Story content (no leftover test rows) |
| 10 | DONE     |             | History menu redesigned: no "Change History" heading text, top-left Views-style button grid, new "Items" (all `cp_items`) as the first button before "Daily Tracker" |

# Task 1 — `rs0` replica set stability

**Requested:** verify the local Mongo replica set actually works (not just
that `--replSet` is present in Compose), including survival across a stack
restart.
**Done:** confirmed `rs.status().ok === 1`, `setName: "rs0"`,
`isWritablePrimary: true` both before and after a full `docker compose
down`/`up` cycle (data volume, and with it `local.system.replset`,
persists — no `-v`, no data loss). Auth is intentionally disabled on the
local Mongo (`mongod --replSet rs0 --oplogSize 1024`, no `--auth`) — this
predates this Story (found already in the uncommitted `docker-compose.local.yml`
diff) and does not affect QNAP, which keeps its own separate compose file
and keyfile-based auth.
**Files changed:** none (verification only).
**Tested:** `mongosh --eval "rs.status()"` / `db.hello()` directly against
the running `chad-mongodb-local-mac-docker` container, before and after
`bash-scripts/dashboard/03_local_mac_docker/03_re-start.sh`.
**Status: DONE**

# Task 2 — History → Daily Tracker menu

**Requested:** a working `History` tab in the sidebar with a Views-style
submenu, containing at least `Daily Tracker`.
**Done:** already implemented by a prior agent and functionally correct on
disk — the actual blocker was that the **running** dashboard container was
serving an image built before several of the relevant source edits (see
Task 7 and `03_knowledge.md`). Rebuilt and restarted the stack from the
current source; confirmed via a real browser session (Playwright) that
`History` appears in the sidebar under "Others", opens a menu with "Daily
Tracker", and clicking it navigates to `/dashboard/history?view=daily-tracker`.
**Files changed:** none beyond the dedup in Task 7 (this task was mostly a
runtime-freshness problem, not a code problem).
**Tested:** live browser session as `pawel_f`.
**Status: DONE**

# Task 3 — INSERT is recorded

**Requested:** creating a new Daily Tracker entry produces a history
record with the right operation type, address, and actor.
**Done:** created a real entry via `POST /api/forms/daily-entry` (the same
endpoint the "Add" form uses) through an authenticated browser session;
confirmed in `chad.cp_history` an `insert` document with
`address: "21d11bdc-.../07/01/09"`, `actor: {username: "pawel_f",
repoGuid: "21d11bdc-..."}`, and confirmed it appears in the Dashboard's
`History → Daily Tracker` list.
**Files changed:** none (this path already worked correctly).
**Tested:** live browser + direct Mongo inspection + Dashboard History UI.
**Status: DONE**

# Task 4 — UPDATE is recorded with a readable diff

**Requested:** editing an existing Daily Tracker entry produces a history
record with a readable before/after diff for `body`/`config`.
**Done:** edited a real entry via the Views → Daily Tracker inline editor
("Save row"); confirmed an `update` document in `cp_history` with a
per-line body diff and per-field config diff. Separately, found that the
History UI's expanded row only listed *which* config paths changed, not
their actual old/new values (`changes.body`/`changes.config` from the
existing detail endpoint were never fetched) — fixed by wiring the
existing `GET /api/content-provider/history/[id]` detail endpoint into
the expand action, rendering real before→after values and body hunks
(added/removed lines), matching `01_input.md`'s explicit requirement
("wartość przed, wartość po... UI nie może wyświetlać nieczytelnego
surowego JSON jako jedynej formy").
**Files changed:** `packages/dashboard/app/(dashboard)/dashboard/history/page.tsx`.
**Tested:** live browser — edited a real row, expanded the resulting
history entry, confirmed real before/after values render (not just field
names).
**Status: DONE**

# Task 5 — DELETE is recorded, including actor

**Requested:** deleting a Daily Tracker entry produces a history record
that retains the address/relevant fields of the deleted item (MongoDB has
no pre-image on delete for a plain change-stream event).
**Done:** deleted a real entry via `DELETE /api/forms/daily-entry?loca=...`
(the same endpoint a delete UI action would use — no delete button
currently exists in the Views UI itself, a pre-existing gap unrelated to
this Story, noted in `06_others_from_report.md`). Confirmed the resulting
`delete` document in `cp_history` retains the full last-known
address/body/config diff (from the worker's own cache, not a post-delete
re-read of the now-gone document). **Found and fixed a real bug along the
way:** the worker computed `actor` only from the change event's
`fullDocument`, which MongoDB never populates for a delete — every delete
event's `actor` was silently `null`, always, regardless of who deleted the
item. Fixed by caching the last-known actor per item (alongside the
existing config/body cache) and falling back to it when a delete event's
own `fullDocument` is absent. Verified against a real repeat of the
insert→delete cycle after rebuilding+recreating the worker container.
**Files changed:** `packages/history-worker/index.mjs`.
**Tested:** live browser/API + direct Mongo inspection, both before the
fix (`actor: null` confirmed) and after (`actor: {username: "pawel_f", ...}`
confirmed).
**Status: DONE**

# Task 6 — Resume-token survival across worker restart

**Requested:** a history-worker restart must not lose events and must not
create duplicates.
**Done:** stopped the worker container, made a real change through the
Dashboard API while it was down, started it again (after the Task 5
rebuild — required `docker compose up -d`, not `docker start`, to
actually pick up the new image; see `03_knowledge.md`). Confirmed in the
logs: `resuming from persisted resume token` → the missed event was
captured with no gap and no duplicate (`cp_history` had exactly the
expected 2 documents for that item, not 3).
**Files changed:** none (resume-token logic already worked correctly).
**Tested:** stop/change/start cycle against the real local stack, with
direct `cp_history` inspection before and after.
**Status: DONE**

# Task 7 — Remove the duplicate History UI

**Requested (from the continuation prompt):** check whether Copilot/Cline
left a second worker, a second history API, or an alternative history
collection, and consolidate onto the existing ones rather than creating
new duplicates.
**Done:** found `packages/dashboard/app/(dashboard)/dashboard/daily-tracker-history/page.tsx`
— a standalone route, functionally a near-duplicate of the canonical
`/dashboard/history?view=daily-tracker` page (same API, near-identical
markup), linked only from a "History" shortcut button in the Views →
Daily Tracker toolbar. This is exactly the pattern `01_input.md` §15
explicitly allows as a *shortcut* but says must never *replace* the real
History menu — here it fully duplicated it instead of linking to it.
Deleted the orphaned page and repointed the Views toolbar shortcut to the
canonical route. (The two history-related API routes,
`content-provider/history` — general, address-prefix-filterable — and
`content-provider/daily-history` — a Daily-Tracker-specific convenience
wrapper around the same `dba` function — are **not** a duplication; both
call into the same `cp-history.ts`, matching `01_input.md`'s own explicit
design for the general API + convenience endpoint. No second worker and
no second history collection were found — `packages/history-worker` and
`chad.cp_history`/`cp_history_state` are the only ones.)
**Files changed:** deleted
`packages/dashboard/app/(dashboard)/dashboard/daily-tracker-history/page.tsx`;
edited `packages/dashboard/app/(dashboard)/dashboard/views/page.tsx` (one
`Link href` change).
**Tested:** grepped the whole dashboard for any remaining reference to the
deleted route (none found besides stale `.next/types` build output,
regenerated on next build); confirmed the Views toolbar "History" button
now opens the canonical page in a live browser session.
**Status: DONE**

# Task 8 — History detail shows real values

Folded into Task 4's write-up above (same code change, same test).

# Task 9 — No leftover test data

**Requested:** the user's real Daily Tracker/History must not be left with
test rows after this Story.
**Done:** removed two fabricated `cp_history`/`cp_items` documents
(`test-history-item-001`/`-003`) left over from an earlier agent session
(fake `actor: {username: "test_user", repoGuid: "test-repo-guid"}`, an
address format — `actions/daily/26-07-20` — that doesn't match this repo's
real addressing scheme at all, so they were also silently unreachable by
any real user's filtered History view, just database noise). Removed
every `cp_history` document generated by this Story's own INSERT/UPDATE/
DELETE tests. Restored Daily Tracker item `21d11bdc-.../07/01/08` — the
user's own pre-existing "test" entry, which one of this Story's raw API
test calls had accidentally overwritten (a direct `PATCH` with only the
`STATE` field, bypassing the client-side merge-with-existing-fields logic
the real UI does) — to its exact original body content, byte for byte
(saved before any changes were made). Confirmed via browser: Views →
Daily Tracker shows exactly the same 8 rows, in the same order, with the
same content, as at the very start of this session; `History → Daily
Tracker` is empty (clean slate, ready for real use).
**Files changed:** none (data cleanup only, via the real
DELETE/PATCH APIs plus two `mongosh` cleanups scoped to the fabricated
`test-*` documents and this Story's own test `cp_history` records).
**Tested:** full-page browser snapshot comparison against the very first
snapshot taken in this session.
**Status: DONE**

# Task 10 — History menu redesign + "Items" (all `cp_items`) view

**Requested (mid-session follow-up from the user):** remove the "Change
History" heading and "Select what you want to view history for" subtitle
from the History menu; align the menu buttons top-left the same way
Views' own top-level menu does; add a new first button "Items" showing
history for **all** `cp_items` (not just Daily Tracker).
**Done:** rewrote `HistoryMenuPage` to the exact same 4-column top-left
button grid Views uses for its own top-level menu (`grid grid-cols-4
gap-2`, plain uppercase labels, no heading/icon/subtitle). Added "ITEMS"
as the first button, "DAILY TRACKER" second. "Items" routes to
`/dashboard/history?view=items`, which reuses the **existing** general
`GET /api/content-provider/history` endpoint with no `addressPrefix` —
already scoped to the caller's own repo (never cross-repo — same
isolation this endpoint always had), so "all cp_items" correctly means
"all of this user's own items", consistent with the rest of the app's
isolation model. Extracted the list/detail rendering (previously
`DailyTrackerHistoryContent`) into a shared `HistoryListContent`
component parameterized by `apiUrl`/`title`, used by both "Items" and
"Daily Tracker" — avoids duplicating the ~350-line list/expand/pagination
UI a second time for the new view (the exact kind of duplication Task 7
had just removed elsewhere in this Story).
**Files changed:** `packages/dashboard/app/(dashboard)/dashboard/history/page.tsx`.
**Tested:** live browser — confirmed the heading text is gone, the button
grid matches Views' own layout, "Items" opens `Items History` and
correctly lists a real change (made a real edit, confirmed it appeared
via `GET /api/content-provider/history`, then cleaned up/reverted the
test data and the resulting history record — see Task 9's cleanup, which
was re-applied once more after this task's own test edit).
**Status: DONE**
