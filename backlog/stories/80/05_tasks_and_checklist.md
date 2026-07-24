# Story 80 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE | | PostgreSQL schema — `cp_items`, `cp_history`, `cp_outbox_data_sync`, `cp_outbox_google_sheets_sync`, `schema_migrations`, no `cp_folder_child_counters` |
| 2 | DONE | | Trigger-based atomic history (`cp_items_write_history`) — every insert/update/delete writes exactly one `cp_history` row in the same transaction, including manual SQL (`actor_kind='unknown'`); `cp_history` is database-enforced immutable |
| 3 | DONE | | `PostgresCpProvider` — same `CpCompatibleDataProvider` interface as Mongo (getItem/getByNames/getByNames2/getChildren/findRecursively/executeWrite/putItemConfig), repo isolation, duplicate-child-name detection, address-conflict detection |
| 4 | DONE | | Child address allocation via transaction-scoped advisory lock — no counter table, concurrency-tested (same name → one item, different names → unique addresses, no gaps) |
| 5 | DONE | | PostgreSQL outboxes (`cp_outbox_data_sync`, `cp_outbox_google_sheets_sync`) with `FOR UPDATE SKIP LOCKED` claim, retry/backoff, stale-lock recovery — Mongo/Postgres implementations behind a backend dispatcher, so QNAP TEST/PROD (still on Mongo) are unaffected |
| 6 | DONE | | Mongo → PostgreSQL migrator — dry-run default, `--repoGuid`/`--all`, idempotent, conflict detection, hash verification, reports (never fabricates) pre-Story-79-shaped incompatible history events |
| 7 | DONE | | PostgreSQL integrity checker (`cp-postgres-integrity-check.mjs`) — read-only, stdout + exit code, smoke-tested including deliberate corruption detection |
| 8 | DONE | | Dashboard History UI/API unchanged, reads PostgreSQL when configured (`cp-history.ts` backend dispatcher) — verified locally against real migrated data |
| 9 | DONE | | Local cutover — `docker-compose.local.yml` gets a `postgres:17` service (healthcheck, persistent volume, secrets via env), `DBA_PRIMARY_BACKEND=postgres` is the new local default; `mongodb` stays only for Beeper |
| 10 | PARTIAL | | QNAP — `postgres` service added to `docker-compose.qnap.shared.yml` (shared TEST+PROD, same data, matching `chad-mongodb`'s topology) but **not started/verified on the real QNAP host** and **no primary-backend cutover** for TEST or PROD (would split/require a PROD deploy — out of this Story's scope, see `06_others_from_report.md`) |
| 11 | NOT DONE | | QNAP TEST full cutover, `test:integration:daily-dates` / Playwright e2e against QNAP TEST — blocked: no `E2E_TEST3_PASSWORD`/real `MONGO_ROOT_USERNAME`+`PASSWORD` in this environment (pre-existing gap, independent of this Story) |

# Task 1 — PostgreSQL schema

**Requested:** `cp_items`/`cp_history`/outbox tables per the input's target model, with sensible indexes only where a real query needs them.
**Done:** `packages/dba/sql/migrations/0001_init.sql` + `packages/dba/scripts/apply-postgres-migrations.mjs` (idempotent, `schema_migrations`-tracked runner, no new ORM dependency). `cp_items.id`/`cp_history.source_id` are `text`, not `uuid` — discovered during this Story's own local cutover that real legacy data isn't guaranteed UUID-shaped (exactly the trap the input warned about).
**Files changed:** `packages/dba/sql/migrations/0001_init.sql`, `packages/dba/scripts/apply-postgres-migrations.mjs`.
**Tested:** Applied against a real local Postgres 17 container; verified idempotent re-apply is a no-op.
**Status: DONE**

# Task 2 — Trigger-based atomic history

**Requested:** Trigger variant (preferred by the input) — audits manual SQL too, delete has full `OLD`.
**Done:** `cp_items_write_history()` (BEFORE INSERT/UPDATE/DELETE) computes `history_version`, writes one `cp_history` row per mutation with full before/after snapshots (Postgres stores these on every event, not periodically like Mongo). `cp_history` has separate immutability triggers rejecting UPDATE/DELETE.
**Files changed:** `packages/dba/sql/migrations/0001_init.sql`, `packages/dba/src/cp-history/mutate-postgres.ts`, `packages/dba/src/postgres.ts` (`setMutationContext` via parameterized `set_config`, never string-interpolated `SET LOCAL`).
**Tested:** `packages/dba/src/cp-history/mutate-postgres.test.ts` (12 tests: insert/update/delete atomicity, manual-SQL actor=unknown, version conflict, idempotent retry, concurrent-update version race, forced address-conflict/mutationId-reuse failures leave no history, immutability enforcement) — real local Postgres, all passing.
**Status: DONE**

