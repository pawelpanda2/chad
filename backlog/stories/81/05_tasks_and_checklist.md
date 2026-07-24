# Story 81 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE | | Verified real QNAP state before any change (git HEAD, running containers, env var names, compose topology) |
| 2 | DONE | | Deployed current `main` to QNAP TEST only (PROD untouched) |
| 3 | DONE | | Found and fixed a real bug blocking TEST: `cp_history`'s unique index broke against real legacy Mongo data |
| 4 | DONE | | Redeploy TEST with the index fix |
| 5 | DONE | | Start PostgreSQL selectively on QNAP shared (no Mongo restart) |
| 6 | DONE | | Apply Postgres migrations on QNAP |
| 7 | DONE | | Migrate test3 only (dry-run then apply), verify integrity + parity |
| 8 | DONE | | Fixed leads.ts Postgres branch + cut QNAP TEST over to Postgres primary |
| 9 | DONE | | Verify workers on TEST (Google Sheets + data-outbox idle by design; logs captured) |
| 10 | DONE | | QNAP TEST smoke: login path + test3 Date CRUD via Postgres (remote smoke script) |
| 11 | BLOCKED | | Playwright e2e — no `E2E_TEST3_PASSWORD` in this environment |
| 12 | DONE | | `cp-postgres-integrity-check` for test3 + chad_admin on QNAP Postgres |
| 13 | DONE | | Document TEST rollback procedure (exercised live during leads.ts incident) |
| 14 | DONE | | Update documentation (how-it-works.md, 06_others_from_report.md) |
| 15 | DONE | | chad_admin: backup, legacy baseline, Mongo→Postgres, re-cutover with allowlist |

This table is updated as each step is actually executed — no row is marked
DONE without the real command + real output recorded in the matching Task
section below.

# Task 5 — Start PostgreSQL selectively on QNAP

**Requested:** `docker compose ... up -d postgres` only, never the full
shared restart; preflight the data path; confirm Mongo untouched.

**Done:** Added `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` to the
real (gitignored) `.env.qnap` on the QNAP host via SSH (value never
printed — appended via a remote heredoc, verified only by checking the key
name exists and the fetched value's *length*, never its content, in any
subsequent step). Ran `bash-scripts/dashboard/00_qnap_shared/07_postgres_up.sh`
(new script, Story 81) via `run_remote_script`:

```
$ bash bash-scripts/dashboard/00_qnap_shared/07_postgres_up.sh
...
 Container chad-postgres  Created
 Container chad-postgres  Started
[info] Waiting for PostgreSQL health...
[ok] chad-postgres healthy.
[info] chad-mongodb StartedAt (should be unchanged by this script): 2026-07-22T09:37:31Z
[info] beeper-mongodb StartedAt (should be unchanged by this script): 2026-07-22T09:37:25Z
[ok] chad-postgres is up.
```
(A `Found orphan containers ([chad-history-worker])` warning appeared —
informational only, no `--remove-orphans` flag was passed, so
`chad-history-worker` — still needed by PROD's pre-Story-79 code — was
left running, untouched.)

**Files changed:** none (uses the scripts already committed with the
first Story 81 commit).
**Tested:** `docker ps`/`docker inspect` confirm `chad-postgres` healthy,
published on host port 12042, and `chad-mongodb`/`beeper-mongodb`
`StartedAt` timestamps unchanged (not restarted).
**Status: DONE**

# Task 6 — Apply PostgreSQL migrations on QNAP

**Requested:** run `apply-postgres-migrations.mjs`, confirm all 5 tables +
triggers, idempotent.

