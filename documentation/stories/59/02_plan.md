# Story 59 — Plan: real Mongo integration + package runtime integration

This Story is **planning only** — no implementation happens in it yet,
per the user's explicit request. It picks up exactly where Story 58 left
off: Story 58 proved the `chad` Beeper GUI is a correct, working
replacement for the old `contacts` dashboard, but only by reading
`contacts`'s own standalone MongoDB as-is, over `host.docker.internal`. It
deliberately did not migrate any data or deploy any of the Beeper packages
for real. This Story plans that remaining work.

## Goal

Two distinct goals the user named, which turn out to be one connected
sequence:

1. **"Zintegrować to do mongo content providera"** — make the Beeper data
   live in `chad`'s own shared MongoDB instance (the same instance the
   Content Provider's own `content_provider_files` model will eventually
   use), instead of continuing to depend on `contacts`'s separate, standalone
   Mongo. See `03_knowledge.md` for why this means "coexisting collections
   in one instance", not "reshaping Beeper docs into the CP-file model" —
   those are structurally different kinds of data.
2. **"Zintegrować package do repo chad"** — make `beeper-ws`, `beeper-sync`,
   and `beeper-oplog` fully operational chad packages at runtime (not just
   correctly-structured files in `packages/*`, which they already are),
   ending the dependency on the standalone `contacts` repo for anything
   live.

## Phase 0 — Decisions needed before implementation starts

These are genuine open questions this plan surfaces but does not answer —
see `06_others_from_report.md` for the full list. The two that block
everything else:

- **Target database name.** `contacts`'s Mongo uses database `beeper`
  (`mongodb://.../beeper`). Earlier migration docs assumed the target would
  be a database literally named `chad`. Need one explicit decision: reuse
  collection names in whichever single shared chad database already
  exists/is planned (recommended — avoids a second migration later when
  `content_provider_files` lands), not a separate `beeper` database on the
  chad side.
- **MongoDB replica-set re-approval.** `beeper-oplog` cannot run anywhere
  (local or QNAP) without a replica set, which was deliberately reverted to
  standalone after a real bootstrap-ordering bug. This plan does not
  re-attempt that migration — it only assumes the decision will be revisited
  separately, and sequences `beeper-oplog`'s deployment after it.

## Phase 1 — Local dry-run migration (Mac, no QNAP involved)

Goal: prove the existing `bash-scripts/mongo/migrate-contacts-to-chad.mjs`
script actually produces a correct, complete copy, entirely locally, before
touching QNAP.

1. Stand up a local target Mongo via the existing
   `docker-compose.local.yml` `mongodb` service (`pnpm mongo:up`, now fixed
   in Story 58) — this is the same local Mongo the containerized dashboard
   already reaches via `host.docker.internal` (see Story 58), just used as
   a migration *target* here instead of `contacts` being read directly.
2. Run the migration script in dry-run (default mode) with
   `CONTACTS_MONGODB_URI` pointed at `contacts`'s real Mongo (port 27018,
   per Story 58) and `MONGODB_URI` pointed at the local target. Confirm the
   reported counts match `contacts`'s real collection counts exactly (no
   silent drops).
3. Run with `--apply` against this **local, disposable** target only. Point
   the `chad` dashboard's `MONGODB_URI` at this newly-migrated local
   database (a real database switch, not `host.docker.internal` passthrough
   to `contacts` anymore) and re-run the same verification Story 58 already
   did (contacts list, detail, inbox, merge-suggestions, search) — this
   time against **migrated**, not passthrough, data. This is the first real
   test that the migration itself (not just the read layer) is correct.
4. **New verification not done in Story 58**: exercise the **write** paths
   against the migrated local database — edit a contact's profile, add/remove
   a tag, add/delete a timeline event, merge two contacts, and confirm
   nothing throws and the changes persist. Story 58 only verified reads;
   before any real cutover, writes need the same confidence.
5. `ensureBeeperIndexes()` — confirm it runs cleanly against a
   freshly-migrated database with no pre-existing indexes (Story 58 never
   exercised this against a truly empty target).

