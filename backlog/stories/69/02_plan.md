# Story 69 — Plan: Beeper CRM migration to QNAP TEST

Adopted directly from the user's own numbered "ETAP" list in `01_input.md`,
plus one added principle: **from this Story on, all data migrations must be
idempotent** — re-running a migrator must never create duplicates or alter
already-migrated data. `bash-scripts/mongo/migrate-contacts-to-chad.mjs`
already satisfies this (insert-only, `_id`-preserving, skip-if-exists) —
reused as-is for QNAP, no script changes needed for idempotency.

## Etap 1 — Audit QNAP TEST (read-only, no changes)

Done — see `03_knowledge.md` for full findings. Summary: target Mongo is
completely empty (no `beeper` or `chad` database exists yet), no naming
collision, no other Mongo instance found on the host. Two facts surfaced
that change the risk picture and are flagged for explicit user
confirmation before proceeding (see `06_others_from_report.md`):
architecture-level TEST/PROD Mongo sharing, and TEST dashboard currently
having zero Beeper wiring (same starting gap as local Story 58).

## Etap 2 — Backup QNAP Mongo before any write

Use `bash-scripts/mongo/backup.sh` (already present on the QNAP checkout,
confirmed in Etap 1) against `chad-mongodb`. Confirm location, size, and
the exact restore command before touching anything else.

## Etap 3 — Dry-run migration (local Mac → QNAP TEST)

Source: local Mac `beeper` database (the one Story 59 already migrated
`contacts` into). Target: QNAP `chad-mongodb`, database `beeper`
(reached over Tailscale or via the QNAP-side script itself — TBD in
Etap 3 execution, see `03_knowledge.md`). Same
`migrate-contacts-to-chad.mjs` script, dry-run mode. STOP if anything
looks suspicious (unexpected existing docs, unexpected conflicts).

## Etap 4 — Apply (only if dry-run is clean)

`--apply` against QNAP TEST's `beeper` database only. Compare source vs
target counts per collection afterward — must match exactly.

## Etap 5 — Indexes

Confirm `ensureBeeperIndexes()` ran (the migration script now does this
automatically as of Story 59 — see `bash-scripts/mongo/migrate-contacts-to-chad.mjs`).
List all indexes actually present.

## Etap 6 — Dashboard TEST

Wire `MONGODB_URI` into `docker-compose.qnap.test.yml`'s `dashboard`
service (currently absent entirely — confirmed in Etap 1, same gap Story
58 found and fixed in `docker-compose.local.yml`). Rebuild + redeploy TEST
only (never PROD — `docker-compose.qnap.prod.yml` stays untouched). Verify
contacts/detail/inbox/search/merge-suggestions/stats against real QNAP
data.

## Etap 7 — Runtime: repoint Mac beeper-ws/beeper-sync at QNAP

Change `.env.mac-beeper`'s `MONGODB_URI` to point at QNAP over Tailscale
(matches the pre-existing QNAP form already documented in
`.env.mac-beeper.example` since Story 59). `beeper-oplog` stays off — it's
gated on the replica-set decision, separate from this Story.

## Etap 8 — Live test

Incremental sync (no `--force`) against the QNAP target; verify
`sync_state` usage, no duplicates, real message/event growth, dashboard
TEST reflects it.

## Etap 9 — SSE

Verify SSE on TEST behaves like local: QNAP Mongo is standalone (`mongo:4.4`,
no replica set — confirmed in Etap 1), so this directly exercises the
Story 59 `subscribeToBeeperChanges()` polling-fallback fix on a second,
independent environment.

## Etap 10 — Explicitly out of scope

`beeper-oplog` and the MongoDB replica-set migration — separate Story,
not re-litigated here.

## Etap 11 — Final report

Per the user's own list: source/target counts, indexes, containers,
images, ports, dashboard/sync/ws/sse status, backup location, commits.

## Hard stop conditions (from the user's own prompt, honored as-is)

- Target `beeper`/`chad` database on QNAP TEST is not empty, or there is
  any risk of overwriting real user data → STOP, report, wait for decision.
- Dry-run (Etap 3) shows anything suspicious → STOP.
- No `--force` sync, ever, in this Story.
- PROD (`docker-compose.qnap.prod.yml`, `chad-dashboard-prod`) is never
  touched.
- No data deletion, anywhere.