# Task 3 — PostgresCpProvider

**Requested:** Same interface as Mongo provider, no changes to higher layers.
**Done:** `packages/dba/src/data-providers/postgres-cp-provider.ts` implements `CpCompatibleDataProvider` unchanged; registered as a new `"postgres"` `DataBackendName`, wired into `data-providers/config.ts`/`data-router-instance.ts` behind `DBA_POSTGRES_ENABLED`/`DBA_PRIMARY_BACKEND=postgres`, both opt-in (existing Mongo-only deployments unaffected by default).
**Files changed:** `packages/dba/src/data-providers/postgres-cp-provider.ts`, `data-providers/types.ts`, `data-providers/config.ts`, `data-router-instance.ts`, `index.ts`.
**Tested:** `packages/dba/src/data-providers/postgres-cp-provider.test.ts` (7 tests: repo isolation incl. GUID-prefix collision, `DuplicateChildNameError`, find-or-create idempotency, `AddressConflictError`).
**Status: DONE**

# Task 4 — Child address allocation

**Requested:** No counter table; transaction + advisory lock + retry.
**Done:** `pg_advisory_xact_lock(hashtextextended(repoGuid || ':' || parentAddress, 0))`, transaction-scoped, auto-released at COMMIT/ROLLBACK.
**Files changed:** `packages/dba/src/data-providers/postgres-cp-provider.ts` (`createChild`), `cp-history/mutate-postgres.ts` (`runCpMutation` exported for reuse inside the same locked transaction).
**Tested:** Included in Task 3's test file — 5 concurrent same-name calls → one item; 5 concurrent different-name calls → unique, gap-free addresses.
**Status: DONE**

# Task 5 — PostgreSQL outboxes

**Requested:** `cp_outbox_data_sync`/`cp_outbox_google_sheets_sync`, `FOR UPDATE SKIP LOCKED` claim, same retry/backoff/crash-recovery behavior.
**Done:** `data-outbox-mongo.ts`/`data-outbox-postgres.ts` (+ shared `data-outbox-shared.ts` for constants/types) behind a `data-outbox.ts` dispatcher on `primaryBackend`; same pattern for `google-sheets/outbox-{mongo,postgres}.ts` behind `google-sheets/outbox.ts`. `data-outbox-worker.ts`/`google-sheets/worker.ts` need zero changes — they already only import from the dispatcher.
**Files changed:** `packages/dba/src/data-outbox.ts` (rewritten as dispatcher), `data-outbox-mongo.ts` (new, relocated), `data-outbox-postgres.ts` (new), `data-outbox-shared.ts` (new), `google-sheets/outbox.ts` (rewritten as dispatcher), `google-sheets/outbox-mongo.ts` (new, relocated), `google-sheets/outbox-postgres.ts` (new).
**Tested:** `packages/dba/src/data-outbox-postgres.test.ts` (5 tests: claim, two-claimer no-duplicate race, idempotent enqueue, retry/backoff, stale-lock recovery). PROD's Google Sheets worker path unaffected — it stays on `mongo` (`data-outbox-worker.ts` for the data-sync side remains unwired into any running process, a pre-existing gap carried forward unchanged, not this Story's job to fix).
**Status: DONE**

# Task 6 — Mongo → PostgreSQL migrator

**Requested:** Idempotent, `--dry-run`/scoped/full, conflict/hash checks, no fabrication, non-zero exit on error.
**Done:** `packages/dba/scripts/migrate-mongo-to-postgres.mjs`. Requires source items already Story-79-migrated (`_historyVersion` present) — refuses to guess. Detects and reports (never coerces) pre-Story-79 `cp_history` documents with no `mutationId`/`repoGuid`/`version` (a real shape found in local dev data during this Story). Disables/re-enables the `cp_items` history trigger around its own inserts so migrated history rows carry their real original `mutationId`/`version`/`actor`/hashes, not a synthetic one.
**Files changed:** `packages/dba/scripts/migrate-mongo-to-postgres.mjs`.
**Tested:** Twice — a synthetic seeded repo (insert/update/createChild, dry-run → apply → idempotent-reapply-is-noop), and a real local-dev Mongo dataset (16 items, 2 repos, mixed Story-79 and legacy-shaped history, an outbox job) migrated end-to-end; verified via `cp-postgres-integrity-check.mjs --all --MONGODB_URI=...` (count parity) and a direct read through `getDataRouter()` with `DBA_PRIMARY_BACKEND=postgres`.
**Status: DONE**

# Task 7 — PostgreSQL integrity checker

