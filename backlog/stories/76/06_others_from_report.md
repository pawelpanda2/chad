# Story 76 — Others (decisions, limitations, follow-ups)

## Open questions, flagged rather than guessed

1. **RESOLVED (real QNAP check, this session).** Is `beeper-crm.ts`'s
   `db.watch()` currently actually succeeding against `chad-mongodb`
   (which has been a replica set since Story 74), or still silently
   polling? `docker logs chad-dashboard-{test,prod} | grep beeper-crm`
   returned nothing on either container — nobody has opened the Beeper CRM
   live view since either container's last restart (test:
   2026-07-21T19:26 UTC, prod: 2026-07-19T15:57 UTC), so this could not be
   observed directly via a log line. Confirmed architecturally instead: a
   concurrent `mongodump` run's query logs on `chad-mongodb` show
   `readPreference: "primaryPreferred"` and `ReplicationStateTransition`
   lock acquisitions — both exclusive to an active replica set, never seen
   on a standalone `mongod` — confirming `rs0` is live and healthy right
   now. MongoDB Change Streams are a server/replica-set-level capability,
   not per-database, so `beeper_<repoGuid>` databases hosted on that same
   physical instance mean `db.watch()` structurally succeeds today
   whenever the live view is actually open — i.e. it is genuinely using
   live change streams, not the polling fallback. This makes the "no
   replica set for beeper-mongodb" tradeoff (`02_plan.md` §3) a confirmed,
   real, user-noticeable regression if adopted (instant updates degrade to
   up-to-5s-stale polling), not a hypothetical one.
2. **RESOLVED (real QNAP check, this session).** `history-worker`'s real
   resource footprint on QNAP: `docker stats --no-stream` showed 45.3MiB
   RAM (0.59% of host limit), 0.23% CPU, 12 PIDs, 0 restarts since a ~9h
   uptime at check time — negligible, smaller than either Dashboard
   container. No resource-footprint argument survives for keeping
   `history-worker` a separate container; the only remaining argument is
   crash/restart isolation from the Dashboard process, a qualitative
   tradeoff worth naming to the user, not a technical blocker.
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
