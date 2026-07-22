# Story 76 — Tasks Checklist

Follow-up session (2026-07-22, part 2): real migration executed and TEST
deployed/verified (tasks 4, 5 — TEST half only, per explicit scope: "Nie
wdrażaj PROD"). Task 6/7 (history-worker embedding) stayed explicitly out
of scope and remain untouched.

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE | | §3 replica-set tradeoff: user decided no replica set, code-level Change-Streams removal implemented (`beeper-crm.ts` now polls only; `beeper-oplog/index.mjs`'s `eventsCol.watch()` replaced with a durable-cursor poll loop, `beeper_oplog_state` collection). §4 TypeScript-port and §6 credentials decisions: credentials decided (separate `BEEPER_MONGO_ROOT_USERNAME/PASSWORD`, generated and stored in real `.env.qnap`); TypeScript-port still open (task 6/7, out of scope). |
| 2 | DONE | | `beeper-mongodb` service running on real QNAP — standalone (no replica set), own volume, own healthcheck, own credentials, port 12041. Started via `bash-scripts/dashboard/00_qnap_shared/03_re-start.sh`, confirmed `healthy`. |
| 3 | DONE | | `bash-scripts/mongo/migrate-beeper-mongo-split.sh` — fixed a real bug found via dry-run on QNAP (`declare -A` needs bash 4+, QNAP/macOS both ship bash 3.2 — rewritten with a temp-file lookup). Dry-run then `--execute` both run for real. |
| 4 | DONE | | Real migration executed on QNAP: both `beeper_<repoGuid>` dbs dumped from `chad-mongodb`, restored into `beeper-mongodb`, verified — per-collection counts matched exactly (`beeper_21d11bdc-...`: beeper_events=59, channels=171, contacts=153, messages=3648, sync_state=337, timeline_events=0; `beeper_8b603669-...`: all 0, genuinely empty account, not a bug). Source data in `chad-mongodb` left untouched (confirmed, never deleted). Real backup of `chad-mongodb` (all dbs) taken first via `bash-scripts/mongo/backup.sh`. |
| 5 | DONE (TEST only) | | `BEEPER_MONGODB_URI` cutover deployed to TEST via `bash-scripts/dashboard/08_registry_test/deploy.sh` (3rd attempt succeeded — first two hit a QEMU segfault during `next build` under x86_64 emulation on the build Mac, unrelated to this Story's code, resolved by retry). Real smoke test: `chad-dashboard-test` env confirms `CHAD_ENVIRONMENT=test`, `BEEPER_MONGODB_URI` -> `beeper-mongodb`, zero `GOOGLE_SHEETS_*` vars. Google Sheets worker log: "not started — GOOGLE_SHEETS_ENABLED is not true." Real API reads (constructed session, real repoGuids, read-only) confirmed: `pawel_f`'s `/api/beeper-crm/stats` returns totalContacts=153/totalMessages=3648/totalChannels=171 (exact match to migrated data), `/api/beeper-crm/inbox` returns real contact names/messages; `kamil_s`'s stats correctly all-zero (empty account). CHAD's own data (`/api/views`) and History (`/api/content-provider/history`) both confirmed still reading correctly from `chad-mongodb`. No errors in `chad-dashboard-test`, `chad-mongodb`, or `beeper-mongodb` logs; `chad-dashboard-prod` confirmed still healthy (HTTP 307) after the shared-services restart. **PROD not touched** — still on the old `BEEPER_MONGODB_URI` (`chad-mongodb`), per explicit scope. |
| 6 | NOT STARTED | | Port `packages/history-worker/` into `packages/dba/src/history/` (or keep as `.mjs`, per the confirmed decision), wire into `packages/dashboard/instrumentation.ts` alongside the existing Google Sheets worker start call — explicitly out of scope |
| 7 | NOT STARTED | | Remove the standalone `history-worker` container from `docker-compose.qnap.shared.yml` and its `bash-scripts/dashboard/00_qnap_shared/*` references, only after confirming the embedded version is running and resuming correctly (real restart test: stop the dashboard container, confirm the history worker resumes from its persisted `resumeToken`, not from scratch) — explicitly out of scope |
| 8 | DONE | | `bash-scripts/mongo/backup.sh` already parameterized (`MONGO_CONTAINER_NAME`) — used for real against both `chad-mongodb` and (implicitly, via the migration script) `beeper-mongodb`. |
| 9 | DONE | | Docs: `ai-docs/deploy/2026-07-22_mongodb-chad-beeper-split.md`, `docker-compose.qnap.shared.yml` header comment, `dashboard-deployment-scripts.md` (service list + port table), `ai-docs/begin_here/02_what-and-where.md` Beeper section. |
| 10 | DONE | | `beeper_*` databases inside `chad-mongodb` confirmed still present and untouched after the migration (rollback safety net) — not dropped, not modified. |

## PROD status (unchanged by this session)

`chad-dashboard-prod` still runs its previous image, still uses the old
`BEEPER_MONGODB_URI` (pointing at `chad-mongodb`) — its own env vars are
baked in at container start and are unaffected by the compose-file edits
until it is itself redeployed, which this session deliberately did not
do. Its only exposure to this session's changes was a brief Mongo
reconnect during the shared-services restart (`chad-mongodb`
recreated in place, same data volume) — confirmed healthy afterward (HTTP
307, no errors in its logs since).
