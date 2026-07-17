# Story 59 — Tasks Checklist

**Scope note:** originally planning-only. **Approved for execution by the
user**, with Phase 0 resolved as: one shared MongoDB instance, two
separate logical databases (`chad` and `beeper`, not merged) — see
`02_plan.md` Phase 0. Phases now execute one at a time, each still gated on
explicit go-ahead per this repo's rollout convention (local → local Docker
→ QNAP test → QNAP prod).

**Task 3's scope was expanded by Input 4** (see `01_input.md`) beyond
Phase 2's original "verify beeper-ws/beeper-sync live" — the user asked for
the entire local runtime to be independent of the standalone `contacts`
repo (config, scripts, indexes, dependency audit), not just a live-sync
smoke test. QNAP (Phases 3-6) is still explicitly untouched.

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE      |             | Decide target chad MongoDB database/collection naming (Phase 0) |
| 2 | DONE      |             | Local dry-run + applied migration: `contacts` Mongo → local `beeper` database (same MongoDB instance as `chad`), with read+write verification (Phase 1) |
| 3 | PARTIAL   |             | Full local independence from `contacts`: migration bugfix (auto-index creation), config/script cleanup, dashboard read+write re-verification, `beeper-ws`/`beeper-sync` preflight verified — live REST sync / live WS event still blocked on Beeper Desktop being open (Phase 2, scope expanded by Input 4) |
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

# Task 3 — Full local independence from `contacts` (scope expanded, Input 4)

**Requested:** Input 4 asked for more than Phase 2's original scope (live
`beeper-ws`/`beeper-sync` verification) — it asked to bring the entire local
Beeper CRM runtime to a state that depends on nothing in the standalone
`contacts` repo: re-verify the migration is clean and idempotent, recreate
indexes as part of the migration (not a manual afterthought), audit and fix
every remaining config/script reference to `contacts`, harden
`bash-scripts/beeper/*.sh` to run entirely from `chad`, re-verify the
dashboard's read+write paths against the migrated database, verify
`beeper-ws`/`beeper-sync` against real Beeper Desktop, and stop (not
delete) the old `contacts` Mongo once `chad` is proven self-sufficient.

**Done:**
- **Migrator hardening** (`bash-scripts/mongo/migrate-contacts-to-chad.mjs`):
  after `--apply`, the script now calls `dba.ensureBeeperIndexes()` itself
  (dynamically importing the built `packages/dba/dist/beeper-crm.js`,
  pointing it at the same `TARGET_URI` the migration just wrote to) instead
  of only printing a "remember to start something once" reminder — indexes
  are no longer a manual, easy-to-forget step. Falls back to a clear
  "run `pnpm dba:build` first" warning (not a crash) if `dist/` doesn't
  exist yet. Fixed a hang (missing `process.exit(0)`, since `dba`'s Mongo
  client singleton is meant to stay open for long-lived callers like the
  dashboard, not a one-shot script).
- **Re-verified the migration end-to-end**: temporarily started `contacts`'s
  own Mongo (`03_scripts/local_run_mongodb.sh`, port 27018 — data volume
  untouched, never removed) purely to re-run the dry-run/apply cycle.
  Dry-run found 1 new `beeper_events` doc that had appeared in the source
  since the last apply (56→57) — a real, useful proof that the script's
  incremental/idempotent behavior works correctly, not just a clean-slate
  case. Applied it (4359/4359, 0 conflicts), then confirmed a fully clean
  re-run: **4359 already present, 0 to insert, 0 conflicts.** Confirmed all
  expected secondary indexes now exist on `contacts`, `channels`,
  `messages`, `timeline_events` (previously only the default `_id_` index
  existed — `ensureBeeperIndexes()` had never actually been invoked by
  anything).
- **Removed/fixed remaining `contacts` dependencies** (repo-wide grep for
  `27018`, `admin123`, `/contacts/`, SvelteKit): the only real one was
  config, not code — `.env.mac-beeper` (gitignored) still pointed
  `MONGODB_URI` at `contacts`'s Mongo on 27018 with its credentials. Fixed
  to point at the local `chad` Mongo (`localhost:27017/beeper`, credentials
  matching root `.env.local`). Also fixed `.env.mac-beeper.example`
  (committed): it documented a QNAP-over-Tailscale `MONGODB_URI` template
  pointed at database `chad` (wrong database — should have been `beeper`
  per the Task 1 decision, never corrected until now) as if that were the
  active default; rewrote it to show the current local-first default, with
  the QNAP form documented as a clearly-labeled future state. The migration
  script's own `CONTACTS_MONGODB_URI` reference to port 27018 was left
  as-is — that one is intentional (it's the migration tool's *source*
  parameter, not a runtime dependency).
