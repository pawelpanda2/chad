# Story 59 — Tasks Checklist

**Scope note:** this Story is planning-only, per the user's explicit
request ("zacznij planowac... opiszesz taski i plan potrzebny"). No
implementation work has started. Every row below is a **planned future
task**, not a completed one — this checklist doubles as the roadmap the
user asked for. Statuses will move from `NOT DONE` as each phase is
actually executed in a future Story.

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | NOT DONE  |             | Decide target chad MongoDB database/collection naming (Phase 0) |
| 2 | NOT DONE  |             | Local dry-run + applied migration: `contacts` Mongo → local `chad` Mongo, with read+write verification (Phase 1) |
| 3 | NOT DONE  |             | `beeper-ws`/`beeper-sync` verified live against the migrated local database, including a real incremental sync and a real live event (Phase 2) |
| 4 | NOT DONE  |             | QNAP test dry-run + applied migration, dashboard re-pointed, read+write re-verified on QNAP test (Phase 3) |
| 5 | NOT DONE  |             | `beeper-oplog` deployed to QNAP — gated on the MongoDB replica-set decision being re-approved (Phase 4) |
| 6 | NOT DONE  |             | QNAP prod rollout, same shape as Phase 3 (Phase 5) |
| 7 | NOT DONE  |             | `contacts` repo decommissioned — its own beeper-ws/beeper-sync/dashboard stopped, chad fully self-sufficient (Phase 6) |

# Task 1 — Decide target database/collection naming

**Requested:** Resolve the open question in `02_plan.md` Phase 0 — which
chad MongoDB database the migrated Beeper collections should live in, so
Task 2 has an unambiguous target.
**Plan:** Present the recommendation from `02_plan.md` (single shared chad
database, not a separate `beeper` database) to the user for a one-line
confirmation before Task 2 starts.
**Status: NOT DONE**

# Task 2 — Local dry-run + applied migration with read+write verification

**Requested:** See `02_plan.md` Phase 1 — prove the existing
`migrate-contacts-to-chad.mjs` script produces a correct, complete copy
locally, then verify both reads (as Story 58 already did, but against
migrated data this time) and writes (profile edit, tags, timeline events,
merge — none of which Story 58 exercised) against it.
**Plan:** Detailed step list in `02_plan.md` Phase 1.
**Status: NOT DONE**

# Task 3 — beeper-ws/beeper-sync live against migrated data

**Requested:** See `02_plan.md` Phase 2 — confirm the migrated
`sync_state` cursor data is actually usable (incremental sync doesn't
re-pull everything or duplicate), and a real live Beeper event lands
correctly via `beeper-ws`.
**Plan:** Detailed step list in `02_plan.md` Phase 2.
**Status: NOT DONE**

# Task 4 — QNAP test migration + re-verification

**Requested:** See `02_plan.md` Phase 3 — repeat the local migration
against QNAP's real `chad-mongodb` (test range), re-point the QNAP test
dashboard, re-verify.
**Plan:** Detailed step list in `02_plan.md` Phase 3.
**Status: NOT DONE**

# Task 5 — beeper-oplog on QNAP

**Requested:** See `02_plan.md` Phase 4 — explicitly gated on the
MongoDB replica-set decision, which this Story does not re-decide.
**Plan:** Add a `beeper-oplog` compose service once the replica set exists;
verify against a small controlled test event before trusting it live.
**Status: NOT DONE — blocked on a separate, pre-existing decision**

# Task 6 — QNAP prod rollout

**Requested:** See `02_plan.md` Phase 5 — same shape as Task 4, against
prod, after a stability period on test.
**Plan:** Mirror Task 4's steps against the prod environment.
**Status: NOT DONE**

# Task 7 — Decommission `contacts`

**Requested:** See `02_plan.md` Phase 6 — stop relying on the standalone
`contacts` repo for anything live once `chad` is fully self-sufficient.
**Plan:** Stop `contacts`'s own beeper-ws/beeper-sync; decide with the user
whether to keep its Mongo as a temporary read-only backup or archive it.
**Status: NOT DONE**