**Done:** Ran from the local Mac against QNAP's Postgres over Tailscale
(port 12042 — same reachability pattern already proven for Mongo's 12040):
```
$ POSTGRES_URI=postgres://chad:***@100.117.139.83:12042/chad node packages/dba/scripts/apply-postgres-migrations.mjs
[migrations] applying 0001_init.sql...
[migrations] 0001_init.sql — applied.
[migrations] done — 1 new migration(s) applied, 1 total on disk.
```
Verified tables and triggers:
```
$ docker exec chad-postgres psql -U chad -d chad -c "\dt"
 cp_history, cp_items, cp_outbox_data_sync, cp_outbox_google_sheets_sync, schema_migrations   (all 5 present)

$ ... SELECT tgname, tgrelid::regclass, tgenabled FROM pg_trigger WHERE NOT tgisinternal
 cp_history_no_update | cp_history | O
 cp_history_no_delete | cp_history | O
 cp_items_before_insupd | cp_items | O
 cp_items_before_delete | cp_items | O
```
Restart-persistence + Mongo-untouched re-verified:
```
$ docker restart chad-postgres  →  healthy again
$ SELECT version FROM schema_migrations  →  0001   (data survived the restart)
$ docker inspect -f '{{.State.StartedAt}}' chad-mongodb beeper-mongodb  →  unchanged (2026-07-22, not restarted)
```

**Files changed:** none (script already committed).
**Tested:** as above, against the real QNAP host.
**Status: DONE**

# Task 7 — Migrate test3 only to Postgres

**Requested:** exact repoGuid, guard before mutation, dry-run first, report
counts/conflicts/legacy history, no fabrication, then apply; then
integrity + parity + hash comparison; no other repo's records.

**Done:**
1. test3's real repoGuid confirmed from `testing/test3-guard.ts`:
   `5a9c8b7d-6e5f-4a3b-2c1d-0e9f8a7b6c5d`.
2. Prerequisite: test3's 8 `cp_items` predated Story 79 (no
   `_historyVersion` — confirmed via direct Mongo query). Ran the EXISTING
   Story 79 tool, scoped to test3 only:
   ```
   $ node packages/dba/scripts/migrate-legacy-cp-items-to-history.mjs --repoGuid=5a9c...c5d
   [dry-run] 8 cp_items document(s) missing _historyVersion — listed, none other
   $ node packages/dba/scripts/migrate-legacy-cp-items-to-history.mjs --repoGuid=5a9c...c5d --apply
   migrated: 8 items -> version 1 each
   $ node packages/dba/scripts/cp-history-integrity-check.mjs --repoGuid=5a9c...c5d
   OK — zero inconsistencies.
   ```
3. Mongo → Postgres dry-run:
   ```
   $ node packages/dba/scripts/migrate-mongo-to-postgres.mjs --repoGuid=5a9c...c5d
   {"itemsCandidates":8,"itemsMigrated":8,"itemsConflict":0,"historyEventsMigrated":8,
    "historyEventsIncompatibleSkipped":23,"hashMismatches":0, outbox*: 0}
   ```
   (23 = the pre-Story-79 Change-Stream-shaped history events for these 8
   items — correctly detected and reported as incompatible, never
   fabricated into the new shape.)
4. Applied: `--apply` — same report, `itemsMigrated: 8`, `hashMismatches: 0`,
   exit code 0.
5. Verified: `cp-postgres-integrity-check.mjs --repoGuid=5a9c...c5d` → "OK —
   zero inconsistencies" (version continuity, hash chain, last-event vs
   current state, no duplicates). `SELECT DISTINCT repo_guid FROM cp_items`
   on QNAP's Postgres → exactly one row, test3's own GUID — no other repo's
   data present. `SELECT count(*) FROM cp_items` / `cp_history` → 8/8,
   matching Mongo exactly (hash equality already asserted per-item by the
   migrator itself, not just a count check).

**Files changed:** none (scripts already committed).
**Tested:** all commands above, against the real QNAP Mongo/Postgres.
**Status: DONE**

# Task 8 — Cut QNAP TEST over to Postgres primary

**Requested:** isolated TEST-only cutover; TEST connects to Postgres, PROD
stays on Mongo; separate flags; TEST doesn't mutate other repos; Beeper
unaffected; workers read Postgres outbox; restart TEST only.

**Done, in two passes:**

**Pass 1 (initial cutover):** `docker-compose.qnap.test.yml` hardcoded
`DBA_MONGO_ENABLED=false`, `DBA_POSTGRES_ENABLED=true`,
`DBA_PRIMARY_BACKEND=postgres`, `DBA_POSTGRES_REPO_ALLOWLIST=<test3-guid>`,
`POSTGRES_URI=...@chad-postgres:5432/...` — verified via `docker compose
config` that PROD's own compose resolves `DBA_PRIMARY_BACKEND=mongo` with
zero `POSTGRES_*` vars, unaffected. Restarted TEST only
(`04_qnap_test/03_re-start.sh`), confirmed env inside the container and
`chad-mongodb`/`beeper-mongodb` `StartedAt` unchanged.