- **Hardened `bash-scripts/beeper/*.sh`**:
  - New `health-check-desktop.sh` (mirrors `mongo/health-check-mac.sh`'s
    shape): `GET /v1/app/setup` against `BEEPER_REST_URL` with the API key,
    read-only, never prints the key. Wired into `02_re-start.sh` (before
    starting `beeper-ws`) and `05_sync.sh` (before every mode except
    `--sqlite`, which never calls the REST API) so both fail with a clear
    message instead of a raw `ECONNREFUSED` stack trace when Beeper Desktop
    isn't running.
  - `mongo/health-check-mac.sh`: no longer hard-requires `mongosh` (it
    isn't installed on this Mac at all) — added a Node-based ping fallback
    using the `mongodb` driver already present in
    `packages/beeper-sync/node_modules` when `mongosh` is absent, so the
    application-level ping (not just a bare TCP check) still runs.
  - `04_status.sh`: rewritten from "just the beeper-ws PID + log tail" to
    the full picture — MongoDB reachability + `beeper`/collection counts
    (via the same Node fallback), Beeper Desktop reachability, beeper-ws
    process state, and the last `error`-matching log line if any. No
    secrets printed.
  - Removed stray "@QNAP" wording from error messages in `02_re-start.sh`
    and `05_sync.sh` now that the local Mongo target is the default, not an
    exception.
- **Dashboard read+write re-verification** against the migrated local
  database (container's actual `MONGODB_URI` confirmed via
  `docker exec ... printenv`, not assumed): logged in for real
  (`pawel_f`/real password), `stats` (152/3644/170), contacts list (102),
  inbox (72), merge-suggestions (27), search "br" (10) — all match Task 2's
  prior results exactly. **New this pass:** profile edit (`notes` set then
  cleared), tag add+remove (`business`), timeline event add+delete — all
  round-tripped correctly via authenticated API calls and left no residual
  test data. Also checked an empty-state (nonsense search query → `[]`),
  a 404 (`Contact not found` for a fake ObjectId), and a 401
  (`Unauthorized` with no session cookie) — all correct. Verified via
  direct authenticated HTTP calls to the same routes the browser UI calls
  (no browser-automation tool available in this session) — same
  methodology Story 58/59 Task 2 already used and the user accepted.
- **`beeper-ws`/`beeper-sync` — partially verified, real blocker found**:
  Beeper Desktop (`/Applications/Beeper Desktop.app`) is installed but was
  not running. Attempted `open -a "Beeper Desktop"` twice; no process ever
  appeared (confirmed via `ps`, `osascript`'s System Events process list,
  and `lsof` on port 23373) — GUI apps cannot be reliably launched from this
  automated shell. **What WAS verified**: with `.env.mac-beeper` now
  pointed at the local `chad` Mongo, `02_re-start.sh` correctly passes the
  Mongo health check, then correctly fails fast with a clear message at the
  new Beeper Desktop check (rather than starting a process that would
  crash-loop). `05_sync.sh` likewise fails fast and clean now (previously
  it let `beeper-sync` crash with a raw Node stack trace). **What is
  NOT verified**: an actual incremental REST sync run, and an actual live
  WS event landing in `beeper_events` — both need the user to open Beeper
  Desktop first, then re-run `bash bash-scripts/beeper/05_sync.sh` and
  `bash bash-scripts/beeper/02_re-start.sh`.
- **Stopped the old `contacts` Mongo** (`docker stop mongodb` — container
  and its `mongodb_data`/`mongodb_keyfile` volumes left intact, not
  removed) once the above was confirmed. Confirmed no other `contacts`
  processes were running (no `beeper-ws`/`beeper-sync`/SvelteKit node
  processes, port 5173 free) — there was nothing else to stop.

**Files changed:** `bash-scripts/mongo/migrate-contacts-to-chad.mjs`
(auto-index creation + hang fix), `bash-scripts/mongo/health-check-mac.sh`
(Node-based ping fallback), `bash-scripts/beeper/health-check-desktop.sh`
(new), `bash-scripts/beeper/02_re-start.sh`,
`bash-scripts/beeper/05_sync.sh`, `bash-scripts/beeper/04_status.sh`,
`.env.mac-beeper.example` (committed), `.env.mac-beeper` (gitignored, real
values updated).

**Tested:** as described above — migration re-run to a clean 0/0/0 state,
index verification via `mongosh` inside the Mongo container, full
authenticated dashboard read+write verification with revert, preflight
scripts confirmed to fail safely without Beeper Desktop.

**Status: PARTIAL** — everything local is independent of `contacts` and
verified except the one piece that genuinely requires the user's own
action (opening Beeper Desktop) to finish verifying live sync/WS.

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
