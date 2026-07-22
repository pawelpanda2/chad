# Story 80 — Plan

## Context

Story 79 (HEAD `4fb08a3`, same day) already made `cp_items`+`cp_history` writes
atomic, versioned, actor/hash-chained, and retired `history-worker`/Change
Streams — but on MongoDB, still requiring a hand-rolled single-node replica
set (`rs0`) on QNAP hardware without AVX. The user confirmed (Input 2) they
still want the full move to PostgreSQL: Postgres becomes CHAD's only
datastore, MongoDB is kept solely for Beeper's per-user databases. This plan
carries Story 79's guarantees onto Postgres using native transactions +
triggers instead of Mongo's `withTransaction`, and retires the Mongo
replica-set requirement for CHAD entirely.

## Schema (packages/dba/sql/migrations/, plain numbered .sql files + a
tiny `schema_migrations`-tracked runner — no new ORM dependency, consistent
with this repo's "hand-rolled script" convention; only new npm dependency is
`pg`)

- `cp_items`: `id uuid PK`, `repo_guid text`, `address text`, `name text`,
  `type text`, `config jsonb`, `body text`, `created_at`/`modified_at
  timestamptz`, `history_version integer default 0`, `last_mutation_id`,
  `last_request_id`, `last_actor_username`, `last_actor_repo_guid`,
  `last_actor_kind`. `UNIQUE(repo_guid, address)`. Indexes: `(repo_guid,
  address text_pattern_ops)` for prefix search, `(repo_guid, name)`. No GIN
  index — no JSONB-content query exists today (confirmed by DBA audit).
- `cp_history`: as specified in Input 1 §3.2, with `source_id uuid`
  (matches `cp_items.id`), `UNIQUE(mutation_id)`, `UNIQUE(source_id,
  version)`. **Simplification within the spec's own fallback (§5):**
  `config_diff`/`body_diff` are computed at **read time** in Node from
  `before_snapshot`/`after_snapshot` (both stored in full on every event,
  not just insert/delete) — reusing the existing DB-agnostic
  `packages/dba/src/cp-history/diff.ts` (`diffConfig`/`diffBody`) unchanged.
  This avoids writing JSON-diff logic in PL/pgSQL (the spec explicitly
  allows deferring diff to read-time when a full trigger-side diff would be
  "nadmiernie złożona"). Trigger enforces immutability (`RAISE EXCEPTION` on
  `UPDATE`/`DELETE` against `cp_history`).
- `cp_outbox_data_sync`, `cp_outbox_google_sheets_sync`: column-for-column
  translation of the existing Mongo `OutboxJob`/`GoogleSheetsSyncJob` shapes
  (status/attempts/timestamps/lock owner). Claim index `(status,
  next_attempt_at)`.
- `schema_migrations(version text PK, applied_at timestamptz)`.
- No `cp_folder_child_counters` table — child address allocation uses
  `pg_advisory_xact_lock(hashtextextended(repo_guid || ':' || parent_address,
  0))` + a direct-children query within the same transaction as the insert
  (advisory lock scopes to the transaction, auto-released on
  commit/rollback, no separate cleanup needed).

## History mechanism — trigger (Wariant A, as preferred by the spec)

- `BEFORE INSERT OR UPDATE ON cp_items FOR EACH ROW`: reads transaction-local
  settings via `current_setting('app.*', true)` (set by the app through
  parameterized `set_config()` calls, never raw `SET LOCAL` string
  interpolation — avoids SQL injection); computes `NEW.history_version =
  COALESCE(OLD.history_version,0)+1`, stamps `NEW.modified_at`,
  `NEW.last_mutation_id/last_request_id/last_actor_*`; inserts one
  `cp_history` row with full `before_snapshot`(`OLD` or null)/`after_snapshot`
  (`NEW`) and computed hashes (`digest(canonical text, 'sha256')`).
  Row lock already held by the UPDATE statement itself makes the
  read-then-increment race-free without any extra locking.
- `BEFORE DELETE ON cp_items FOR EACH ROW`: same insert using `OLD`,
  `after_snapshot = null`.
