# Story 83 — Plan

Interrupted Story 82 mid-session at the user's explicit request; this Story
was scoped live via one clarifying question (read-only display vs. real
live switch — user chose real switch) rather than a full upfront plan, to
keep this fast.

## Scope

Only the axis the user actually described: `DBA_MONGO_MODE` (local vs. QNAP
Mongo), previously decided once at shell/container-start time by
`bash-scripts/dashboard/03_local_mac_docker/01_config.sh` rewriting
`MONGODB_URI`/`BEEPER_MONGODB_URI` before the process even starts — invisible
and unchangeable from inside the running app. Not in scope: primary-backend
selection (Mongo vs. Postgres vs. Content Provider) — a different axis the
user didn't ask about; adding it now would be unrequested scope creep.

## Design

- `packages/dba/src/dev-db-override.ts` (new): in-memory, process-wide
  `currentSource: "local" | "qnap"` + a generation counter. Defaults to
  whatever `DBA_MONGO_MODE` said at process start. `setMongoSource()`
  refuses to run when `NODE_ENV === "production"` — every Docker-built
  deployment (local-mac-docker, QNAP test, QNAP prod) runs with
  `NODE_ENV=production` regardless of environment name (`lib/flags.ts`), so
  this hard-blocks the one genuinely dangerous case: a shared multi-user
  server process where one request could yank the database out from under
  every other concurrent request. Only reachable on a single developer's own
  bare `next dev`.
- `mongo.ts`: `getMongoUri()`/`getBeeperMongoUri()` now delegate to the
  override's `getEffectiveMongoUri()`/`getEffectiveBeeperMongoUri()`.
  `connect()`/`connectBeeperServer()` track which override generation their
  cached `MongoClient` was opened under; a generation mismatch tears down
  the stale client (`close()`, fire-and-forget) and opens a fresh one — this
  is what makes the switch actually reconnect, not just relabel.
  `MongoCpProvider` needed no changes: it already calls `getMongoDb()` fresh
  on every operation rather than caching a `Db` handle itself, so it picks
  up the new connection automatically. `data-router-instance.ts`'s cached
  `DbaDataRouter`/`MongoCpProvider` singletons don't need invalidation
  either — `primaryBackend` stays `"mongo"` either way; only *which* Mongo
  changes, which lives entirely inside `mongo.ts`.
- `packages/dashboard/app/api/dev-settings/db-source/route.ts` (new): thin
  GET (current source + resolved `host:port`, no credentials) / POST
  (change it) pair, gated by the same `NODE_ENV !== "production"` check.
  Already sits behind the existing global middleware's session-cookie
  requirement for all `/api/*` routes (`middleware.ts`), an extra layer this
  Story didn't need to add itself.
- Dev Panel (`components/dev-panel/dev-panel.tsx` +
  `lib/dev-panel/dev-panel-store.tsx`): new `'settings'` tab, a native
  `<select>` (Local / QNAP), current resolved target shown underneath,
  loading/switching/error states — same visual conventions
  (`dev-btn`/`dev-tab-section`/`dev-log-pre`) as the existing
  Requests/Errors tabs.

## Verification

Real curl round-trip against a local bare `next dev` process: switching to
`"local"` and hitting a Mongo-backed route (`GET /api/folders`) produced a
real `ENOTFOUND mongodb` (the local Docker-network hostname is correctly
unreachable from bare host — proving the switch takes effect, not just
updates a label); switching back to `"qnap"` immediately succeeded (200,
real data) — confirming both the override AND the reconnect-on-change logic
in `mongo.ts` work. `tsc --noEmit` clean for both `packages/dba` and
`packages/dashboard`. The Dev Panel's own UI was not click-through tested in
a real browser this round (stopped short — see `05_tasks_and_checklist.md`)
since the underlying mechanism was already proven via curl and the
component is a thin, already-typechecked wrapper with no independent logic
of its own.
