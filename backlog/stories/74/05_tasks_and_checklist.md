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
| 11 | DONE     |             | QNAP's real, shared MongoDB 4.4.30 runs `rs0` stably as a single-node replica set, verified with real backups/measurements, not just `rs.initiate()` returning `ok:1` |
| 12 | DONE     |             | Change Streams + `resumeAfter` work against the real QNAP MongoDB 4.4, with the exact production driver version |
| 13 | DONE     |             | `history-worker` runs on QNAP, watches `chad.cp_items`, records real Daily Tracker INSERT/UPDATE/DELETE with correct actor, survives a light write burst with zero duplicates/errors |
| 14 | DONE     |             | Dashboard TEST on QNAP is rebuilt from current code (History feature + actor attribution), reachable over Tailscale, isolation between `pawel_f`/`kamil_s` confirmed |
| 15 | DONE     |             | QNAP host stays stable (no crash loop, no OOM, load/RAM/swap near baseline) through rs0 + Change Streams + light write load |

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

---

# QNAP verification session (continuation, 2026-07-21)

Everything above was verified locally. This session's job was the
question the user asked directly: **does the real QNAP host (Celeron
N5095, no AVX, MongoDB 4.4.30, shared by TEST and PROD) actually hold up
running `rs0` + Change Streams + `history-worker` + Dashboard TEST** —
local success is not proof QNAP can do the same. Full method, every
metric, and the root-cause investigations below; see
`06_others_from_report.md` for architectural notes and known limitations.

# Task 11 — QNAP `rs0` stability (not just `rs.initiate()` succeeding)

**Requested:** don't accept `ok:1` from initiation as proof — verify with
real backups, real counts, real measurements.
**Found:** `rs0` was already live on QNAP (enabled in an earlier session,
`docker-compose.qnap.shared.yml`'s `mongodb`/`mongo-keyfile-init`/
`mongo-rs-init` services), running since 2026-07-20T09:06, `RestartCount:
0`. Confirmed via SSH: `rs.status()` → `ok:1, setName:"rs0",
stateStr:"PRIMARY"`; `db.version()` → `4.4.30`; all 7 expected databases
present (`chad`, `beeper`, 2× `beeper_<repoGuid>`, `admin`/`config`/
`local`); `chad.cp_items` count 763.
**Done:** ran `bash-scripts/mongo/backup.sh` for real on QNAP
(`MONGO_CONTAINER_NAME=chad-mongodb`) — `mongodump` succeeded, 5.3MB,
timestamped `2026-07-21_18-35-34`, on the real persistent volume
(`/share/CACHEDEV1_DATA/ContainerData/chad-shared/mongodb/backups/`, a
sibling of `.../db/`, never the 16MB `/share` tmpfs — see
[[qnap_container_data_on_tmpfs_bug]]), containing all 5 expected
databases. Oplog: 1024MB configured, ~31–34hr window (grew during the
session), only 1.2MB actually used — comfortable headroom.
**Files changed:** none (verification only).
**Tested:** direct SSH + `mongosh`/`mongo` shell inspection against the
real QNAP `chad-mongodb` container, before and after every subsequent
step in this session.
**Status: DONE**

# Task 12 — Change Streams + `resumeAfter` on real MongoDB 4.4

**Requested:** test on `chad.__replica_set_probe`, not real `cp_items`;
measure latency; confirm `resumeAfter` actually resumes.
**Found a real, reproducible dead end first:** a Node.js probe script
using the exact production `mongodb` driver version (`7.1.1`) against
QNAP's real `chad-mongodb` consistently got zero change-stream events,
even though the insert was visibly written to the oplog
(`db.oplog.rs.find(...)` showed it) and the replica set's majority commit
point was advancing normally (`rs.status().optimes.lastCommittedOpTime`
tracked `appliedOpTime` with no lag). Wire-level command monitoring
(`monitorCommands: true`) showed the actual cause: `collection.watch()`
is lazy — it doesn't send the `aggregate` command that opens the
server-side change stream until the cursor is first consumed
(`hasNext()`/`next()`/iteration). The probe's first version inserted
*before* ever consuming the stream, so the change stream only started
watching "now" — after the insert already happened — and correctly never
saw it. Not a MongoDB 4.4 bug, not a driver bug, not a `chad-shared`
Docker network problem (confirmed separately: the legacy `mongo` shell,
run in a *separate* container on the same network, received change events
fine even during the investigation). Fixed the probe by priming the
stream with a fire-and-forget `hasNext()` call before inserting, then
awaiting that *same* promise afterward (a second concurrent `next()` call
on the same cursor raises `MongoServerError: CursorInUse` — also
confirmed the hard way). **The real `history-worker` was never at risk
from this** — it opens its stream once at startup and consumes it
continuously in one loop, so by the time any real write happens the
stream has long since actually been open.
**Done, once fixed:** full probe passed — insert 86ms, update 165ms,
delete 116ms, `resumeAfter` correctly resumed from a token captured
before the stream closed. Probe collection cleaned up (0 leftover
`__replica_set_probe*` collections).
**Files changed:** none in the repo (scratch probe scripts only, not
committed).
**Tested:** live, repeated runs against QNAP's real `chad-mongodb`,
container-to-container over the real `chad-shared` Docker network — the
same network path `history-worker` itself uses.
**Status: DONE**

