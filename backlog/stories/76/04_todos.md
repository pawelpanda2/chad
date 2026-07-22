# Story 76 — Todos

Planning phase complete (`02_plan.md`, `03_knowledge.md`). Nothing
implemented yet — waiting on the user to read the plan, in particular:

- §3: **DECIDED by the user (2026-07-22), implemented same session.** No
  replica set for `beeper-mongodb`, ever — Change Streams ruled out
  entirely, periodic `mongodump` backups instead. The confirmed
  instant-vs-polling tradeoff (real QNAP check: `chad-mongodb`'s `rs0` is
  live/healthy, so `db.watch()` in `beeper-crm.ts` was structurally
  succeeding whenever the CRM live view was open) was accepted knowingly.
  `beeper-crm.ts`'s `subscribeToBeeperChanges()` now polls only (the
  `db.watch()` code path is gone, not just unreachable);
  `beeper-oplog/index.mjs`'s `eventsCol.watch(...)` (the one Beeper
  Change-Streams consumer with no prior fallback) replaced with a
  durable-cursor poll loop (`beeper_oplog_state` collection, mirrors
  `history-worker`'s resume-token pattern). See `02_plan.md` §3 for the
  full before/after.
- §4: confirm TypeScript-port (into `packages/dba/src/history/`) vs.
  keep-as-plain-`.mjs` for relocating `history-worker` into the Dashboard
  process. (Resource footprint is no longer a factor either way — see next
  item.)
- §6: separate vs. shared Mongo credentials for the new `beeper-mongodb`
  container.

Once confirmed, move to `05_tasks_and_checklist.md` for the actual
implementation, with the same real-data-verification discipline Story 75
used (real counts before/after every step, never "command exited 0"
alone) — this Story touches real personal Beeper contact/message data.
