# Story 76 — Tasks Checklist

Planning-only pass so far — every task below is **NOT STARTED**. Listed now
(per the Story standard) so the eventual implementation session has a
concrete checklist to work against, derived from `02_plan.md`.

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | NOT STARTED | | Confirm the two open judgment calls with the user (§3 replica-set tradeoff, §4 TypeScript-port decision, §6 credentials decision) before writing any infra code |
| 2 | NOT STARTED | | Add `beeper-mongodb` service to `docker-compose.qnap.shared.yml` (own volume, own healthcheck, joins `chad-shared` network) — container not yet receiving traffic |
| 3 | NOT STARTED | | Write and dry-run the dump/restore/verify migration script (`02_plan.md` §5) against a **copy** of real data first, not the live QNAP instance directly |
| 4 | NOT STARTED | | Run the real migration on QNAP: dump every `beeper_<repoGuid>` db from `chad-mongodb`, restore into `beeper-mongodb`, verify exact collection counts match before proceeding — leave the source data in `chad-mongodb` untouched |
| 5 | NOT STARTED | | Cut over `BEEPER_MONGODB_URI` in `docker-compose.qnap.test.yml`/`.prod.yml` to the new container, redeploy TEST first, real smoke test (open Beeper CRM as a real user, confirm real contacts/messages appear), only then PROD |
| 6 | NOT STARTED | | Port `packages/history-worker/` into `packages/dba/src/history/` (or keep as `.mjs`, per the confirmed decision), wire into `packages/dashboard/instrumentation.ts` alongside the existing Google Sheets worker start call |
| 7 | NOT STARTED | | Remove the standalone `history-worker` container from `docker-compose.qnap.shared.yml` and its `bash-scripts/dashboard/00_qnap_shared/*` references, only after confirming the embedded version is running and resuming correctly (real restart test: stop the dashboard container, confirm the history worker resumes from its persisted `resumeToken`, not from scratch) |
| 8 | NOT STARTED | | Update `bash-scripts/mongo/backup.sh` (or add a second script) for the new `beeper-mongodb` container |
| 9 | NOT STARTED | | Update docs: new `ai-docs/deploy/` note for this split, `docker-compose.qnap.shared.yml` header comment, `dashboard-deployment-scripts.md` |
| 10 | NOT STARTED | | Leave `beeper_*` databases inside `chad-mongodb` untouched (not dropped) for at least one full deploy cycle as a rollback safety net — track as a deliberate follow-up cleanup, not part of this Story |
