# Story 80 — Others

## Architectural decisions

- **`id`/`source_id` are `text`, not `uuid`.** The input's example schema
  used `uuid` but explicitly warned "nie zgaduj, czy wszystkie istniejące
  ID są UUID" — this was checked against real local Mongo fixture data
  during the local cutover and found to be false (legacy ids like
  `"item-1"` exist). Caught before any real migration ran, by trying the
  real thing rather than trusting the assumption.
- **Diff computed at read time from snapshots, `config_diff`/`body_diff`
  columns left NULL by the trigger.** The input's own §5 explicitly allows
  this fallback when a full trigger-side diff would be "nadmiernie
  złożona". Postgres stores a full snapshot on every event (not
  periodically like Mongo), so this is always accurate for native rows.
  Migrated legacy Mongo rows without a snapshot (Mongo only snapshotted
  every 20th update, and never stored a `beforeSnapshot` at all) instead
  carry their originally-computed Mongo diff directly in these columns —
  the read side treats a non-null `config_diff` as "trust this, don't
  recompute" (Mongo's `diffConfig` always returns an array, even empty,
  never `null`, so this is an unambiguous discriminator against the
  trigger's own SQL-NULL default).
- **Hash algorithms don't match across the Mongo/Postgres boundary, and
  that's fine.** Postgres's trigger hashes via `digest(jsonb::text,
  'sha256')`; Mongo's `hashCpState` canonicalizes to a JSON string first.
  Both are internally chain-consistent (`before_hash(N) == after_hash(N-1)`
  within their own algorithm), but not comparable to each other. The
  integrity checker knows to skip the chain check specifically across a
  migrated/native seam rather than false-positive on every item that has
  both migrated and native history.
- **Outbox/history-read backend selection via thin dispatchers
  (`data-outbox.ts`, `google-sheets/outbox.ts`, `cp-history.ts`), not
  duplicated call sites.** Existing callers (`data-outbox-worker.ts`,
  `google-sheets/worker.ts`, the Dashboard History API routes) needed zero
  changes — they already only imported from these three modules, which now
  forward to whichever backend `loadDataProvidersConfig().primaryBackend`
  says, defaulting to the exact pre-existing Mongo behavior.
- **QNAP Postgres is shared between TEST and PROD (user clarification
  mid-Story), not a TEST-only sandbox.** This changed the QNAP cutover plan
  from "flip TEST first" to "add the container now, cut over both
  environments together later" — flipping only TEST while PROD stays on
  Mongo would split what's supposed to be one shared source of truth into
  two diverging ones, which §18 forbids ("nie utrzymuj dwóch primary")
  just as much as running Postgres and Mongo as simultaneous primaries
  would.

## Problems encountered

- **Local Mongo test data included pre-Story-79-shaped `cp_history`
  documents** (Story 74/78 Change-Stream schema — no `mutationId`/
  `repoGuid`/`version` fields, `actor: null`, a raw resume-token `_id`).
  The migrator initially crashed on these; fixed to detect and skip them
  with a clear report (`historyEventsIncompatibleSkipped`), never
  fabricating a mutationId/version for data that was never in the new
  shape to begin with.
- **A duplicate-child-name integrity violation already existed in the
  local Mongo fixture data** (two items both named "dates" under one
  parent, same class of incident as Story 72's documented "07/05" bug).
  The migrator correctly carried this over verbatim (not its job to fix
  data), and the new Postgres integrity checker correctly caught it — a
  real, useful confirmation that the checker works, not a defect in this
  Story's own migration.
- **A `JSON.stringify`-based "is this already migrated with identical
  content" check in the migrator false-positived as a conflict on every
  idempotent re-run**, because Postgres's jsonb storage doesn't preserve
  Mongo's key insertion order. Fixed to compare via `hashCpState` (which
  canonicalizes key order) instead of raw string comparison — caught by
  actually re-running the migrator twice against real seeded data, not by
  code review alone.
- **Environment-level `corepack`/`pnpm` breakage mid-session** (a
  signature-verification failure fetching "latest" from the npm registry)
  — unrelated to this Story's code; resolved with `corepack prepare
  pnpm@9.15.4 --activate` to force-pin the version already declared in
  `package.json`.

## Known limitations / explicitly not done

- Cross-user isolation for the Postgres-backed History UI is verified at
  the `listCpHistory`/`getCpHistoryEntry` function level (synthetic
  repoGuids) and via `PostgresCpProvider`'s own tests, but **not** through
  the actual browser/session/HTTP layer with a second real logged-in
  `test2` fixture user — the same gap Story 78/79 already disclosed
  (`chad_admin` has no provisioned `test2` account). Not created or fixed
  in this Story either.
- `data-outbox-worker.ts` (the data-sync outbox worker, as opposed to the
  Google Sheets one) is still not wired into any running process, for
  either backend — a pre-existing gap from Story 72, explicitly out of
  this Story's scope to fix, carried forward unchanged.
- QNAP TEST/PROD full cutover (migrator run against real shared Mongo
  data, integrity check, `DBA_PRIMARY_BACKEND` flip for both environments
  together, rollback window, eventual Mongo CHAD decommission) is real
  follow-up work requiring a PROD change window — not attempted here.

## Follow-up proposals

- Provision a real `test2` CHAD account (chad_admin) so cross-user
  isolation can be tested end-to-end through the browser for both the
  Mongo and Postgres backends, closing the gap noted above and in Story
  78/79.
- Wire `data-outbox-worker.ts` into a running process (mirroring how the
  Google Sheets worker is started from `packages/dashboard/
  instrumentation.ts`) — currently fully implemented/tested but inert for
  both backends.
- When ready for the real QNAP cutover: back up `chad-mongodb`, run the
  migrator against QNAP's real shared Mongo scoped by repoGuid, run the
  integrity checker, flip `DBA_PRIMARY_BACKEND=postgres` for TEST and PROD
  together in the same change window, keep Mongo CHAD read-only for an
  explicit rollback window before eventually decommissioning it.
