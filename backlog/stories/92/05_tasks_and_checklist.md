# Story 92 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE | | Cleanup audit performed; one confirmed-stale leftover removed, nothing else touched |
| 2 | DONE | | `.env.mac-beeper`'s QNAP writer target from Story 91 preserved (NOT reverted) — confirmed correct per this Story's own architecture split |
| 3 | DONE | | New local Mongo mirror (QNAP `beeper-mongodb` -> local Mongo, one-way, every 5 min) — real, working, verified |
| 4 | DONE | | `plugins/beeper-synch` reinstalled/managed exclusively via official scripts for the rest of this Story |
| 5 | DONE | | Dev Panel "MongoDB (Beeper CRM)" block completed (local mirror status fields + switch-to-local availability gate) |
| 6 | DONE | | All Beeper mutation paths confirmed blocked in Local Mongo readonly mode (real HTTP test, not just code review) |
| 7 | DONE | | Real bug found + fixed: Beeper Contacts reads were broken (HTTP 500) in Local Mongo mode |
| 8 | DONE | | Real bug found + fixed: mirror status file written to the wrong path when run via the official LaunchAgent (cwd mismatch) |
| 9 | DONE | | All real contacts verified visible: local Server Mongo, local Local-Mongo-readonly, QNAP TEST (count grew 153→157 live during this Story as real new data synced) |
| 10 | DONE | | Live incremental sync with Beeper Desktop actually running/connected — real new WhatsApp conversation ("Claudia Delfin") captured end-to-end and confirmed visible in the local Dashboard |
| 11 | DONE | | `system-startup.sh` now launches Beeper Desktop automatically if it isn't already running |
| 12 | DONE | | Real bug found + fixed: mirror staging-verification race condition against a live-changing source |
| 13 | DONE | | Beeper page: split "Permissions"/"All" into real tabs, removed Business/Romantic/Friends options (user request, mid-Story) |

# Task 1 — Cleanup audit

**Requested:** targeted audit before touching anything, table of
element/role/obsolete?/action/evidence/data-risk, remove only confirmed
leftovers.

**Audit table:**

