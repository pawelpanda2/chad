# Story 76 — Knowledge

Pointers needed to work on this Story's area, and why.

- `ai-docs/begin_here/01_ai_start.md`, `02_what-and-where.md`,
  `03_story-standard.md`, `04_deployment-rules.md` — global reading order,
  index, Story format, and the mandatory "read the scripts/docs, never a
  bare `docker`/`docker compose` command" rule for anything touching QNAP.
- `docker-compose.qnap.shared.yml` — the CURRENT single-Mongo setup: one
  `mongodb` service (`chad-mongodb`, `mongo:4.4`, single-node replica set
  `rs0`, keyfile auth via `mongo-keyfile-init`, `mongo-rs-init` idempotent
  bootstrap), plus `history-worker` (separate container, depends on
  `mongodb: service_healthy`). This is the file Story 76 needs to split.
- `ai-docs/deploy/2026-07-10_mongodb-replica-set-migration-plan.md` — the
  original plan for enabling `rs0` on `chad-mongodb` (Story 74's
  prerequisite), including the gating precondition that motivated waiting:
  "packages/beeper-oplog exists in this monorepo" — i.e. the replica set
  was enabled specifically for `cp_history`'s change streams, with
  `beeper-oplog`'s own future replica-set need already anticipated as a
  reason NOT to revert it later — directly relevant to this Story's
  "does beeper-mongodb need a replica set" question (§ below).
- `ai-docs/deploy/qnap-data-path.md` — the real incident (Mongo on a 16MB
  tmpfs) that established `QNAP_CONTAINER_DATA_PATH` +
  `require_data_path_writable` as the validated pattern any NEW persistent
  volume (a second Mongo instance's data dir) must follow — reuse the
  pattern, don't invent a new one.
- `ai-docs/deploy/dashboard-deployment-scripts.md` — full deployment
  contract (shared/test/prod split, `00_qnap_shared/*.sh` owns Mongo
  start/stop, `require_shared_services_healthy` preflight TEST/PROD depend
  on). A second Mongo container is another `00_qnap_shared`-owned service,
  same pattern as the first.
- `packages/dba/src/mongo.ts` — `getMongoDb()` (chad db, from
  `MONGODB_URI`) and `getBeeperMongoDb(repoGuid)` (`beeper_<repoGuid>`,
  from `BEEPER_MONGODB_URI`, Story 73) are ALREADY two separate connection
  functions/env vars pointing at what is currently the SAME physical
  `chad-mongodb` container — the connection-string layer is already
  cleanly separated per-purpose; only the physical container needs
  splitting, not the application code's own data-access boundary.
- `packages/history-worker/index.mjs` — the `cp_items` change-stream
  consumer this Story must relocate. Already durable/idempotent/resumable
  by design (see §"history-worker" in `02_plan.md`) — the 4 conditions the
  Story's own input lists as requirements were already satisfied BEFORE
  this Story, confirmed by reading the file, not assumed.
- `packages/beeper-oplog/index.mjs` — a SEPARATE, NOT-currently-deployed
  change-stream consumer for `beeper_*` databases (`eventsCol.watch(...)`)
  — its own `package.json` says "NOT deployed yet"; confirmed absent from
  every `docker-compose*.yml` service list (only appears in a comment).
  Directly relevant to whether `beeper-mongodb` needs a replica set (it
  doesn't, TODAY, because nothing requiring one is actually running).
- `packages/dba/src/beeper-crm.ts` (~line 1064-1120) — the Beeper CRM
  SSE live-update mechanism. PREFERS `db.watch()` (needs a replica set) but
  has a real, already-implemented, already-tested fallback to 5s polling
  when unavailable (confirmed by reading the try/catch — `db.watch()`
  against a standalone Mongo doesn't throw synchronously, the code
  specifically handles the async error event). This is the ONE currently
  -deployed consumer of `beeper_*` data that would notice a replica-set
  regression (poll-degraded, not broken) if `beeper-mongodb` is split off
  as a standalone (non-replica-set) instance — see plan §3 for the
  recommendation and the honest tradeoff.
- `bash-scripts/mongo/rs-init.js`, `bash-scripts/mongo/backup.sh` — the
  existing replica-set bootstrap script and logical-backup script for
  `chad-mongodb`; a new `beeper-mongodb` needs its own backup script (same
  pattern, different container name/target), and — only if a replica set
  is ever added to it later — its own `rs-init.js`-equivalent.
- `.env.qnap.example` — `MONGO_ROOT_USERNAME`/`MONGO_ROOT_PASSWORD` (one
  shared admin credential pair for `chad-mongodb` today) — Story 76 needs
  to decide whether `beeper-mongodb` reuses the same credentials or gets
  its own (recommendation in `02_plan.md`).
- `docker-compose.qnap.test.yml`/`docker-compose.qnap.prod.yml` — both
  dashboards' `MONGODB_URI`/`BEEPER_MONGODB_URI` env vars currently both
  point at `chad-mongodb:27017` (same container, different db name via
  driver-level `.db(name)` calls) — `BEEPER_MONGODB_URI` is the one that
  needs to change to the new container's `container_name`.
- `docker-compose.local.yml` — the LOCAL dev stack intentionally keeps one
  shared `mongodb` service for chad+beeper (no need to split locally, per
  its own existing comment "locally there's no need to separate TEST/PROD
  — that split is QNAP-only"); confirm whether this Story should split
  local too for dev/prod parity, or deliberately leave local alone (plan
  §6 recommends: leave local alone, out of scope, unless requested).
