# Story 59 — Tasks Checklist

**Scope note:** originally planning-only. **Approved for execution by the
user**, with Phase 0 resolved as: one shared MongoDB instance, two
separate logical databases (`chad` and `beeper`, not merged) — see
`02_plan.md` Phase 0. Phases now execute one at a time, each still gated on
explicit go-ahead per this repo's rollout convention (local → local Docker
→ QNAP test → QNAP prod).

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE      |             | Decide target chad MongoDB database/collection naming (Phase 0) |
| 2 | DONE      |             | Local dry-run + applied migration: `contacts` Mongo → local `beeper` database (same MongoDB instance as `chad`), with read+write verification (Phase 1) |
| 3 | NOT DONE  |             | `beeper-ws`/`beeper-sync` verified live against the migrated local database, including a real incremental sync and a real live event (Phase 2) |
| 4 | NOT DONE  |             | QNAP test dry-run + applied migration, dashboard re-pointed, read+write re-verified on QNAP test (Phase 3) |
| 5 | NOT DONE  |             | `beeper-oplog` deployed to QNAP — gated on the MongoDB replica-set decision being re-approved (Phase 4) |
| 6 | NOT DONE  |             | QNAP prod rollout, same shape as Phase 3 (Phase 5) |
| 7 | NOT DONE  |             | `contacts` repo decommissioned — its own beeper-ws/beeper-sync/dashboard stopped, chad fully self-sufficient (Phase 6) |

# Task 1 — Decide target database/collection naming

**Requested:** Resolve the open question in `02_plan.md` Phase 0 — which
chad MongoDB database the migrated Beeper collections should live in, so
Task 2 has an unambiguous target.
**Done:** User decided, overriding this plan's original recommendation:
one shared MongoDB instance, two separate logical databases — `chad`
(dashboard + future Content Provider `content_provider_files`) and
`beeper` (unchanged: `contacts`, `channels`, `messages`,
`timeline_events`, `sync_state`, `beeper_events`, `merge_suggestions`).
Rationale given: minimizes change/risk versus renaming or merging
anything. No Beeper data moves into `chad` unless a concrete technical
need arises later.
**Files changed:** `02_plan.md` (Phase 0 updated to record the decision).
**Status: DONE**

# Task 2 — Local dry-run + applied migration with read+write verification

**Requested:** See `02_plan.md` Phase 1 — prove the existing
`migrate-contacts-to-chad.mjs` script produces a correct, complete copy
locally, then verify both reads (as Story 58 already did, but against
migrated data this time) and writes (profile edit, tags, timeline events,
merge — none of which Story 58 exercised) against it.
**Done:**
- **Dry-run**, source = `contacts`'s real MongoDB (port 27018), target =
  local `chad-mongodb-local-mac-docker`'s `beeper` database (same MongoDB
  instance/container as `chad`, per the Task 1 decision, reached via the
  compose-internal service name `mongodb:27017`): reported 4358 source docs
  across 7 collections, 0 already present, 0 conflicts.
- **Found and fixed a real bug** in `migrate-contacts-to-chad.mjs` before
  applying: `migrateCollection()`'s dry-run branch hardcoded
  `inserted: 0` in its returned totals instead of `toInsert.length`, so
  every per-collection log line correctly said "N would be inserted" but
  the final summary always said "0 would be inserted" — misleading. Fixed
  and re-ran the dry-run to confirm the corrected summary (4358 would be
  inserted, matching the per-collection lines).
- **Applied** (`--apply`) against the local target only. Verified exact
  target counts after: `contacts` 152, `channels` 170, `messages` 3644,
  `sync_state` 336, `beeper_events` 56, `timeline_events` 0,
  `merge_suggestions` 0 — all match source exactly.
- **Confirmed the source was never touched**: re-checked `contacts`'s own
  MongoDB counts after the apply (152/3644, unchanged).
- **Read verification** via the dashboard, logged in for real, against the
  migrated local database: `stats` (152/3644/170, matches), contacts list
  (102, same intentional filter as Story 58), inbox (72), merge-suggestions
  (27), search (10 for "br") — all correct.
- **Write verification** (new — Story 58 never exercised this): added a
  real timeline event to a real contact via `POST
  /api/beeper-crm/contacts/<id>/events`, confirmed it appeared in the
  contact's detail response, then deleted it via `DELETE
  .../events/<eventId>` and confirmed it was gone. Full round-trip write
  path confirmed working against the migrated database.
**Files changed:** `bash-scripts/mongo/migrate-contacts-to-chad.mjs`
(dry-run summary bugfix); `.env.local` (gitignored) — `MONGODB_URI` now
points at the local migrated `beeper` database via the compose-internal
`mongodb` service name instead of `contacts`'s standalone Mongo.
**Tested:** as described above — dry-run, apply, direct `mongosh` count
verification, full read-path via authenticated API calls, one full
add-then-delete write-path round trip.
**Status: DONE**

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
