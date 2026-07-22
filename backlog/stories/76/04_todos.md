# Story 76 — Todos

Planning phase complete (`02_plan.md`, `03_knowledge.md`). Nothing
implemented yet — waiting on the user to read the plan, in particular:

- §3: confirm the "no replica set for beeper-mongodb" recommendation
  given the named tradeoff (Beeper CRM live updates degrade to 5s polling
  if `beeper-crm.ts` is currently actually benefiting from `chad-mongodb`'s
  replica set today — not confirmed either way in this planning pass, real
  QNAP log check needed).
- §4: confirm TypeScript-port (into `packages/dba/src/history/`) vs.
  keep-as-plain-`.mjs` for relocating `history-worker` into the Dashboard
  process.
- §6: separate vs. shared Mongo credentials for the new `beeper-mongodb`
  container.

Once confirmed, move to `05_tasks_and_checklist.md` for the actual
implementation, with the same real-data-verification discipline Story 75
used (real counts before/after every step, never "command exited 0"
alone) — this Story touches real personal Beeper contact/message data.
