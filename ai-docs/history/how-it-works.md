# History (cp_history) — how it works

Status: updated 2026-07-24, Story 81 — **PostgreSQL is CHAD's source of
truth** (`cp_items`/`cp_history`/`cp_outbox_data_sync`/
`cp_outbox_google_sheets_sync`); MongoDB is retired for CHAD and kept only
for Beeper CRM (`beeper_<repoGuid>` databases, entirely separate — see
`documentation/beeper/architecture.md`). Story 79's MongoDB-transaction
mechanism (below, kept as historical record) is **superseded**. Read
`backlog/stories/80/` and `backlog/stories/81/` for the full rationale.

**Deployment status (do not assume more than this says):**

```
LOCAL:      PostgreSQL (DBA_PRIMARY_BACKEND=postgres)
QNAP TEST:  PostgreSQL (DBA_PRIMARY_BACKEND=postgres) — test3 +
            chad_admin (0fc7da8d-3466-4964-a24c-dfc0d0fef87c) in
            chad-postgres; DBA_POSTGRES_REPO_ALLOWLIST = both GUIDs
QNAP PROD:  MongoDB (DBA_PRIMARY_BACKEND=mongo) — not cut over
Beeper:     MongoDB (beeper-mongodb), unaffected, everywhere
```

**Login incident (Story 81, 2026-07-24):** the first TEST Postgres cutover
included only test3 in Postgres. Login reads `chad_admin/users/users-list`
via `getUsersListBody()` → primary backend → Postgres, but chad_admin was
not migrated — users-list returned null, login failed, and
`resolveCurrentUser()` returned null on save ("not authenticated"). Fix:
legacy baseline history for chad_admin in Mongo, migrate chad_admin to
Postgres, add both repoGuids to `DBA_POSTGRES_REPO_ALLOWLIST`, re-cut TEST
over (PROD untouched).

QNAP TEST and PROD do NOT share `DBA_PRIMARY_BACKEND` via `.env.qnap` —
TEST's cutover values are hardcoded literals in
`docker-compose.qnap.test.yml` (see `backlog/stories/81/02_plan.md`).

## Why this changed (Story 80)

Story 79 already made Mongo's `cp_items`+`cp_history` writes atomic via a
multi-document transaction, but that still required a hand-rolled
single-node replica set (`rs0`) on QNAP hardware with no AVX support. Story
80 moves the same guarantees (atomic write+history, versioning,
actor/hash-chain, no Change Stream, no separate worker process) onto
PostgreSQL, using a database trigger instead of a Mongo transaction, and
retires the Mongo replica-set requirement for CHAD entirely.

## Pipeline (PostgreSQL, Story 80)

```
Dashboard UI/API
  -> dba (leads.ts, repo-context.ts, data-commands.ts, data-router.ts)
  -> PostgresCpProvider.putItem / .createChild / .deleteItem
       (packages/dba/src/data-providers/postgres-cp-provider.ts)
  -> executeCpMutationWithHistoryPostgres / runCpMutation
       (packages/dba/src/cp-history/mutate-postgres.ts)
       one Postgres transaction:
         SET LOCAL app.mutation_id / app.request_id / app.actor_*
         SELECT ... FOR UPDATE (row lock, read current cp_items row)
         INSERT/UPDATE/DELETE cp_items
           -> cp_items_write_history trigger fires (sql/migrations/0001_init.sql):
                computes version, writes exactly one cp_history row
         commit
  -> packages/dba/src/cp-history-postgres.ts (read side; diff computed at
       read time from before/after snapshots via cp-history/diff.ts)
  -> packages/dashboard/app/api/content-provider/{history,daily-history,dates-history}
  -> packages/dashboard/app/(dashboard)/dashboard/history/{page.tsx,entry/[id]/page.tsx}
```

`cp-history.ts`/`data-outbox.ts`/`google-sheets/outbox.ts` are thin
dispatchers on `loadDataProvidersConfig().primaryBackend` — the Mongo
implementations (`cp-history-mongo.ts`, `data-outbox-mongo.ts`,
`google-sheets/outbox-mongo.ts`) are unchanged and still exactly what runs
wherever `DBA_PRIMARY_BACKEND=mongo` (QNAP TEST/PROD today).

## History trigger — why a trigger, not just application code

