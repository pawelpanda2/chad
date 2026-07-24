# Story 81 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE | | Verified real QNAP state before any change (git HEAD, running containers, env var names, compose topology) |
| 2 | DONE | | Deployed current `main` to QNAP TEST only (PROD untouched) |
| 3 | DONE | | Found and fixed a real bug blocking TEST: `cp_history`'s unique index broke against real legacy Mongo data |
| 4 | IN PROGRESS | | Redeploy TEST with the index fix |
| 5 | DONE | | Start PostgreSQL selectively on QNAP shared (no Mongo restart) |
| 6 | DONE | | Apply Postgres migrations on QNAP |
| 7 | DONE | | Migrate test3 only (dry-run then apply), verify integrity + parity |
| 8 | NOT DONE YET | | Cut QNAP TEST over to Postgres primary (isolated from PROD's env) |
| 9 | NOT DONE YET | | Verify Google Sheets / Content Provider / data-outbox workers against Postgres on TEST |
| 10 | NOT DONE YET | | QNAP TEST smoke/integration tests (test3) |
| 11 | BLOCKED | | Playwright e2e — no `E2E_TEST3_PASSWORD` in this environment |
| 12 | NOT DONE YET | | `cp-postgres-integrity-check` against QNAP TEST test3 data |
| 13 | NOT DONE YET | | Document TEST rollback procedure |
| 14 | NOT DONE YET | | Update documentation |

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