- Idempotency of `mutation_id` mirrors Mongo's two-layer defense: app
  pre-checks `cp_history` for an existing row with that `mutation_id` before
  writing (fast path, returns prior result if `source_id` matches, throws if
  it doesn't — same `CpMutationIdReusedError` semantics); if a concurrent
  writer beats it, the trigger's `INSERT` hits the `UNIQUE(mutation_id)`
  constraint (Postgres error `23505`), which the app catches and re-checks
  (slow path) — same shape as `mutate.ts` today, just Postgres-flavored.
  `gen_random_uuid()` (built into PG13+, no extension needed) mints a
  mutation_id server-side when `app.mutation_id` is unset (manual SQL).
- Manual `psql` writes with no `app.*` settings: `actor_kind` defaults to
  `'unknown'`, `actor_username`/`actor_repo_guid` stay null — history is
  still written, never skipped (this is the whole point of the trigger
  variant vs. app-only).

## PostgresCpProvider (`packages/dba/src/data-providers/postgres-cp-provider.ts`)

Implements the existing `CpCompatibleDataProvider` interface unchanged
(`getItem`, `getByNames`, `getByNames2`, `getChildren`, `findRecursively`,
`executeWrite`, `putItemConfig`) so `DbaDataRouter` and every business
function (`leads.ts`, Daily/Date Entry, API routes) need zero call-site
changes — same invariant Story 79 relied on for Mongo. `getByNames2` keeps
the exact-match-or-throw `DuplicateChildNameError` behavior (`SELECT ...
WHERE address ~ '^parent/[0-9]{2,3}$' AND config->>'name' = $1`, throw if
`count > 1`). `createChild` keeps the "follower never re-allocates" rule
(`command.item` already decided → straight `putItem`). Registered as a new
`DataBackendName = "postgres"`; `DBA_PRIMARY_BACKEND=postgres` switches the
router; Mongo provider stays registered as follower/rollback source only
(never a second primary).

## Outboxes & workers

New Postgres-backed modules mirroring `data-outbox.ts`/`google-sheets/
outbox.ts` function-for-function, with `claimNextJob`/`claimNextGoogleSheetsJob`
using:
```sql
UPDATE cp_outbox_data_sync SET status='processing', locked_at=now(), locked_by=$1
WHERE id = (SELECT id FROM cp_outbox_data_sync
  WHERE status IN ('pending','retry') AND next_attempt_at <= now()
  ORDER BY next_attempt_at LIMIT 1 FOR UPDATE SKIP LOCKED)
RETURNING *;
```
Same `RETRY_BACKOFF_MS`/`STALE_LOCK_MS` constants (reused, not redefined).
`data-outbox-worker.ts`'s current gap (never wired into a running process)
is preserved as-is — out of this Story's scope to fix — but the Postgres
version is equally wireable from `instrumentation.ts` alongside the Google
Sheets worker when someone does wire it. Content Provider follower
(`net-file-cp-provider.ts`) and Google Sheets client code are untouched;
only the queue storage moves.

## Migrator (`packages/dba/scripts/migrate-mongo-to-postgres.mjs`)

Same conventions as `migrate-legacy-cp-items-to-history.mjs`: `--repoGuid`
scoped, `--dry-run` default / `--apply` to write, per-collection counts,
hash verification (`hashCpState` equivalence between Mongo doc and migrated
row), conflict detection (existing Postgres row with same id/address but
different content → report, never silently overwrite), non-zero exit on any
inconsistency, idempotent (safe to re-run — skips rows already migrated
unless content differs). Migrates `cp_items` → `cp_items`, `cp_history` →
`cp_history` (preserving `mutationId`/`version`/`actor`/hashes — the actual
diff/snapshot re-derived from Mongo's stored diff+the Postgres before/after
snapshot model, since Story 79's Mongo history doesn't store full snapshots
for every event — reconstructing full snapshots for non-snapshot events is
not possible without replay, so those events migrate with
`before_snapshot`/`after_snapshot = null` and a note in the report; this is
disclosed, not fabricated, per the explicit "nie fabrykuj" rule),
`data_sync_outbox` → `cp_outbox_data_sync`, `google_sheets_sync_outbox` →
`cp_outbox_google_sheets_sync`.

## Read side / Dashboard History UI

`packages/dba/src/cp-history.ts` becomes a thin backend-dispatcher (checks
`DBA_PRIMARY_BACKEND`) delegating to `cp-history-mongo.ts` (current logic,
renamed as-is) or new `cp-history-postgres.ts` (same function signatures:
`listCpHistory`, `getCpHistoryEntry`, `resolveDailyTrackerAddressPrefix`,
etc.), so the API routes and the History UI components need zero changes.
Config diff/body diff computed from snapshots at read time using the
existing `diff.ts` functions.

## Local cutover

`docker-compose.local.yml`: add a `postgres` service (`postgres:17`,
healthcheck, named volume, env-based credentials). Keep the existing
`mongodb` service (Beeper still needs it locally) but flip the dashboard's
`DBA_PRIMARY_BACKEND=postgres`, `DBA_MONGO_ENABLED=false` for CP items
(Beeper's Mongo connection is separate/unaffected — `getBeeperMongoDb()`
doesn't go through this flag). Run the migrator against local Mongo test
data, verify integrity checker, then this becomes the default local dev
config.

## QNAP

**User clarification during implementation:** the QNAP Postgres is meant to
be one shared instance for both TEST and PROD, holding the *same* data —
exactly like `chad-mongodb` today, not a TEST-only database. This changes
the cutover shape: a partial cutover (flip TEST's `DBA_PRIMARY_BACKEND` to
`postgres` while PROD stays on `mongo`) would split "the same data" into two
diverging sources of truth (TEST writing Postgres, PROD still writing
Mongo) — precisely the "dwa primary" state §18 forbids. Since flipping PROD
is a PROD deploy (also forbidden here), this Story's QNAP scope is:

- Add the `postgres` service to `docker-compose.qnap.shared.yml` (new
  volume, new credentials, alongside `chad-mongodb`/`beeper-mongodb` —
  does not touch either Mongo container/volume). Started so the container
  exists and is healthy, ready for a future Story to do the real cutover.
- Do **not** flip `DBA_PRIMARY_BACKEND` away from `mongo` for either QNAP
  TEST or QNAP PROD in this Story — both keep reading/writing the same
  shared `chad-mongodb` exactly as today. The full QNAP cutover (both
  environments together, migrator run against real shared data, integrity
  check, rollback window) is real follow-up work requiring a PROD change
  window and is explicitly out of this Story's scope.
- The local stack (`docker-compose.local.yml`) still gets the full cutover
  (`DBA_PRIMARY_BACKEND=postgres`) since local has no PROD/shared-data
  constraint — it's a single developer's own disposable data.

## Tests

Unit (Vitest, no DB): Mongo-doc→Postgres-row mapping, row→CpItem mapping,
migration conflict detection — `diff.ts`/`hash.ts` already have unit tests
and are reused unchanged. Integration (real local Postgres, following the
existing `mutate.test.ts` Vitest pattern): insert/update/delete
atomicity, manual-SQL actor=unknown, version continuity + concurrency
(two concurrent updates on one item), `createChild` concurrency (same name
→ one item, different names → unique addresses, no gaps), repo isolation,
outbox `FOR UPDATE SKIP LOCKED` (two claimers never get the same job),
retry/stale-lock recovery, trigger duplicate-mutation-id rejection,
migrator idempotency, Mongo→Postgres count/hash parity on a seeded dataset.
E2E: existing `test/e2e/history-ui.spec.mjs`/`daily-dates.spec.mjs`
re-run against local Postgres-backed stack (QNAP TEST run only if the QNAP
cutover step above is judged safe and executed).

## Explicitly out of scope / unchanged

`packages/net-content-provider` (mid-rewrite submodule) — not touched.
`packages/content-provider/*` (separate paused TS rewrite) — not touched.
Wiring `data-outbox-worker.ts` into an actual running process — pre-existing
gap, carried forward as-is, not this Story's job to fix.
