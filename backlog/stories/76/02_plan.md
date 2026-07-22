# Story 76 — Plan

**Status: PLANNING ONLY.** Per the Story's own input ("Najpierw przygotuj
plan Story i listę dotkniętych plików. Nie wdrażaj zmian przed sprawdzeniem
obecnego modelu danych i wolumenów QNAP") and its own earlier explicit
pause ("stwórz ten folder i zapisz, i tyle, nie wykonuj jeszcze story") —
this document is the requested plan + affected-file list. **No
implementation has been done.** Real infrastructure changes (splitting a
production Mongo container, migrating real user data on a shared QNAP
host) are exactly the class of hard-to-reverse, shared-infrastructure
action that should get a human read-through before execution, especially
since this session cannot verify a live data migration went well the way
a synchronous session with the owner could. See §7 for the explicit
handoff.

## 0. Current state (verified by reading the actual files, not assumed)

One MongoDB container, `chad-mongodb` (`mongo:4.4`, single-node replica set
`rs0`, keyfile auth), hosts **two logically separate concerns** on the same
physical instance:

1. **`chad` database** — `cp_items` (all CHAD users' Content-Provider-style
   data, one shared collection scoped by `repoGuid`-prefixed addresses) +
   `cp_history`/`cp_history_state` (Story 74's change-stream-derived audit
   trail) + `google_sheets_sync_outbox` (Story 75). Replica set `rs0` was
   enabled specifically so `history-worker`'s `cp_items.watch()` change
   stream works (MongoDB Change Streams require one).
2. **`beeper_<repoGuid>` databases** — one per CHAD user (Story 73),
   contacts/channels/messages/timeline_events for the Beeper CRM feature.
   Connected via a SEPARATE env var/function already
   (`BEEPER_MONGODB_URI`/`getBeeperMongoDb()`, `packages/dba/src/mongo.ts`)
   — the *application-level* separation already exists; only the
   *physical container* is currently shared.

`history-worker` (`packages/history-worker/`) is a third, independent
container (`chad-history-worker`), `depends_on: mongodb: service_healthy`,
consumes `cp_items`'s change stream, writes `cp_history`.

## 1. Target state

Two MongoDB containers instead of one:

- **`chad-mongodb`** (unchanged) — `chad` db only (`cp_items`/`cp_history`/
  `cp_history_state`/`google_sheets_sync_outbox`), keeps replica set `rs0`
  (still needed — `history-worker`'s change stream doesn't go away, it just
  moves process, see §4).