**Requested:** One command, checks per §14, stdout + exit code, no report table.
**Done:** `packages/dba/scripts/cp-postgres-integrity-check.mjs` (`pnpm test:cp-postgres-integrity`). Checks id/address/name/repo_guid consistency, duplicate address/child-name, version continuity, hash-chain (migrated/native-seam-aware), last-event-vs-current-state, delete-implies-absence, stale outbox locks, and (when `MONGODB_URI` set) Mongo/Postgres count parity.
**Files changed:** `packages/dba/scripts/cp-postgres-integrity-check.mjs`.
**Tested:** Smoke-tested against real migrated local data — passed clean initially, then correctly caught a genuine pre-existing data-integrity issue in the local Mongo fixtures (two children both named "dates" under one parent — the same class of incident as Story 72's "07/05 duplicate leads" bug, faithfully carried over by the migrator, not silently fixed); also deliberately corrupted a row (`history_version`) via a trigger-disabled `UPDATE` and confirmed detection + non-zero exit, while confirming a *normal* manual `UPDATE` (trigger active) does NOT false-positive since the trigger recomputes `history_version` itself.
**Status: DONE**

# Task 8 — Dashboard History UI/API on PostgreSQL

**Requested:** Same GUI (table, no pagination/accordion, Date/Operation/Item columns, filters, details route), reading PostgreSQL when configured; repo isolation preserved.
**Done:** `cp-history.ts` is now a backend dispatcher (`cp-history-mongo.ts`/`cp-history-postgres.ts`) — the API routes and React components are byte-for-byte unchanged. `cp-history-postgres.ts` reproduces the exact same `CpHistoryListItem`/`CpHistoryDetail` shape, computing config/body diffs from stored snapshots (or, for migrated legacy rows without one, the migrator-preserved original diff).
**Files changed:** `packages/dba/src/cp-history.ts` (rewritten as dispatcher), `cp-history-mongo.ts` (new, relocated), `cp-history-postgres.ts` (new), `cp-history-types.ts` (new, shared read-model types).
**Tested:** Directly via `listCpHistory`/`getCpHistoryEntry` against real migrated data with `DBA_PRIMARY_BACKEND=postgres` — correct items/versions/actors/diffs, cross-repo isolation returns `null`. **Not tested through the actual HTTP/session/browser layer with a second real logged-in user** — same pre-existing gap Story 78/79 already disclosed (no real `test2` fixture user provisioned).
**Status: DONE** (with the disclosed browser/session-layer gap noted above, inherited unchanged from Story 79)

# Task 9 — Local cutover / docker-compose

**Requested:** Postgres 17 in `docker-compose.local.yml`, healthcheck, persistent volume, secrets via env; Mongo CHAD retired locally, Mongo Beeper kept.
**Done:** `postgres` service added (image `postgres:17`, `pg_isready` healthcheck, named volume, `POSTGRES_PASSWORD` required via env); dashboard service's `DBA_PRIMARY_BACKEND` default flipped to `postgres`, `DBA_MONGO_ENABLED` default flipped to `false` (Beeper's `BEEPER_MONGODB_URI` path is separate and unaffected — `mongodb` service stays in the stack for it).
**Files changed:** `docker-compose.local.yml`, `.env.local.example` (+ real `.env.local`, gitignored).
**Tested:** Brought the container up for real (`docker compose ... up -d postgres`), confirmed healthy, applied the schema, ran the full local cutover (see Task 6) against it.
**Status: DONE**

# Task 10 — QNAP

**Requested:** Postgres added to QNAP, no PROD deploy, TEST only if it doesn't touch shared PROD data.
**Done:** `postgres` service added to `docker-compose.qnap.shared.yml` (own volume/credentials, alongside `chad-mongodb`/`beeper-mongodb`, shared between TEST and PROD per the user's clarification mid-Story that Postgres is meant to hold "the same data" for both, matching Mongo's existing topology). **Not started on the real QNAP host and no primary-backend cutover for either environment** — see `06_others_from_report.md` for why a TEST-only cutover was judged unsafe (would split TEST/PROD into two diverging sources of truth) and a full cutover needs a PROD change window, out of this Story's scope.
**Files changed:** `docker-compose.qnap.shared.yml`.
**Tested:** Not deployed/verified against the real QNAP host in this session.
**Status: PARTIAL**

# Task 11 — QNAP TEST full cutover / e2e

**Requested:** `test:integration:daily-dates`/Playwright e2e against QNAP TEST after the cutover.
**Not done.** Blocked on two independent things, neither caused by this Story: (1) Task 10 above — QNAP TEST hasn't cut over to Postgres primary; (2) this environment has no `E2E_TEST3_PASSWORD`/real `MONGO_ROOT_USERNAME`+`MONGO_ROOT_PASSWORD` to reach QNAP TEST at all, even for the pre-existing Mongo-backed e2e suite.
**Status: NOT DONE**