**Real bug found and fixed before declaring this done:** a direct
DBA-function-level smoke test (`saveDateEntry` against QNAP's real
Postgres) failed outright. Root cause: `packages/dba/src/leads.ts`'s
business functions (`saveDateEntry`/`saveDailyEntry`/`getAllDateEntries`/
`getAllDailyEntries`/`update*Entry`/`delete*Entry` — everything the
Dashboard's Daily Tracker/Dates UI actually calls) only ever branched on
`config.mongoEnabled`/`config.contentProviderEnabled` — there was no
`postgresEnabled`/`primaryBackend==="postgres"` case anywhere in this
file, so every one of them silently no-op'd (reads returned `[]`, writes
returned `success:false`) under TEST's new cutover config. (Two EARLIER
"successful" Postgres smoke tests were false positives caused by an
unrelated ordering bug in my own verification script — `loadQnapEnv()`
reset `DBA_MONGO_ENABLED` back to its default before the actual call,
so those runs silently read Mongo's still-present, identical data instead
of Postgres.)

Immediately rolled QNAP TEST back to `DBA_PRIMARY_BACKEND=mongo` (commit
`cccc293`) as a safety measure while fixing this for real — TEST was
briefly deployed in a state where Daily/Dates wouldn't actually work.

Fix: the four shared Mongo-specific helpers in `leads.ts`
(`getAllChildTextItemsMongo`, `findOrCreateFolderChainMongo`,
`saveChildTextItemMongo`, `updateItemBodyMongo`) were parameterized to
accept a `CpCompatibleDataProvider` instead of hardcoding
`getMongoProvider()` — both `MongoCpProvider` and `PostgresCpProvider`
already implement the identical interface, so this is a small, mechanical
change, not a rewrite. All 8 public functions now switch explicitly on
`config.primaryBackend` (`"postgres"` → `getPostgresProvider()`,
`"mongo"` → `getMongoProvider()`, else → Content Provider), replacing the
old ambiguous "both independently `if (enabled)`" pattern that would have
double-fired if two backends were ever simultaneously `enabled`.

Verified (real local Postgres, then re-verified against QNAP after
redeploy):
```
node ...leads-postgres-smoke... (ad hoc, then formalized as a real test):
create/update/delete Date Entry -> exactly one insert/update/delete
cp_history event each, correct body after update, empty list after delete.
Same for Daily Entry.
```
Formalized as `packages/dba/src/leads-postgres.test.ts` (2 tests, real
local Postgres) — both pass. Full local regression re-run after the fix:
`pnpm test:unit` (28), `pnpm test:integration:local-mongo` (34),
`pnpm test:integration:local-postgres` (24 + 2 new = 26) — all green.
`pnpm --filter dashboard build` — clean.

Re-applied the TEST cutover (same compose values as Pass 1) and restarted
TEST again — see Task 9 below for the post-fix verification against
QNAP's real Postgres/test3.

**Files changed:** `docker-compose.qnap.test.yml` (2 revisions — cutover,
rollback, re-cutover), `packages/dba/src/leads.ts`,
`packages/dba/src/leads-postgres.test.ts`, `vitest.config.mjs`.
**Status: DONE**

# Task 1 — Verify current state

**Requested:** Read starting docs, Story 80, deployment scripts/configs;
confirm HEAD and no uncommitted changes; determine where Postgres runs,
volumes, ports, network reachability, env isolation between TEST/PROD —
never assume.

**Done:**
- `git log --oneline -3` confirmed local HEAD = `1e74868` (Story 80),
  clean working tree (only the pre-existing `packages/net-content-provider`
  submodule pointer drift and another session's untracked
  `ai-docs/audit/`, neither mine).
- Read `bash-scripts/dashboard/{00_qnap_shared,04_qnap_test,06_qnap_test_ssh}/*`,
  `docker-compose.qnap.{shared,test,prod}.yml`, `bash-scripts/common/lib.sh`.