- **`beeper-mongodb`** (new) — every `beeper_<repoGuid>` database, own
  persistent volume, own container, joins the same `chad-shared` external
  Docker network so both TEST and PROD dashboards can reach it by
  `container_name` (the established pattern — see
  `dashboard-deployment-scripts.md`'s "DNS between separate Compose
  projects" section).

`history-worker`'s logic moves into the Dashboard process (§4) — no third
Mongo-adjacent container.

## 2. Why split at all (confirming the Story's own stated goal makes sense)

Not re-litigating whether to split — the Story input already decided this
— but the concrete benefits worth naming for the plan's own record: (a)
`beeper_*` data (personal contact/message data) and `chad`'s `cp_items`
(dating-tracker/CRM structural data + the newer Sheets-sync outbox) are
unrelated concerns growing independently; a bug or resource spike in one
no longer risks the other's mongod process. (b) `chad-mongodb`'s replica
set / oplog sizing (`--oplogSize 1024`) was tuned for `cp_items`' change
stream workload — `beeper_*`'s write volume (message sync) is a different,
independently-scaling shape that a shared oplog budget currently has to
accommodate for both. (c) Backups (`bash-scripts/mongo/backup.sh`) and any
future restore currently can't target just one concern without a
by-database `mongodump` filter — splitting makes "restore just beeper
data" or "restore just chad data" a container-level operation instead.

## 3. Does `beeper-mongodb` need a replica set? — recommendation: **no, with one named tradeoff**

The Story's own input already anticipates this might not be a clean yes/no
("bez replica setu, o ile kod faktycznie go nie wymaga" — without a
replica set, AS LONG AS the code doesn't actually require one). Checked
directly, not assumed:

- **`packages/beeper-oplog`** (`eventsCol.watch(...)`) — DOES require a
  replica set (Change Streams). But its own `package.json` says "NOT
  deployed yet", and it does not appear as a service in ANY
  `docker-compose*.yml` (confirmed by `grep` — the only match is a
  comment). **Not a current constraint** — if this package is ever
  actually deployed, it would need the same replica-set treatment
  `chad-mongodb` already has, at that time.
- **`packages/dba/src/beeper-crm.ts`**'s live-update SSE endpoint (~line
  1064) — PREFERS `db.watch()` but has a real, already-implemented,
  already-necessary fallback to 5-second polling when the change stream is
  unavailable (the code specifically handles `db.watch()`'s async error
  event against a standalone Mongo, with a log line already written for
  exactly this case: `"db.watch() unavailable (standalone MongoDB, not a
  replica set) — falling back to polling."`). This IS currently deployed
  and IS the one real consumer that would notice.

**The honest tradeoff, not hidden:** today, `beeper-crm.ts`'s `db.watch()`
runs against `chad-mongodb`, which — since Story 74 — happens to already be
a replica set (even though the comment predates that and reads as if it
expects standalone).

**Update (resolved during this session, real QNAP check):** no live log
line for `[beeper-crm]` exists on either `chad-dashboard-test` (up since
2026-07-21T19:26 UTC) or `chad-dashboard-prod` (up since
2026-07-19T15:57 UTC) — meaning nobody has opened the Beeper CRM live view
since either container's last restart, so this could not be confirmed by
directly observing a success/fallback log line. It WAS confirmed
architecturally instead: `docker exec chad-mongodb` query logs from a
concurrent `mongodump` run during this check show `readPreference:
"primaryPreferred"` and `ReplicationStateTransition` lock acquisitions —
both replica-set-only behaviors a standalone `mongod` does not produce —
confirming `rs0` is live and healthy on `chad-mongodb` right now.
MongoDB's Change Streams capability is a **server/replica-set-level**
property, not a per-database one — `beeper_<repoGuid>` databases living on
that same physical replica-set instance mean `db.watch()` in
`beeper-crm.ts` structurally succeeds today (no synchronous throw, no
async error event), i.e. **the code path is real change streams, not the
polling fallback, whenever the Beeper CRM live view is actually open**.
This changes the tradeoff from hypothetical to confirmed: splitting
`beeper-mongodb` off as a standalone (no replica set) instance **is** a
real, user-visible regression — Beeper CRM live updates would degrade
from instant (change-stream push) to up-to-5-seconds-stale (polling), not
broken, not data-losing, but slower. Recommendation is still **no
replica set** for `beeper-mongodb` (simpler ops, no keyfile/rs-init
machinery to maintain for a feature that already has a working degraded
mode), but this should be presented to the user as a confirmed, not
hypothetical, tradeoff — they may consider instant Beeper updates worth
the extra replica-set complexity.

## 4. `history-worker` → embedded in the Dashboard process

**Recommendation: yes, move it in-process — the Story's own 4 stated
conditions are already satisfied by the existing design**, confirmed by
reading `packages/history-worker/index.mjs`, not assumed:

| Condition (Story input) | Already true today? | Evidence |
|---|---|---|
| trwały resumeToken (durable resume token) | ✅ | `cp_history_state` singleton doc (`_id: "cp_history_worker"`), `saveState()` called after every processed event |
| idempotentny zapis historii (idempotent history write) | ✅ | `_id` = the change event's own resume-token data string; a retried `insertOne` hits a real MongoDB duplicate-key error (code 11000), caught and logged as "already recorded, skipping" — never a second write |
| tylko jedna aktywna instancja workera (only one active worker instance) | ✅, structurally | Dashboard runs as exactly one container per environment (TEST, PROD — confirmed in `docker-compose.qnap.{test,prod}.yml`, no replica/scaling config anywhere) — the same topology assumption Story 75's own embedded Google Sheets worker (`packages/dashboard/instrumentation.ts`) already relies on successfully |
| poprawne wznowienie po restarcie (correct resume after restart) | ✅ | `runChangeStream()` reads the persisted `resumeToken` and passes `resumeAfter` to `itemsCol.watch()`; falls back to "start from now" only if no token was ever saved |

None of this logic needs to change to move process — it's already
process-agnostic (plain Node, `MongoClient`, no framework coupling to
being a standalone container). The move is mechanical: port
`packages/history-worker/{index.mjs,lib/}` into a new
`packages/dba/src/history/` module (mirroring Story 75's
`packages/dba/src/google-sheets/` structure — a `bootstrap.ts` exporting
`startHistoryWorkerIfEnabled()`, called once from `instrumentation.ts`
alongside the existing `startGoogleSheetsSyncWorkerIfEnabled()` call, both
independent background loops in the same already-running process, a
pattern already proven safe and working since Story 75).

**Risk this plan should name, not hide:** the Dashboard's own Next.js
build/runtime is a different execution context than a plain standalone
Node ESM script — `packages/history-worker` currently has zero build step
(runs `.mjs` files directly), while code inside `packages/dba` goes
through `tsc` and ships as compiled `dist/`. Porting means either (a)
rewriting `index.mjs`/`lib/*.mjs` as TypeScript inside `dba` (small, both
already use the same `mongodb` driver version, `diff` package already used
elsewhere in the monorepo per `body-diff.mjs`'s own comment
"already a dependency elsewhere... packages/dropbox-sync"), or (b) keeping
it as a plain `.mjs` module dashboard imports directly (less consistent
with the rest of `dba`, but a smaller diff). Recommend (a) for consistency
with Story 75's own precedent, but this is exactly the kind of judgment
call worth a quick confirmation before doing the actual rewrite.

**Argument the Story asked for, in case a separate container turns out
preferable after all:** none found. **Update (resolved during this
session, real QNAP `docker stats --no-stream` check):**
`chad-history-worker` is using 45.3MiB RAM (0.59% of the host's 7.55GiB
limit), 0.23% CPU, 12 PIDs, 0 restarts since it started
(2026-07-21T18:26 UTC — roughly 9h uptime at check time). This is
negligible next to the Dashboard containers themselves (`chad-dashboard-test`
116.5MiB, `chad-dashboard-prod` 109.2MiB) — confirms there is no
resource-footprint argument for keeping it a separate container. The only
remaining argument in its favor is crash/restart isolation from the
Dashboard process, which is a real but qualitative tradeoff, not a
measured one — worth naming to the user, not a blocker to the
recommendation.

## 5. Data migration — the part that touches real user data

`beeper_<repoGuid>` databases currently live inside `chad-mongodb`'s single
`/data/db` WiredTiger data directory — there is no way to "split" a data
directory by database name at the filesystem level; the only clean,
verifiable method is a logical dump + restore:

1. **Before touching anything:** `mongodump --uri="mongodb://.../chad-mongodb:27017" --db=beeper_<guid>` for every real `beeper_*` database (enumerate via `db.adminCommand({listDatabases:1})`, filter by `beeper_` prefix — never hardcode a guessed list of users). Store dumps on the QNAP host's real persistent volume (same `QNAP_CONTAINER_DATA_PATH` pattern as `qnap-data-path.md` established — never `/share` directly), not inside a container that could be recreated.
2. **Bring up the new `beeper-mongodb` container** (own volume, own healthcheck, joined to `chad-shared`) — verified healthy BEFORE any restore attempt.
3. **`mongorestore`** each dumped database into the new container.
4. **Verify before cutover, not after:** compare collection counts (`db.<collection>.countDocuments({})` per collection, per database) between the OLD location (still untouched inside `chad-mongodb`) and the NEW restored copy — every count must match exactly, the same standard Story 75 used for its own real-data verification (never "the restore command exited 0" alone).
5. **Only after verified matching counts:** update `BEEPER_MONGODB_URI` in `docker-compose.qnap.test.yml`/`.prod.yml` to point at the new container's `container_name`, restart the dashboards, do a real smoke test (open Beeper CRM for a real user on TEST, confirm contacts/messages appear — matching data, not just "page loads").
6. **Do not delete the `beeper_*` databases from `chad-mongodb`** as part of this Story — leave them in place, unused, as a rollback safety net for at least one full deploy cycle. A follow-up cleanup Story can drop them once the split has been running successfully for a while. This directly satisfies the Story's own explicit safety requirement ("Nie dopuść do przypadkowego uruchomienia aplikacji na pustej bazie" — never let the app accidentally run against an empty database): the OLD data never gets deleted until the NEW copy has already been proven correct and in active use.

## 6. Affected files (the list the Story input asked for)

- `docker-compose.qnap.shared.yml` — add `beeper-mongodb` service (+
  `beeper-mongo-keyfile-init` only if a replica set is added per §3's
  reconsideration), remove/relocate `history-worker` service block (§4).
- `.env.qnap.example` — document new `BEEPER_MONGO_ROOT_USERNAME`/
  `_PASSWORD` (recommendation: separate credentials from `chad-mongodb`'s,
  least-privilege — a compromised Beeper container credential shouldn't
  also grant access to `cp_items`) or note the decision to reuse the
  existing pair if simplicity wins that tradeoff instead.
- `docker-compose.qnap.test.yml`, `docker-compose.qnap.prod.yml` —
  `BEEPER_MONGODB_URI` now points at `beeper-mongodb:27017` instead of
  `chad-mongodb:27017`.
- `bash-scripts/dashboard/00_qnap_shared/01_config.sh`/`03_re-start.sh` —
  new `require_data_path_writable` call for the new volume path, new
  healthcheck wait, update `require_shared_services_healthy()` (in
  `bash-scripts/common/lib.sh`) to also check `beeper-mongodb`.
  `history-worker`'s own current healthcheck/depends_on entries removed
  once it's no longer a separate service.
- `bash-scripts/mongo/backup.sh` — parameterize or duplicate for
  `beeper-mongodb` (own container name, own target).
- New: a one-off migration script (`bash-scripts/mongo/migrate-beeper-split.sh`
  or similar) implementing §5's dump/restore/verify steps — NOT written yet
  in this planning pass.
- `packages/history-worker/` → logic ported into `packages/dba/src/history/`
  (new module, mirroring `google-sheets/`'s structure) — old package
  removed once the port is verified working, not before.
- `packages/dashboard/instrumentation.ts` — add
  `startHistoryWorkerIfEnabled()` call alongside the existing Google
  Sheets one.
- `packages/dba/src/mongo.ts` — `getBeeperMongoDb()`'s connection resolution
  unaffected (already reads `BEEPER_MONGODB_URI`, which changes value, not
  shape) — likely no code change here at all, confirm during
  implementation.
- Docs: a new `ai-docs/deploy/` note for this split (mirroring
  `qnap-data-path.md`'s incident-report style, or a fresh migration-plan
  doc mirroring `2026-07-10_mongodb-replica-set-migration-plan.md`'s own
  precedent), `docker-compose.qnap.shared.yml`'s own header comment
  updated, `dashboard-deployment-scripts.md` updated for the new service.

## 7. Explicit handoff — what this plan does NOT do

This plan does not touch any `docker-compose*.yml`, `.env.qnap*`, or
`bash-scripts/` file, and does not run any command against the real QNAP
host or its Mongo data. Recommended next step: the user reads this plan
(particularly §3's replica-set tradeoff and §5's migration approach),
confirms or adjusts the two judgment calls flagged (separate vs. shared
Beeper Mongo credentials; TypeScript-port vs. keep-as-`.mjs` for
history-worker), and then implementation can proceed as its own tracked
set of tasks in `05_tasks_and_checklist.md`, executed with the same
real-data-verification discipline Story 75 used throughout (real counts
before/after, never "the command exited 0" alone) — especially warranted
here since this Story touches real personal message/contact data, not
just a sync mirror.