`cp_items_write_history()` (`packages/dba/sql/migrations/0001_init.sql`) is
a `BEFORE INSERT OR UPDATE OR DELETE` trigger on `cp_items`. This means
history is written at the database level, not the application level — a
manual `psql` write (bypassing `PostgresCpProvider` entirely) still
produces a `cp_history` row, with `actor_kind = 'unknown'` and a
server-generated `mutation_id` (`SET LOCAL app.*` unset). The only thing
that can be "lost" for an out-of-band write is actor attribution — the fact
of the change itself can never be skipped. `cp_history` itself is
immutable: separate triggers reject any `UPDATE`/`DELETE` against it
outright, at the database level, matching Story 80's append-only
requirement.

## `cp_items` bookkeeping columns

Set by the trigger, never directly by application code:

```
history_version integer,        -- 1 on first insert, +1 per mutation
last_mutation_id text,
last_request_id text,
last_actor_username text,
last_actor_repo_guid text,
last_actor_kind text,           -- user | system | migration | unknown
```

`id` is `text`, not `uuid` — confirmed against real legacy data during this
Story's own local cutover that not every historical `cp_items._id` is
UUID-shaped.

## `cp_history` — the only history/audit table

```
id bigserial, mutation_id, request_id,
source_id, repo_guid, address, item_name, version,
operation_type,                          -- insert | update | delete
actor_username, actor_repo_guid, actor_kind,   -- kind: user|system|migration|unknown
changed_at,
before_hash, after_hash,                 -- Postgres-native sha256 (digest(jsonb::text)) —
                                          -- NOT byte-comparable to Mongo's hashCpState;
                                          -- see hash.ts's doc comment
config_diff, body_diff,                  -- NULL for native rows (diff computed at read
                                          -- time from snapshots); non-NULL only for rows
                                          -- carried over by the Mongo->Postgres migrator
before_snapshot, after_snapshot,         -- ALWAYS full on every native-Postgres event
                                          -- (unlike Mongo's every-20th-update cadence)
```

- **Diff at read time**: `cp-history-postgres.ts` computes `config`/`body`
  diffs from `before_snapshot`/`after_snapshot` using the same
  `diffConfig`/`diffBody` (`cp-history/diff.ts`) Mongo's write path uses —
  reusing DB-agnostic pure functions, not duplicating diff logic in
  PL/pgSQL. Migrated rows (where a pre-Story-79-cadence Mongo update had no
  snapshot to carry over) instead carry their originally-computed diff
  directly in `config_diff`/`body_diff` — the read side prefers a non-null
  `config_diff` over recomputing from (possibly absent) snapshots.