# Task 13 — `history-worker` on QNAP

**Requested:** deploy, verify health/resume/no-dup with a real controlled
change, without disrupting the already-stable shared Mongo.
**Done:** built `packages/history-worker/Dockerfile`'s `runner` stage
directly on QNAP (`docker compose -p chad-shared ... build history-worker`)
and started *only* that one new service
(`... up -d history-worker`) — confirmed `chad-mongodb` was never
recreated (`RestartCount: 0` throughout, `Up 33 hours` unchanged) despite
`00_qnap_shared/03_re-start.sh`'s own idempotency logic being written for
a full-stack redeploy, not "add one new service" (see
`06_others_from_report.md`/[[qnap_ssh_access_works]] for why the targeted
`up -d <service>` was used instead of that script). Worker started clean
(`no persisted resume token — starting from now`, `watch opened`).
Verified with a real Daily Tracker INSERT → UPDATE → DELETE through the
actual Dashboard API (not raw Mongo writes), then an 8× insert+delete
burst (16 operations, ~5s apart) — every event landed in `cp_history`
exactly once (`cp_history` count matched operation count exactly both
times), correct address, correct actor once the Task 14 dashboard
redeploy was in place (see Task 14 — the *first* INSERT in this session
predated that redeploy and correctly shows `actor: null`, an honest
historical record, not a bug). All test `cp_history`/`cp_items` entries
cleaned up afterward.
**Files changed:** none new (used the already-committed
`docker-compose.qnap.shared.yml` `history-worker` service definition).
**Tested:** live SSH + Dashboard API + Mongo inspection, twice (before and
after the Task 14 dashboard redeploy).
**Status: DONE**

# Task 14 — Dashboard TEST on current code

**Requested:** confirm `History → Daily Tracker` actually works on QNAP
TEST.
**Found:** the running `chad-dashboard-test` was on an image built
2026-07-19 — a week before the entire History feature existed.
`/dashboard/history` 404'd, and a real INSERT through it produced
`actor: null` (the actor-attribution wiring didn't exist yet in that
build). Redeployed via `bash-scripts/dashboard/08_registry_test/deploy.sh`
(build+push to GHCR from this Mac, SSH pull+restart on QNAP) — hit and
fixed a real, user-reported deploy-blocking bug along the way (see
"Fixed along the way" in `06_others_from_report.md`: a `03_restart.sh` /
`03_re-start.sh` naming regression). Confirmed via `docker inspect`:
`chad-mongodb`'s `RestartCount`/`Up` time were unaffected by the dashboard
restart (shared-services isolation working as designed).
**Done:** redeployed dashboard now serves `/dashboard/history` correctly;
repeated the Task 13 INSERT/UPDATE/DELETE cycle — all three now show the
correct actor (`pawel_f`); `History → Daily Tracker` in the real browser
UI shows all three events with correct operation type, address, actor,
timestamp.
**Files changed:** none (redeploy of already-committed code).
**Tested:** live browser session over Tailscale
(`http://100.117.139.83:12020`), before and after redeploy.
**Status: DONE**

# Task 15 — QNAP stability + isolation + performance

**Requested:** baseline vs. idle-after vs. light-load metrics; confirm
`pawel_f`/`kamil_s` isolation; no PROD disruption.
**Done:**
- **Isolation:** logged in as both `pawel_f` and `kamil_s` in the real
  browser. `kamil_s`'s `History → Daily Tracker` correctly showed **0**
  entries (no leakage of `pawel_f`'s history), and `kamil_s`'s own Daily
  Tracker showed their own 85 real entries — completely separate from
  `pawel_f`'s 7.
- **Performance (host, `uptime`/`free -m`/`docker stats`, all via SSH):**

  | Metric | Baseline (before this session) | Idle, after rs0+worker+redeploy | After 16-op light-load burst |
  |---|---|---|---|
  | Load avg (1m/5m/15m) | 2.24 / 2.69 / 2.83 | 1.79 / 2.88 / 2.95 | 3.38 / 2.99 / 2.97 |
  | RAM used / free | 7322 / 412 MB | 7159 / 575 MB | — |
  | Swap used | 2252 MB | 2237 MB | — |
  | `chad-mongodb` CPU / RAM | 0.65% / 169.9MB | 0.77% / 204.2MB | 0.67% / 208.9MB |
  | `chad-history-worker` CPU / RAM | (not yet running) | 0.17% / 31.7MB | 0.17% / 32.1MB |
  | `chad-dashboard-test` CPU / RAM | 0.11% / 125.9MB | 0.16% / 106.7MB | 1.08% / 120.5MB |
  | RestartCount (all 3 containers) | 0 | 0 | 0 |
  | WiredTiger cache | — | — | 10MB |
  | Oplog window | 31.25hr | — | 34.17hr (growing) |

  No swap growth, no load spike beyond normal noise for this host, zero
  restarts across the entire session. `docker ps` never showed a
  crash-looping or unhealthy container at any point.
- **No PROD disruption:** `chad-dashboard-prod` was never touched;
  `chad-mongodb` (shared by TEST and PROD) was never recreated by any
  action in this session, confirmed by its unbroken `Up` time and
  `RestartCount: 0` throughout.
**Files changed:** none (measurement only).
**Tested:** as above, all against the real QNAP host over SSH/Tailscale.
**Status: DONE**