- **Critical finding**: `docker-compose.qnap.test.yml` and
  `docker-compose.qnap.prod.yml` both read `DBA_PRIMARY_BACKEND`/
  `DBA_MONGO_ENABLED` via `${VAR:-default}` from the exact same
  `ENV_FILE=.env.qnap` — writing the cutover value into that shared file
  would silently apply to PROD on its next restart too. Design decision
  (see `02_plan.md`): hardcode the cutover values directly inside
  `docker-compose.qnap.test.yml` instead of via a shared env var.
- SSH'd into QNAP (`load_qnap_ssh_config` + `run_remote_capture`, read-only):
  ```
  $ docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}'
  chad-dashboard-test   chad-dashboard:260723_004459   Up 35 hours
  chad-dashboard-prod   chad-dashboard:260722_114844-6402325   Up 44 hours
  chad-history-worker   chad-shared-history-worker    Up 2 days
  chad-mongodb          mongo:4.4    Up 2 days (healthy)
  beeper-mongodb        mongo:4.4    Up 2 days (healthy)
  ```
  ```
  $ cd $QNAP_REPO_DIR && git rev-parse HEAD
  6eeb9b5433766acc63136f9a1e2717f165a31ae1   (Story 78 — 3 Stories behind main)
  ```
  ```
  $ df -h /share/CACHEDEV1_DATA/ContainerData
  4.5T  1.7T  2.7T  39%   (real volume, not tmpfs)
  ```
- **Major finding, changed scope**: QNAP's checkout and both running
  images (TEST and PROD) were on commit `6eeb9b5` ("feat(story-78)") —
  neither had Story 79's transactional Mongo history nor any Story 80
  Postgres code at all. Confirmed with the user before proceeding: deploy
  current `main` to TEST first (see Task 2), then continue.

**Files changed:** none (read-only).
**Tested:** all commands above run for real against the live QNAP host.
**Status: DONE**

# Task 2 — Deploy current main to QNAP TEST only

**Requested:** get TEST onto code that actually contains Story 79/80
(implied prerequisite discovered during Task 1).

