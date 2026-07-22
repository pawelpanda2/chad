# Story 76 — Others (decisions, limitations, follow-ups)

## Open questions, flagged rather than guessed

1. **Is `beeper-crm.ts`'s `db.watch()` currently actually succeeding
   against `chad-mongodb` (which has been a replica set since Story 74),
   or still silently polling?** Not confirmed in this planning pass — would
   need a real QNAP log check (`docker logs chad-dashboard-{test,prod} |
   grep beeper-crm`) during a live session. Directly changes how much the
   "no replica set for beeper-mongodb" recommendation (`02_plan.md` §3)
   actually costs in practice: if it's currently still polling anyway (the
   comment in the code predates rs0 and may just never have been
   revisited), splitting off a standalone `beeper-mongodb` costs nothing
   behaviorally; if it's currently getting real push updates, it's a real,
   user-noticeable regression to slower polling.
2. **`history-worker`'s real resource footprint on QNAP** — not measured
   in this pass. Only reason found in the code/docs that might argue for
   keeping it a separate container (crash/restart isolation from the
   Dashboard) rather than embedding it — the Story's own text asks for
   "concrete technical arguments and risks" if a separate container turns
   out necessary; this is the one live candidate, not yet substantiated
   either way.
3. **Separate vs. shared Mongo admin credentials** for the new
   `beeper-mongodb` container — `02_plan.md` §6 recommends separate
   (least-privilege), but this is a real operational decision (one more
   credential pair to manage in `.env.qnap`) worth the user's explicit
   sign-off rather than a silent default.

## Why implementation didn't proceed further in this session

Three reasons, all pointing the same direction:

- The Story's own input text explicitly asks for a plan + affected-file
  list FIRST, and explicitly says not to implement before checking the
  current data model and QNAP volumes — this document + `03_knowledge.md`
  are exactly that deliverable.
- The user was asleep/unavailable for the remainder of this session — a
  real data migration touching personal Beeper contact/message data on a
  shared QNAP host is exactly the kind of hard-to-reverse,
  shared-infrastructure action that warrants a human read-through of the
  plan before execution, not a fully autonomous overnight run, even under
  a broad standing authorization.
- Earlier the same session, a routine `git push origin main` (needed
  before any QNAP deployment at all, for the unrelated Story 75 work) was
  blocked by this environment's own automated safety classifier — a
  concrete signal that higher-stakes actions in this environment get
  extra scrutiny by design, reinforcing rather than overriding the
  above judgment.

## `04_todos.md` status

Not empty — see that file for the specific open questions blocking the
move from planning to implementation.
