# Story 81 — Knowledge

- `bash-scripts/common/lib.sh` — `load_qnap_ssh_config`/`run_remote`/
  `run_remote_capture`/`run_remote_script`/`git_deploy_preflight`/
  `read_env_var`/`require_data_path_writable`/`ghcr_*`. Must be sourced via
  `bash` (not the interactive zsh shell — `${!key}` indirect-expansion
  syntax is bash-only and breaks under a plain `source` into zsh).
  `run_remote_script` does `git pull --ff-only` on QNAP before running the
  target script — QNAP's checkout must already have whatever commit you
  want it to run.
- `bash-scripts/dashboard/00_qnap_shared/01_config.sh` —
  `COMPOSE_PROJECT_NAME=chad-shared`, `ENV_FILE=$REPO_ROOT/.env.qnap`,
  `COMPOSE_FILE=docker-compose.qnap.shared.yml`.
- `bash-scripts/dashboard/04_qnap_test/01_config.sh` —
  `COMPOSE_PROJECT_NAME=chad-test`, `ENV_FILE=$REPO_ROOT/.env.qnap` (same
  file as shared!), `DASHBOARD_PORT=12020`.
- `docker-compose.qnap.test.yml` / `docker-compose.qnap.prod.yml` — both
  read `DBA_PRIMARY_BACKEND`/`DBA_MONGO_ENABLED` via `${VAR:-default}` from
  the SAME `.env.qnap` — the reason TEST's Postgres cutover must NOT be
  expressed as a plain env-var default in that shared file (see
  `02_plan.md`).
- `bash-scripts/dashboard/00_qnap_shared/03_re-start.sh` — full-stack
  restart (`down` then `up -d` for the whole compose project) — briefly
  interrupts chad-mongodb/beeper-mongodb for BOTH TEST and PROD. Story 81
  must never call this; use a scoped `docker compose ... up -d postgres`
  instead (a new service, no existing container touched).
- `bash-scripts/dashboard/00_qnap_shared/04_end.sh` — `down
  --remove-orphans`, never `-v` — data preserved.
- `bash-scripts/dashboard/08_registry_test/deploy.sh` — fastest TEST
  deploy path: builds+pushes the image on the LOCAL Mac (not QNAP's weak
  hardware), QNAP only pulls+retags+restarts via the existing
  `04_qnap_test/03_re-start.sh`/`05_status.sh`. Requires `GHCR_PUSH_*` in
  `.env.local` and `GHCR_READ_*` in `.env.qnap` (both already present).
  `git_deploy_preflight` is interactive (`read -r -p`) — pipe `"d"` to
  auto-select "skip commit, deploy from upstream as-is" when local
  uncommitted changes exist that shouldn't be committed (e.g. another
  session's `ai-docs/audit/`).
- `packages/dba/src/data-providers/config.ts` — `DBA_POSTGRES_ENABLED`,
  `DBA_PRIMARY_BACKEND` (now accepts `"postgres"`, Story 80).
- `packages/dba/src/data-outbox-worker.ts` — fully implemented/tested
  (`processOutboxJobsOnce`/`drainOutboxOnce`/`runOutboxWorker`) but never
  wired into a process (Story 72 gap, still open going into this Story) —
  imports only from the `data-outbox.ts` dispatcher (Story 80), so it's
  already backend-agnostic.
- `packages/dba/src/google-sheets/bootstrap.ts` +
  `packages/dashboard/instrumentation.ts` — the exact pattern to mirror for
  wiring the data-sync worker: `startXIfEnabled()`, idempotent against
  repeated calls, called once at server startup.
- `packages/dba/scripts/migrate-mongo-to-postgres.mjs` /
  `cp-postgres-integrity-check.mjs` — Story 80's migrator/checker, already
  support `--repoGuid=<guid>` scoping (never use `--all` against QNAP's
  real shared Mongo in this Story).
- `packages/dba/src/testing/test3-guard.ts` — existing
  `TEST3_REPO_GUID`/`TEST3_USERNAME` constants and
  `assertTest3Scoped`/`FORBIDDEN_OPERATIONS` denylist, used by the
  Playwright/provisioning scripts — the authoritative source for test3's
  real repoGuid, not something to re-derive independently.
- `test/support/qnap-env.mjs` — `loadQnapEnv()`, `QNAP_TAILSCALE_HOST
  = 100.117.139.83`, `getTest3Password()` reads `E2E_TEST3_PASSWORD` (not
  present in this environment as of Story 80 — same blocker carries into
  this Story unless the user supplies it).
- `ai-docs/deploy/shared-qnap-services.md`, `qnap-data-path.md` —
  shared-services conventions, the tmpfs-vs-real-volume tripwire
  (`require_data_path_writable`).