## Phase 2 — beeper-ws / beeper-sync against the migrated local target

1. Point `chad/.env.mac-beeper` at the same local migrated Mongo from Phase
   1 (not `contacts`'s Mongo anymore).
2. Run `beeper-sync`'s normal incremental `sync` (not `sync:force`) once,
   for real, and confirm: (a) it only pulls messages newer than the
   migrated `sync_state` cursor (proving the migrated `sync_state` data is
   actually usable, not just copied bytes), (b) no duplicate contacts/messages
   get created alongside the migrated ones.
3. Run `beeper-ws` for a short live window and confirm a real new
   Beeper event lands correctly in the migrated database's `beeper_events`
   collection, and that the dashboard reflects it (either via the SSE
   `/api/beeper-crm/events` route or a manual refresh).
4. Use the existing `bash-scripts/beeper/{01_config,02_begin,03_end,04_status,05_sync}.sh`
   process-management scripts for all of this rather than ad-hoc
   `pnpm --filter` calls (lesson from Story 58: use the repo's own
   sanctioned tooling, not improvised commands).

## Phase 3 — QNAP test rollout (still no `beeper-oplog`)

Once Phases 1–2 are clean:

1. Dry-run the migration script again, this time against QNAP's real
   `chad-mongodb` (test range) as the target, `contacts`'s local Mongo as
   the source (same script, just different `MONGODB_URI`). Report counts.
2. On explicit go-ahead, `--apply` against QNAP test.
3. Point QNAP-test's `chad-dashboard-test` container at the now-migrated
   QNAP Mongo (it already can — `dba`/`beeper-crm.ts` requires no changes,
   only the `MONGODB_URI` env value on that container). Re-run the same
   read+write verification as Phase 1, this time against QNAP test.
4. `beeper-ws`/`beeper-sync` stay Mac-only per the existing architecture
   decision — Phase 3 does not move them to QNAP, only re-points their
   target Mongo (via `.env.mac-beeper`'s `QNAP_TAILSCALE_HOST`) at the now-
   real QNAP data once it exists there.

## Phase 4 — `beeper-oplog` on QNAP (gated on the replica-set decision)

Explicitly sequenced *after* Phase 3, and explicitly blocked until the
replica-set decision is revisited and re-approved (a separate, pre-existing
gate — this plan does not re-litigate it here):

1. Once a replica set exists on QNAP, add a `beeper-oplog` service to
   `docker-compose.qnap.shared.yml` (a `# ...` placeholder comment already
   marks where it was anticipated — see Story 58's `03_knowledge.md`).
2. Verify `beeper-oplog`'s change-stream consumption against real QNAP
   data with a controlled, small test event before trusting it unattended.

## Phase 5 — QNAP prod rollout

Same shape as Phase 3, against the prod Mongo/dashboard, after Phase 3 has
been running cleanly for a reasonable observation period (matches this
repo's existing test-before-prod convention).

## Phase 6 — Decommissioning `contacts`

Only after Phase 3 (QNAP test) is verified stable:

1. Stop `contacts`'s own `beeper-ws`/`beeper-sync` processes on the Mac —
   `chad`'s copies are now the live ones.
2. Decide (with the user) whether to keep `contacts`'s standalone Mongo
   container around read-only as a safety-net backup for some period, or
   archive/stop it once the migrated data has been spot-checked against it
   one more time.
3. `contacts`'s own SvelteKit dashboard becomes fully redundant — no code
   change needed on the `chad` side, just stop running it locally.

## Explicitly out of scope for this Story

- Actually executing any of the phases above — this Story is the plan, not
  the work. Each phase gets its own future Story (or is folded into one,
  the user's call) when the user says to proceed.
- Re-deciding the MongoDB replica-set question itself (Phase 4's gate).
- The Mac-only media proxy, `/affinity` view, avatar cropper, and
  Google-Contacts-enrich merge suggestions — still separately deferred per
  `documentation/beeper/migration.md`, unrelated to this Story's scope.
