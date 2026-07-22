# Story 76 — Todos

Planning phase complete (`02_plan.md`, `03_knowledge.md`). Nothing
implemented yet — waiting on the user to read the plan, in particular:

- §3: confirm the "no replica set for beeper-mongodb" recommendation
  given the named tradeoff. **Resolved (real QNAP check, this session):**
  no live `[beeper-crm]` log line exists on either dashboard container
  since their last restart (nobody opened the Beeper CRM live view since
  then), but confirmed architecturally instead — `chad-mongodb`'s `rs0` is
  live and healthy (confirmed via real replica-set-only query behavior in
  its logs), and Change Streams are a server-level capability, so
  `db.watch()` in `beeper-crm.ts` structurally succeeds today whenever the
  live view is open. The tradeoff is now confirmed, not hypothetical:
  splitting `beeper-mongodb` off without a replica set **would** degrade
  Beeper CRM live updates from instant to up-to-5s-stale polling. Still
  recommend no replica set (ops simplicity), but this needs the user's
  explicit sign-off knowing it's a real, not theoretical, regression.
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
