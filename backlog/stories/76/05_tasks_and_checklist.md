# Story 76 — Tasks Checklist

Follow-up session (2026-07-22): infrastructure/code for the container
split is now written (tasks 2, 3, 8, 9 below) — **but the real migration
and cutover (tasks 4, 5) were deliberately NOT executed**, per this
session's own explicit instruction ("Nie wykonuj migracji produkcyjnej
bez zgody"). Task 6/7 (history-worker embedding) stayed explicitly out of
scope for this session and remain untouched.

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE | | §3 replica-set tradeoff: user decided no replica set, code-level Change-Streams removal implemented (`beeper-crm.ts` now polls only; `beeper-oplog/index.mjs`'s `eventsCol.watch()` replaced with a durable-cursor poll loop, `beeper_oplog_state` collection). §4 TypeScript-port and §6 credentials decisions: credentials decided (separate `BEEPER_MONGO_ROOT_USERNAME/PASSWORD`, task 2); TypeScript-port still open (task 6/7, out of scope this session). |
| 2 | DONE | | Added `beeper-mongodb` service to `docker-compose.qnap.shared.yml` — standalone (no replica set), own volume, own healthcheck, own credentials, port 12041. Not yet running on real QNAP (config only). |
| 3 | DONE | | Wrote `bash-scripts/mongo/migrate-beeper-mongo-split.sh` — dump/restore/verify, dry-run by default, requires explicit `--execute`. **NOT run against real data yet**, not even a dry-run against real QNAP (needs the container up first — task 4 prerequisite). |
| 4 | NOT STARTED | | Run the real migration on QNAP: dump every `beeper_<repoGuid>` db from `chad-mongodb`, restore into `beeper-mongodb`, verify exact collection counts match before proceeding — leave the source data in `chad-mongodb` untouched. **Requires separate explicit user approval before running** — not done this session on purpose. |
| 5 | NOT STARTED | | Cut over `BEEPER_MONGODB_URI` in `docker-compose.qnap.test.yml`/`.prod.yml` to the new container (URI already updated in the compose files themselves — this task is the actual redeploy+smoke-test), redeploy TEST first, real smoke test (open Beeper CRM as a real user, confirm real contacts/messages appear), only then PROD |
| 6 | NOT STARTED | | Port `packages/history-worker/` into `packages/dba/src/history/` (or keep as `.mjs`, per the confirmed decision), wire into `packages/dashboard/instrumentation.ts` alongside the existing Google Sheets worker start call — explicitly out of scope for this session |
| 7 | NOT STARTED | | Remove the standalone `history-worker` container from `docker-compose.qnap.shared.yml` and its `bash-scripts/dashboard/00_qnap_shared/*` references, only after confirming the embedded version is running and resuming correctly (real restart test: stop the dashboard container, confirm the history worker resumes from its persisted `resumeToken`, not from scratch) — explicitly out of scope for this session |
| 8 | DONE | | `bash-scripts/mongo/backup.sh` already parameterized (`MONGO_CONTAINER_NAME`) — works for `beeper-mongodb` with no script changes, only different credential env vars (documented in `docker-compose.qnap.shared.yml`'s header comment) |
| 9 | DONE | | Docs: new `ai-docs/deploy/2026-07-22_mongodb-chad-beeper-split.md`, `docker-compose.qnap.shared.yml` header comment updated, `dashboard-deployment-scripts.md` updated (service list + port table), `ai-docs/begin_here/02_what-and-where.md` Beeper section updated |
| 10 | DONE (by design, nothing to do yet) | | `beeper_*` databases inside `chad-mongodb` are untouched — no migration has run yet, so there's nothing to have accidentally dropped. Stays a live requirement once task 4 actually runs. |