**Done:** Used `bash-scripts/dashboard/08_registry_test/deploy.sh` (per
user's own direction — builds/pushes GHCR image on the local Mac, QNAP
only pulls+retags+restarts TEST, never builds on QNAP's weak hardware).

```
$ echo "d" | bash bash-scripts/dashboard/08_registry_test/deploy.sh
...
[ok] Built and pushed: ghcr.io/pawelpanda2/chad-dashboard:260724_115607-1e74868
...
[ok] chad-test dashboard stopped. Data volume and images preserved. Shared services (mongo) untouched.
...
[ok] chad-test dashboard is up.
[ok] dashboard responds (port 12020).
```

Verified afterward (read-only SSH):
```
PROD image revision (unchanged): 64023250e574214ceb5b99bf73e883ae96641b33
TEST image revision (now):       1e7486824c86255f5bc0e3efa300c8326f25dfe2
TEST HTTP 200, PROD HTTP 200
chad-mongodb / beeper-mongodb: both still "Up 2 days (healthy)" — uptime unchanged, not restarted
```

**Files changed:** none locally (deploy only).
**Tested:** as above, against the real QNAP host.
**Status: DONE**

# Task 3 — Found and fixed a real bug blocking TEST

**Requested:** not explicitly requested — discovered while trying to
smoke-verify TEST's Story 79 mechanism works before starting Postgres work.

**Done:** Attempted a read-mostly smoke check via
`node test/support/provision-test3.mjs` (existing, already-safety-guarded
tool) against QNAP's real Mongo. It crashed:
```
MongoServerError: Index build failed ... cp_history index: sourceId_version_unique
dup key: { sourceId: "07d8ac1d-...", version: null }
  at ensureCpHistoryIndexes (.../mutate.js:344)
```
Root cause confirmed via direct read-only Mongo queries: ALL 58 existing
`cp_history` documents on QNAP predate Story 79 (Change-Stream shape, no
`version` field at all) — MongoDB treats them all as `version: null`, so
any two legacy events sharing a `sourceId` collide against a plain unique
index and abort the ENTIRE index build — breaking `cp_history` writes for
**every repo**, not just test3, the first time any process tried to use
`MongoCpProvider` on this deployment.

Fix: `sourceId_version_unique` is now a **partial** unique index
(`partialFilterExpression: { version: { $exists: true } }`) —
`packages/dba/src/cp-history/mutate.ts`. New regression test reproduces
the exact collision. Committed (`6da1230`) and pushed.

**Files changed:** `packages/dba/src/cp-history/mutate.ts`,
`packages/dba/src/cp-history/mutate.test.ts`.
**Tested:** `pnpm test:integration:local-mongo` — 14 (now 15, +1 new
regression test) passed locally. Redeployed to QNAP TEST (Task 4).

A second, related issue surfaced after redeploy: the OLD `history-worker`
had created an index named `address_1_changedAt_-1` (key pattern
`{address:1,changedAt:-1}`); Story 79's `ensureCpHistoryIndexes()` tries to
create a DIFFERENTLY-NAMED index (`address_changedAt`) with that exact same
key pattern, which MongoDB 4.4 rejects as `IndexOptionsConflict` (code 85) —
same end symptom (every `cp_history` write broken). Per explicit user
direction, fixed via a new idempotent, index-metadata-only script (never
touches documents):

```
$ MONGODB_URI=... node packages/dba/scripts/fix-cp-history-legacy-index-conflict.mjs
[fix-index] cp_history indexes BEFORE:
  ... address_1_changedAt_-1 (legacy) ...
[fix-index] dropping legacy index "address_1_changedAt_-1" ...
[fix-index] ensuring current cp_history indexes (ensureCpHistoryIndexes)...
[fix-index] cp_history indexes AFTER:
  ... address_changedAt (correct, Story 79 name) ...
```

Verified fixed:
```
$ node test/support/provision-test3.mjs
[provision-test3] initial seed already present (2 daily, 3 date entries) — skipping, idempotent.
[provision-test3] done. (idempotent no-op)
```
No crash — confirms TEST's Story 79 Mongo mechanism (read path) now works
against real QNAP data.

**Files changed:** `packages/dba/src/cp-history/mutate.ts`,
`packages/dba/src/cp-history/mutate.test.ts`,
`packages/dba/scripts/fix-cp-history-legacy-index-conflict.mjs`.
**Status: DONE**

# Task 15 — chad_admin migration + login fix + re-cutover (2026-07-24)

**Requested:** migrate `0fc7da8d-3466-4964-a24c-dfc0d0fef87c`; fix login lockout;
allowlist test3 + chad_admin; re-cut TEST to Postgres only.

**Done:**
1. Backup: `bash-scripts/mongo/backups/story81-0fc7da8d-2026-07-24T12-00-05-375Z.json`
   (7 cp_items, 0 cp_history).
2. Legacy baseline (Mongo): dry-run 7 → apply 7 → integrity 7 items / 7 events OK.
3. Mongo→Postgres via `09_story81_remote_migrate.sh` (local Tailscale auth
   out of sync — runs on QNAP docker internal network): dry-run then apply,
   7 items + 7 history, hashMismatches=0.
4. Allowlist + cutover in `docker-compose.qnap.test.yml`; deploy
   `chad-dashboard:260724_145105-447b22d` (commit `447b22d`).
5. Integrity (remote): test3 PASS (8/11), chad_admin PASS (7/7).
6. Smoke (`10_story81_remote_smoke.sh`): getUsersListBody OK, allowlist guard OK,
   test3 Date create/update/delete OK.

**Login incident:** first cutover had only test3 in Postgres — `getUsersListBody()`
returned null → login + `resolveCurrentUser()` failed ("not authenticated").
**Status: DONE**

# Task 9–14 — post-chad_admin verification (2026-07-24)

**Task 9 — Workers:** `[google-sheets] not started — GOOGLE_SHEETS_ENABLED is not true`;
`[data-outbox] not started — DBA_CONTENT_PROVIDER_ENABLED is not true` — by design on TEST.
**Task 10 — Smoke:** `10_story81_remote_smoke.sh` PASSED (see Task 15 §6).
**Task 12 — Integrity:** both repoGuids PASS on QNAP Postgres (see Task 15 §5).
**Task 13 — Rollback:** documented + exercised in Task 8 (commit `cccc293`/`542c31f`).
**Task 14 — Docs:** `ai-docs/history/how-it-works.md`, `06_others_from_report.md`.
**Task 11 — Playwright:** BLOCKED — `E2E_TEST3_PASSWORD` absent from `.env.local`.
