# Story 81 — Plan

## Context

Story 80 built PostgreSQL support (schema, `PostgresCpProvider`, trigger
history, migrator, integrity checker, backend dispatchers) and cut LOCAL
dev over to it, but QNAP was never touched. This Story does the real QNAP
TEST cutover: start Postgres selectively on the shared QNAP host, migrate
only `test3`'s data (never other users' real repos), flip TEST's env to
Postgres primary without touching PROD's env, and close two things Story
80 left incomplete: the data-sync outbox worker was never wired into a
running process, and there was no guard preventing a Postgres-primary TEST
from silently creating divergent data for a non-`test3` repo.

## Finding during verification (changes scope)

QNAP's checked-out repo and both running dashboard images (TEST and PROD)
are on commit `6eeb9b5` ("feat(story-78)") — three Stories behind `main`.
Neither has Story 79's transactional-Mongo history rewrite nor Story 80's
Postgres code at all. Confirmed with the user: deploy current `main` to
TEST first (`bash-scripts/dashboard/08_registry_test/deploy.sh` — build
locally, push to GHCR, QNAP only pulls+retags+restarts, no QNAP-side
build), verify Story 79's mechanism for real on TEST, then continue with
the Postgres-specific work below. PROD is not touched by this step (no
build/restart triggered for it).

## TEST/PROD env isolation — the critical safety property

Both `docker-compose.qnap.test.yml` and `docker-compose.qnap.prod.yml`
read `DBA_PRIMARY_BACKEND`/`DBA_MONGO_ENABLED` from the SAME env var names,
out of the SAME `.env.qnap` file (`ENV_FILE=.env.qnap` for both TEST's and
shared's `01_config.sh`). Writing `DBA_PRIMARY_BACKEND=postgres` into
`.env.qnap` would silently apply to PROD too, the next time anyone
restarts/redeploys PROD — a delayed, silent violation of "nie zmieniaj
PROD na PostgreSQL", not an immediate one, but no less real. Fix: the
Postgres cutover values are hardcoded directly inside
`docker-compose.qnap.test.yml` (no `${VAR:-default}` reads for these
specific keys), so TEST's cutover has zero dependency on any shared env
var PROD's compose file also happens to read. `POSTGRES_URI` itself does
need the real password from `.env.qnap` — safe to add there under a name
(`POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB`) that
`docker-compose.qnap.prod.yml` never references at all, so its presence in
the shared file has zero effect on PROD's interpolation.

## TEST-restricted-to-test3 guard

New: `packages/dba/src/data-providers/repo-allowlist-guard.ts` — when
`DBA_POSTGRES_REPO_ALLOWLIST` is set (comma-separated repoGuids), any
`executeWrite`/`deleteItem` for a different repoGuid throws a clear,
typed error (`RepoNotAllowlistedError`) instead of silently creating a new
island of data. Wired into `PostgresCpProvider` itself (not the router),
so it applies regardless of call path. Unset in every environment except
QNAP TEST during this migration window (local dev and QNAP TEST's future
full-cutover state both leave it unset — this is specifically a transition
safety net for "only test3 exists in Postgres so far").

## data-outbox-worker wiring

Mirrors how the Google Sheets worker is already started
(`google-sheets/bootstrap.ts`, called once from
`packages/dashboard/instrumentation.ts`): a new
`packages/dba/src/data-outbox-bootstrap.ts` with
`startDataOutboxWorkerIfEnabled()`, gated by `DBA_DATA_OUTBOX_WORKER_ENABLED`
(default false — opt-in, so this doesn't silently start running everywhere
Story 80's dispatcher already exists). Started from the same
`instrumentation.ts` hook. Runs in-process (no separate container), reuses
`data-outbox-worker.ts`'s existing, already-tested `drainOutboxOnce`/
`runOutboxWorker` — already backend-dispatcher-aware via `data-outbox.ts`,
so it works against whichever backend is primary without change.

## Migration scope

`migrate-mongo-to-postgres.mjs --repoGuid=<test3-guid>` only — never
`--all` against QNAP's real shared Mongo. Dry-run first, review the report,
then `--apply`. Integrity checker + a manual Mongo-vs-Postgres count/hash
comparison afterward, scoped to test3's repoGuid only.

## Verification-first discipline

Every command in `05_tasks_and_checklist.md` is the actual command run
against the real QNAP host, with its actual output/exit code — never a
claimed "PASS" without having run it. Where a step is blocked (e.g.
missing E2E credentials for Playwright), it's recorded as NOT DONE with
the reason, not silently skipped.
