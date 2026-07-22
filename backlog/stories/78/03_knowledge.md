# Story 78 — Knowledge

- `TEST3_REPO_GUID = "5a9c8b7d-6e5f-4a3b-2c1d-0e9f8a7b6c5d"` — real, already
  assigned in `chad_admin/users/users-list` (confirmed via a read-only
  script against QNAP's real Mongo, deleted after use). No cp_items root
  repo existed for it before this Story — lazily created by the same
  `PostByNames`/`PostParentItem` mechanism every other user's first write
  already relies on (`human-docs/.../chad-user-data-isolation.md` §7).
- Connecting to QNAP's real Mongo from a host (non-Docker) process requires
  `mongodb://<user>:<pass>@100.117.139.83:12040/chad?authSource=admin&directConnection=true`
  — see `bash-scripts/dashboard/03_local_mac_docker/01_config.sh` lines
  48-70 for why `directConnection=true` is mandatory (rs0's self-reported
  member address is the Docker-internal hostname `chad-mongodb`, unreachable
  from outside QNAP's network). `MONGO_ROOT_USERNAME`/`MONGO_ROOT_PASSWORD`
  come from `.env.local`/`.env.qnap` (gitignored).
- `cp_history_state` (`chad.cp_history_state`, `_id: "cp_history_worker"`)
  is a **global singleton**, not per-user — this is why worker-restart/
  readiness/resume-token-loss tests must run against local Mongo, never
  QNAP TEST's real shared worker (see `02_plan.md` §1).
- `packages/history-worker/index.mjs` has no build step (plain ESM, no
  `tsc`) — any refactor for testability must keep working the same way when
  run directly by Node, not just under a test runner.
- `deleteDailyEntry` (`packages/dba/src/leads.ts:1590`) is the pattern to
  mirror exactly for the new `deleteDateEntry` — Mongo-only real delete,
  throws (never a fake success) when only the Content-Provider backend is
  active, enqueues a Sheets tombstone job after the real delete succeeds.
- Google Sheets: `test3`'s own real, dedicated spreadsheet —
  `1d_u_uRa0LILtksc25ATt--jh11mZDm7ABGyjAQuTdIc` (given directly by the
  project owner, already shared with the service account). Sheets
  integration tests write here directly (via the real `sheets-api-client.ts`
  + `mapper.ts`, invoked from the test process, never through the disabled
  TEST-deployment auto-worker/production-guard path) — never `pawel_f`'s/
  `kamil_s`'s real spreadsheets, never a fake in-memory client for this
  specific check (a fake client is still fine for pure mapper/layout unit
  tests that don't need network I/O, same as the pre-existing
  `google-sheets/*.test.ts` files already do).
- QNAP TEST deploy: `bash-scripts/dashboard/06_qnap_test_ssh/06_deploy.sh`
  only (git preflight — refuses on uncommitted/unpushed changes — then
  build+restart+status on the QNAP host). Never a raw `docker`/`ssh mongosh`
  one-liner against shared infra — one such attempt this session was
  correctly blocked by the permission classifier; the user chose "Node
  script via packages/dba" as the standing approach for any further real-
  Mongo inspection/provisioning this Story needs.
- Existing test files (19, listed in `02_plan.md` §0) are self-executing
  `tsc && node dist/x.test.js` — no Vitest/Jest config exists yet anywhere
  in the repo. New harness must either adopt one runner for everything or
  keep these callable from the same root script without rewriting them
  (Input 1 §9 — don't rewrite for aesthetics).