- **Hash chain**: internally consistent per algorithm-origin only —
  `before_hash(N) == after_hash(N-1)` holds within a contiguous run of
  native-Postgres events (Postgres's own `digest()` algorithm) or within a
  contiguous run of migrated Mongo events (Mongo's `hashCpState`
  algorithm), but NOT across the seam between them (different hash
  functions, both internally sound, not directly comparable) — a disclosed
  limitation, not a bug; `cp-postgres-integrity-check.mjs` skips the
  chain check specifically across that seam (using a non-null
  `config_diff` as the "this side of the pair is migrated" marker).
- **Idempotency**: `UNIQUE(mutation_id)` — a retried mutationId either
  short-circuits on a pre-transaction lookup or hits the unique constraint
  (`23505`), caught and treated as a replay; reusing a mutationId for a
  *different* item is rejected (`CpMutationIdReusedError`).
- **Concurrency**: `SELECT ... FOR UPDATE` takes a row lock on `cp_items`
  before the trigger computes the next version — the second of two
  concurrent writers simply waits for the first transaction to commit, no
  custom optimistic-lock/retry code needed.

## Child address allocation — no counter table

`PostgresCpProvider.createChild` uses `pg_advisory_xact_lock(hashtextextended(
repoGuid || ':' || parentAddress, 0))` — a transaction-scoped advisory lock,
released automatically at COMMIT/ROLLBACK — instead of Mongo's separate
`folder_child_counters` collection. No `cp_folder_child_counters` table
exists in Postgres.

## Migrating Mongo → Postgres

`packages/dba/scripts/migrate-mongo-to-postgres.mjs (--repoGuid=<guid> |
--all) [--apply]` — dry-run by default, idempotent, reports conflicts
(never overwrites), verifies migrated `cp_items` hash equality against the
Mongo source via the shared `hashCpState`. Requires the source repo's
`cp_items` to already carry `_historyVersion` (Story 79's own
`migrate-legacy-cp-items-to-history.mjs` — this script doesn't fabricate a
starting version either). Pre-Story-79 `cp_history` documents (Story
74/78's Change-Stream shape — no `mutationId`/`repoGuid`/`version` fields)
are detected and reported as incompatible, never coerced. The `cp_items`
write-history trigger is disabled for the duration of the migrator's own
inserts (`ALTER TABLE ... DISABLE/ENABLE TRIGGER`, always re-enabled in a
`finally`) so a migrated item's real historical `cp_history` rows can be
inserted verbatim instead of the trigger minting a fresh, wrong one.

## Integrity checking

`pnpm test:cp-postgres-integrity -- --repoGuid=<guid>` (or `--all`) —
`packages/dba/scripts/cp-postgres-integrity-check.mjs`. Read-only, stdout +
exit code, no separate error table. Checks: `cp_items.id/address/name`
match `config`, `repo_guid` matches the address-derived repo, no duplicate
address, no duplicate child name under one parent, `cp_history` version
continuity, hash-chain continuity (migrated/native seam-aware, see above),
the last event for a still-existing item matches `cp_items.history_version`,
a deleted item's last event is `delete` with no surviving row, stale-locked
outbox jobs, and (when `MONGODB_URI` is also set) `cp_items` count parity
against the Mongo source per repo.

## Mongo mechanism (Story 79) — superseded, still what QNAP TEST/PROD run

Everything below is unchanged from Story 79 and describes what's still
actually running wherever `DBA_PRIMARY_BACKEND=mongo` (QNAP TEST/PROD as of
Story 80 — see the deployment-status note at the top of this file).

Story 74/78's `history-worker` derived `cp_history` asynchronously from a
MongoDB Change Stream watching `cp_items` — a separate process, its own
resume-token/shadow-state collections (`cp_history_state`,
`cp_history_last_state`), in-memory caches to rebuild across restarts.
Story 79 replaced all of that with a single MongoDB **transaction** around
every `cp_items` write: the mutation and its one `cp_history` event commit
together, or neither commits. No separate process, no resume token, no
shadow state, no Change Stream at all.

```
Dashboard UI/API
  -> dba (leads.ts, repo-context.ts, data-commands.ts, data-router.ts)
  -> MongoCpProvider.putItem / .createChild / .deleteItem
       (packages/dba/src/data-providers/mongo-cp-provider.ts)
  -> executeCpMutationWithHistory (packages/dba/src/cp-history/mutate.ts)
       one MongoDB transaction:
         read current cp_items doc (same session)
         compute version / diff / hashes / mutationId
         write cp_items
         insert exactly one cp_history doc
         commit
  -> packages/dba/src/cp-history-mongo.ts (read side)
```

`rs0` (the single-node replica set) is still required by this mechanism
for multi-document transactions — unchanged by Story 80, still running on
QNAP for as long as QNAP TEST/PROD stay on the Mongo primary.

`packages/dba/scripts/migrate-legacy-cp-items-to-history.mjs --repoGuid=<guid>
[--apply]` and `pnpm test:cp-history:integrity` (Mongo-side integrity
checker) are unchanged and still the right tools for any repo still on the
Mongo primary.

## How to test locally

```bash
pnpm test:unit                        # hash/diff/versioning — no DB needed
pnpm test:integration:local-mongo     # real local rs0 (Mongo mechanism)
pnpm test:integration:local-postgres  # real local Postgres (Story 80 mechanism)
```

## Rollback

Postgres and Mongo providers can both be registered simultaneously
(`DBA_MONGO_ENABLED=true` + `DBA_POSTGRES_ENABLED=true`), but only one is
ever `primaryBackend` at a time — never two primaries. Rolling back a
cutover means flipping `DBA_PRIMARY_BACKEND` back to `mongo`; the Mongo
data is never deleted by the migrator, so it stays valid as a rollback
source for as long as it's kept around (see `backlog/stories/80/02_plan.md`
§"Cutover" for the intended rollback-window procedure — not yet exercised
on QNAP as of Story 80).