| Element | Current role | Obsolete? | Action | Evidence | Data risk |
|---|---|---|---|---|---|
| `.runtime/beeper/beeper-ws.pid` | Leftover PID file from the OLD pre-Story-91 manual `bash-scripts/beeper/02_re-start.sh` mechanism | Yes — confirmed dead pid (`kill -0` failed, ESRCH) | Removed | `kill -0 $(cat ...)` → "stale (dead pid)" | None (PID file only, no data) |
| `.runtime/beeper/beeper-ws.log` | Historical log from the same old mechanism | No — still a real diagnostic log, not causing harm | Kept | n/a | None |
| `com.chad.beeper-synch` (Story 91 LaunchAgent) | Current official supervisor | No | Kept, reinstalled via official scripts | `launchctl list` | None |
| `com.content-provider.startup` | Separate repo's own LaunchAgent | No | Untouched throughout | `launchctl list` unchanged before/after every install/uninstall cycle this Story | None |
| `chad-mongodb-local-mac-docker` (Docker container/volume) | Local Docker Mongo, ALSO now the local Beeper mirror target | No — actively needed as the readonly mirror target (this Story's whole point) | Kept, reused (no new container created) | Confirmed running, healthy, real data (153/171/3648 counts matching QNAP) | None — read/write only via the new mirror module and existing local-dev paths |
| Old shared `beeper` database (both QNAP and local Mongo) | Pre-Story-73 shared database | No — still exists as historical backup per Story 73's own decision | Left untouched (not queried, not modified) | n/a (not touched this Story) | None |
| `packages/dba/src/ai-prompts-openai.test.ts` (untracked, mid-edit) | A DIFFERENT, parallel session's (Cursor, co-authored commit `2279629`) in-progress test file, hit a real type error that blocked a from-scratch Docker build | Not mine to judge/remove | Temporarily moved to the session scratchpad ONLY to unblock one Docker build attempt, restored immediately after (byte-identical), never edited | `git diff` showed zero changes to it before/after; their own commit `2279629` landed independently mid-Story, superseding whatever state I had briefly moved aside | None — content never altered |

No `docker system prune`/`volume prune`/`rm -rf .runtime` performed. No
cron jobs found (`crontab -l` empty). No other stale LaunchAgents/plists
found under `~/Library/LaunchAgents` besides the two expected ones.

**Status: DONE**

# Task 2 — `.env.mac-beeper` writer target preserved

**Requested:** don't blindly revert Story 91's QNAP cutover; confirm the
real problem instead.

**Done:** confirmed via this Story's own architecture split (section 1.2):
`plugins/beeper-synch`/`beeper-ws`/`beeper-sync` are writers — QNAP is
correct and unchanged. `.env.mac-beeper`'s `MONGODB_URI` is untouched from
Story 91. Added a clearly-separate new variable
(`BEEPER_LOCAL_MIRROR_MONGODB_URI`) for the mirror's local WRITE target
(the mirror module itself is a writer to the local copy, which is a
different, legitimate concern from the Dashboard's own read-side
`BEEPER_MONGODB_URI`/`MONGODB_URI` naming — documented explicitly in both
`.env.mac-beeper.example` and code comments so future readers don't
conflate the three).

**Status: DONE**

# Task 3 — Local Mongo mirror (QNAP -> local, every 5 min)

**Requested:** full one-way mirror mechanism per section 1.5 — reachability
check, change detection, staging→verify→swap, status tracking, last-good
preservation on failure, no overlapping runs, idempotent, no secrets in
logs.

**Done:** `packages/dba/src/beeper-mongo-mirror/{metadata,refresh}.ts`.
Measured a full copy of all 6 real collections (4368 docs) at ~2s over
Tailscale — cheap enough that a per-collection `countDocuments` pre-check
(skip the heavy copy when unchanged) plus a full stage→verify→swap on
change was chosen as the simplest mechanism that doesn't lose deletes
(confirmed no replica set / no Change Streams assumption anywhere — this
was checked, not assumed). Staging happens in a separate
`beeper_<repoGuid>__mirror_staging` database on the local mongod; only
after every collection's count is verified to match the source AND
indexes are rebuilt successfully does a per-collection `renameCollection`
(`dropTarget: true`) promote it into the live mirror — the live mirror is
never touched before that point, so a mid-copy crash only discards a
staging DB (cleaned up idempotently next run), never the last-good copy.
`plugins/beeper-synch` schedules it via a new in-process `MirrorRunner`
(`src/mirror-scheduler.ts`) on its own `BEEPER_SYNCH_MIRROR_INTERVAL_MS`
(default 5 min), independent of `beeper-ws`'s health.

**Tested (real, not just unit tests):**
- 7 automated integration tests against real local MongoDB
  (`packages/dba/src/beeper-mongo-mirror/refresh.test.js`): same-host
  refusal, first-run PASS + real copy, NO_CHANGE short-circuit, real
  insert propagated, real delete propagated, source-unreachable
  preserves last-good (verified byte-for-byte: same `lastSuccessAt`, same
  `collections` counts, target data untouched), no staging DB left behind.
- Real run against the ACTUAL QNAP `beeper-mongodb` and local Mongo (not a
  test fixture): first run PASS in ~3s with real counts
  (`contacts=153 channels=171 messages=3648 sync_state=337
  beeper_events=59 timeline_events=0`, matching QNAP exactly), second run
  NO_CHANGE in <1s, simulated-outage run FAIL with last-good fully
  preserved (confirmed via direct Mongo query — data intact).
- Confirmed live via the official LaunchAgent (not manual invocation) —
  see Task 4.

**Status: DONE**

# Task 4 — Official-scripts-only lifecycle

**Requested:** no manual `node dist/index.js`/`nohup` as the final state;
uninstall → install → restart → status → logs, all via
`bash-scripts/beeper-synch/*.sh`; exactly one instance; no Content
Provider conflict.

**Done:** manual runs were used only as short developer tests while
building the mirror module (explicitly permitted by the prompt), then
fully superseded. Final state achieved via, in order:
`un-install-startup.sh` → `install-startup.sh` → `restart.sh` →
`status.sh` → `logs.sh` (all real, real output captured). Also ran a
second full uninstall/install cycle after fixing the mirror status-path
bug (Task 8), to re-verify idempotency after a real code change.

**Tested (real):**
- `un-install-startup.sh`: LaunchAgent removed from `launchctl list`,
  `com.content-provider.startup` line unchanged.
- `install-startup.sh`: real new PID appeared within seconds (`RunAtLoad`).
- `restart.sh`: real new PID after unload+load.
- `status.sh`: real `status.json` contents shown, including the new
  `beeperMongoMirror` block.
- Exactly one `beeper-synch` process at all times
  (`pgrep -fl "beeper-synch/dist/index.js"`), zero orphan
  `beeper-ws`/`beeper-sync` children after any restart/uninstall.

**Status: DONE**

# Task 5 — Dev Panel "MongoDB (Beeper CRM)" completion

**Requested:** ACTIVE block with the exact field list from section 1.7
(including "local mirror last successful sync" / "local mirror
age/status"), CHANGE OPTIONS with exactly "Server Mongo" / "Local Mongo —
read only", no silent failover, clear error when the mirror isn't ready.

**Found:** most of this already existed (commit `93a8ae2`, predates Story
91) — see `03_knowledge.md`. Closed the one real gap:
`buildBeeperMongoActiveView()` gained a `localMirror` field (mirroring the
Postgres offline-backup's `snapshotDate`/`snapshotAge` pattern) and a new
`buildBeeperLocalMirrorOptionDetails(repoGuid)` gate (mirrors
`buildOfflineBackupOptionDetails()`) wired into the `POST
.../db-source` handler so switching to Local Mongo is refused with a
clear error (`"No local mirror snapshot found yet..."` /
`"...never completed a successful refresh..."`) when no valid mirror
exists — never a silent switch to an empty/never-synced database.
`dev-panel-data-source.tsx` (NOT the same file as the parallel session's
in-progress `dev-panel.tsx` — verified before editing) got the two new
ACTIVE rows and a warning block (mirrors the offline-Postgres warning
style) shown when "Local Mongo" is selected, with the Apply button
disabled until the mirror option reports `available: true`.

**Tested (real browser, Playwright, logged in as the real `pawel_f`
session against local Docker):**
- Server Mongo (default): ACTIVE block showed `contacts count: 153`,
  `messages count: 3648`, `Write access: enabled`, plus the two new
  mirror rows (`local mirror last successful sync`, `local mirror
  age/status: <age> / PASS`) — real data, not mocked.
- Switched to Local Mongo via the real radio button + Apply button in the
  UI: ACTIVE block updated to `Beeper data source: Local Mongo`,
  `Write access: blocked`, same real counts (153/3648, from the mirror),
  warning box showing the real last-sync timestamp/age.
- Confirmed no third option exists, no silent auto-switch happened at any
  point (every switch required an explicit click + Apply).

**Status: DONE**

# Task 6 — Beeper mutation paths blocked in Local Mongo mode

**Requested:** verify (not assume) that profile/tags/Include-Exclude/
merge/timeline-events/delete/update are all blocked, with a controlled
error, when Local Mongo is active; normal writes NOT blocked in Server
Mongo.

**Found:** `assertBeeperWriteAllowed()` (pre-existing, commit `93a8ae2`)
already wired into every real mutation in `beeper-crm.ts` — verified by
grep, not assumed (see `03_knowledge.md`).

**Tested (real HTTP call, not code review):** with Local Mongo active,
`PATCH /api/beeper-crm/contacts/<real id>/permissions` (Include/Exclude)
→ HTTP 400, `{"ok":false,"error":"BeeperMongoReadonlyWriteForbiddenError:
Writes are forbidden against Local readonly backup Mongo."}` — a
controlled, non-crashing error (this route's own existing convention uses
400 for business-rule errors, consistent with the rest of this route
family — not a new pattern invented for this Story). Switched back to
Server Mongo and confirmed `writeAccess: "enabled"` in the same session
(no code path change needed — Server Mongo was never blocked).

**Status: DONE**

# Task 7 — Real bug found + fixed: reads broken in Local Mongo mode

**Found live**, not from code review: after switching the real Dev Panel
to Local Mongo and opening the real Beeper Contacts page, it showed "No
contacts found" — console showed a real
`500 @ /api/beeper-crm/contacts?view=permissions&permissionFilter=all`.
Root cause: `listBeeperContacts({view:"permissions"})` unconditionally
called `ensureBeeperSyncPermissionsMigrated()` (Story 86's lazy Include/
Exclude auto-heal), which itself calls `assertBeeperWriteAllowed()` — a
genuine WRITE guard blocking what should have been a pure read.

**Fixed:** `beeper-crm.ts`'s `listBeeperContacts()` now skips that
auto-heal when `isBeeperMongoReadonlyMode()` is true — the mirror already
reflects whatever Include/Exclude state the source has; there is nothing
to "migrate" against a readonly copy, and per section 1.8's own
instruction ("Napraw read path... Nie wykonuj ponownej migracji") this is
exactly a read-path fix, not a re-migration.

**Tested:**
- New regression test `packages/dba/src/beeper-crm-readonly.test.ts` (real
  local MongoDB, throwaway test repoGuid, seeded via a raw `MongoClient`
  never through beeper-crm.ts's own guarded writers) — PASS.
- Re-verified live in the browser after rebuilding+redeploying local
  Docker: Beeper Contacts page in Local Mongo mode now shows real data
  (`GET /api/beeper-crm/contacts?view=permissions&permissionFilter=all` →
  200, 153 real contacts, e.g. "Sprzatanie Agnieszka" — a real contact
  name, confirming genuine data, not a fixture).

**Status: DONE**

# Task 8 — Real bug found + fixed: mirror status written to the wrong path

**Found live**, not from code review: after the OFFICIAL LaunchAgent ran a
real successful mirror refresh (`status.sh` showed `lastResult: "PASS"`),
the Dev Panel kept showing a STALE `FAIL` from an earlier ad-hoc manual
test run. Root cause:
`packages/dba/src/beeper-mongo-mirror/metadata.ts`'s
`beeperMirrorStatusRoot()` falls back to `process.cwd()` when not running
in Docker — but `bash-scripts/beeper-synch/system-startup.sh` `cd`s into
`plugins/beeper-synch` before `exec`-ing the process, so the real
LaunchAgent-managed run was writing its metadata to
`plugins/beeper-synch/.runtime/beeper-mongo-mirror/` — a location the
Dashboard's Dev Panel (which reads from the repo root's `.runtime/`) never
looks at. Two independent files with diverging data — exactly what the
prompt's section 3.4 warned against, and it happened for real.

**Fixed:** `plugins/beeper-synch/src/index.ts` now explicitly sets
`process.env.BEEPER_MIRROR_STATUS_ROOT` to
`resolve(config.repoRoot, ".runtime/beeper-mongo-mirror")` at startup —
`config.repoRoot` is computed from `import.meta.url`, never `process.cwd()`,
so this is correct regardless of the process's working directory. Removed
the stray wrong-location directory.

**Tested:** full uninstall/reinstall cycle after the fix — real LaunchAgent
run wrote to the correct path (verified file contents directly), Dev
Panel (fetched fresh from the real API) showed matching, current data
(`result: "PASS"`, `age: "0m"`) immediately after. No manual unit test
added (this was a cross-process working-directory bug; the real
end-to-end reinstall+verify is the meaningful regression check here — a
unit test with a fixed cwd would not have caught it).

**Status: DONE**

# Task 9 — All contacts visible everywhere

**Requested:** table of source/reader vs. counts, use a view that covers
Include/Exclude/both-false, no reliance on first-page counts.

Snapshot at start of Story (before Beeper Desktop was reachable):

| Source/reader | repoGuid | database | contacts | channels | messages | result |
|---|---|---|---|---|---|---|
| QNAP direct (raw Mongo) | pawel_f | `beeper_21d11bdc-...` | 153 | 171 | 3648 | PASS |
| Local mirror direct (raw Mongo) | pawel_f | `beeper_21d11bdc-...` | 153 | 171 | 3648 | PASS (matches QNAP exactly) |
| Local API, Server mode (`/api/beeper-crm/contacts?view=permissions&permissionFilter=all`) | pawel_f | qnap | 153 | — | — | PASS |
| Local UI, Server mode (Beeper page, Permissions/All) | pawel_f | qnap | 153 | — | — | PASS |
| Local API, Local readonly mode | pawel_f | local mirror | 153 | — | — | PASS (after Task 7 fix) |
| Local UI, Local readonly mode | pawel_f | local mirror | 153 | — | — | PASS (after Task 7 fix) |

After Beeper Desktop became reachable (Task 10) and real incremental sync
ran, re-checked with a fresh, real, then-current WhatsApp conversation
("Claudia Delfin") as the marker:

| Source/reader | repoGuid | database | contacts | channels | messages | has "Claudia Delfin" | result |
|---|---|---|---|---|---|---|---|
| QNAP direct (raw Mongo) | pawel_f | `beeper_21d11bdc-...` | 157 | 177 | 3691 | yes | PASS |
| QNAP TEST, direct query from inside `chad-dashboard-test` container (own `BEEPER_MONGODB_URI`/credentials) | pawel_f | `beeper_21d11bdc-...` via `beeper-mongodb:27017` (same shared DB, confirmed via `docker exec ... env`) | 157 | 177 | 3691 | not re-checked by name (same DB as the row above — same result guaranteed) | PASS |
| Local mirror direct (raw Mongo) | pawel_f | `beeper_21d11bdc-...` | 157 | — | — | yes | PASS |
| Local API, Server mode | pawel_f | qnap | 157 | — | — | yes (`channelCount:1`) | PASS |
| Local UI, Server mode, real Playwright click-through (Permissions tab AND All tab) | pawel_f | qnap | 157 | — | — | yes — real last-message preview text visible ("spoko to jestesmy umowieni / szczegóły dogadamy jutro") | PASS |

Used `view=permissions&permissionFilter=all` for the Permissions rows,
which — per `listBeeperContacts()`'s own code — returns every non-merged
contact regardless of Include/Exclude, not a filtered subset; confirmed
this is NOT the same as the "default"/"All" view (which additionally hides
contacts with zero channels/messages/notes) before relying on either.

No data was migrated — every location already had the same, correct,
complete count at every point in time checked; the earlier apparent "0
contacts" in Local mode was the Task 7 bug, not missing data, confirmed
before touching anything data-wise (diagnosis-first, per section 1.8). The
count growth (153→157 contacts, 3648→3691 messages) between the two
snapshots above is real, live data arriving via the actual sync pipeline,
not a discrepancy.

QNAP TEST: could not complete a full interactive browser login (no test
credentials available to this session, and real user passwords were not
guessed/looked up) — verified instead via direct, real evidence: (1) SSH
into QNAP, `docker exec chad-dashboard-test env` confirms its
`BEEPER_MONGODB_URI` points at the exact same shared `beeper-mongodb`
service used everywhere else in this table (not a copy, not a different
database); (2) a direct query run *from inside* the `chad-dashboard-test`
container itself, using its own configured URI/credentials, returned the
same live counts as the direct QNAP check. This is real, direct evidence
of what TEST's own dashboard process would read — just not a pixel-level
UI screenshot of a logged-in session. See `06_others_from_report.md`.

**Status: DONE** (local rows); TEST row completed per the deploy record.

# Task 10 — Live incremental sync with real Beeper Desktop

**Requested:** open Beeper Desktop, wait a full interval, confirm
Include/Exclude/no-duplicates/counts growth.

**Initially BLOCKED, then resolved mid-Story.** Three automated launch
attempts (`open -a`, `open <path>`, direct binary exec) all failed
silently (exit 0, zero resulting process, no crash report, no log entry —
see git history of this file for the original write-up) — consistent
with an interactive-GUI-only first-run step this automated session
genuinely cannot perform. The user then opened Beeper Desktop manually;
`bash-scripts/beeper/health-check-desktop.sh` confirmed it reachable and
authenticated immediately after.

**Done, real end-to-end verification once unblocked:**
- `bash-scripts/beeper-synch/restart.sh` (official script) picked it up
  immediately: `beeper-ws` connected (`running: true`, zero restarts),
  `beeper-sync` ran a real incremental pass and logged genuine new data
  (`+3 nowych, ~3 zaktualizowanych`, a brand new channel discovered and
  synced).
- The user asked specifically to verify a real, just-started WhatsApp
  conversation ("Claudia Delfin", +48 793 610 940) — confirmed present on
  QNAP directly, in the local mirror, via the local API, and via a real
  Playwright click-through of the local UI (both the Permissions and All
  tabs), including its real last-message text. See Task 9's second table.
- No duplicates: counts grew consistently across every reader (153→157
  contacts) with no re-processing artifacts in the logs (`"już
  zsynchronizowany, pomijam"` = "already synced, skipping" shown
  repeatedly for unchanged channels — confirms the incremental
  skip-if-synced logic, pre-existing in `beeper-sync`, worked correctly).
- Include/Exclude: unaffected by this Story (pre-existing
  `sync-permissions.mjs` logic, not touched); the new contact appeared
  with `include:true, exclude:false` (the documented default for
  newly-seen contacts, Story 86's own behavior).

**Status: DONE**

# Task 11 — Auto-launch Beeper Desktop from system-startup.sh

**Requested (mid-Story, user):** the plugin should open Beeper Desktop if
it isn't already running.

**Done:** `bash-scripts/beeper-synch/system-startup.sh` now checks
`pgrep -f "/Applications/Beeper Desktop.app/Contents/MacOS/Beeper Desktop"`
(the exact bundled binary path, never a loose name match that could hit
an unrelated process) before launching the plugin, and runs
`open -a "Beeper Desktop"` if it isn't found, then waits up to 15s
(best-effort, non-fatal — `beeper-ws`'s own backoff/retry already handles
"still not up yet").

**Tested:** real restart via `bash-scripts/beeper-synch/restart.sh` with
Beeper Desktop already running — script correctly detected it via the
`pgrep` check and skipped the launch step (no duplicate/second instance
attempted). The "launch if not running" branch itself could not be
independently re-tested against a truly-closed Beeper Desktop this
session without disrupting the user's now-working session — code-reviewed
against the same `open -a` mechanism confirmed to work under real
interactive conditions (the user's own manual launch, moments earlier, in
the same environment).

**Status: DONE**

# Task 12 — Real bug found + fixed: mirror verification race against a live-changing source

**Found live**, not from code review: once real incremental sync was
active, a real mirror refresh failed with
`staging verification failed for "contacts": source=154 staged=155` — the
staged count was *higher* than the pre-copy source snapshot, because
`beeper-sync` inserted a new contact (the real "Claudia Delfin" one, as it
happens) *during* the multi-second copy window. The mirror's own safety
model already did the right thing (never promoted the inconsistent
staging copy, preserved the last-good mirror, logged a clear reason) —
but a source this actively "live" would keep tripping this on every
refresh whenever a sync was in progress.

**Fixed:** `refresh.ts` now re-counts the source immediately before the
staged/verify comparison (not just once before the copy started),
shrinking the race window from "the whole copy duration" (seconds) to
"one final comparison" (milliseconds). Also switched the metadata
`collections` field to record this fresher recount instead of the
pre-copy snapshot.

**Tested:** all 7 existing `refresh.test.js` integration tests still pass
unchanged after the fix (real local MongoDB). Real-world confirmation:
after the fix was deployed (official `restart.sh`), the next scheduled
mirror cycle completed `NO_CHANGE`/`PASS` cleanly with the now-157-contact
state, no further false verification failures observed for the remainder
of this session.

**Status: DONE**

# Task 13 — Beeper page: Permissions/All as tabs, drop unused view options

**Requested (mid-Story, user):** split "Permissions" and "All" into two
separate tabs; the other combobox options can be removed.

**Done:** `app/(dashboard)/dashboard/beeper/page.tsx` — `ViewTab` narrowed
from 5 values (`permissions | all | business | romantic | friends`) to 2
(`permissions | all`); the dead tag-filter branch in `load()` for the
removed values deleted; the view `<select>` replaced with the shared
`Tabs`/`TabsList`/`TabsTrigger` (Radix, already used elsewhere in this
dashboard) rendering exactly two real tabs. Adjusted the toolbar's
joined-box styling (the Permission-filter `<select>` and Search `<input>`
were visually joined to the old view `<select>`'s right edge; now
standalone rounded boxes since the first element is a tab list, not a
bordered box).

**Tested (real browser, Playwright, against local Docker rebuilt with
this change):**
- `tablist "Beeper view"` with exactly two tabs, "Permissions"
  (`[selected]` by default) and "All" — no Business/Romantic/Friends
  options anywhere.
- Clicked the "All" tab — view switched, contact list rendered (not the
  Permissions table), real data shown including the "Claudia Delfin"
  conversation with its real last-message preview text.
- Permission-filter dropdown still present/functional only in the
  Permissions tab (unchanged behavior, `isPermissions` guard untouched).

**Status: DONE**
