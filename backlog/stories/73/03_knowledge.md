# Story 73 — Knowledge

Pointers to what was needed to do this specific Story, and why.

- `packages/dba/src/mongo.ts` — the only sanctioned place for a dashboard-side
  Mongo connection. Before this Story, `getBeeperMongoDb()` took no argument
  and always returned the driver's default database from
  `BEEPER_MONGODB_URI` (`beeper`). This is the file that had to change first
  — every other change in the Story depends on its new
  `getBeeperMongoDb(repoGuid)` signature.

- `packages/dba/src/repo-context.ts` — pre-existing `AsyncLocalStorage`
  wrapper (`runWithRepoContext`/`getCurrentRepoGuid`/`getCurrentUsername`),
  already used by `leads.ts`, `reports.ts`, `statuses-dashboard.ts`,
  `ai-answer.ts`, `path-resolver.ts`, `beeper.ts` (the older, unrelated
  CP-based Messages feature). Beeper CRM (`beeper-crm.ts`) was the one
  feature that never adopted it — needed as the exact mechanism for
  threading `repoGuid` through `beeper-crm.ts`'s ~30 exported functions
  without changing every call site's signature.

- `packages/dashboard/lib/session.ts` / `lib/user-service.ts` —
  `getCurrentUserFromCookies()` returns `{ repoGuid, username } | null`,
  already validated against the real `chad_admin/users/users-list` CP item
  via `resolveCurrentUser()`. All 14 `beeper-crm` API routes already called
  this for the 401 check — the bug was that the resolved `repoGuid` was then
  discarded instead of being passed into `runWithRepoContext`.

- `human-docs/beeper/architecture.md` and `mongo-schema.md` — pre-Story
  documented architecture: single shared `beeper` Mongo database, no
  per-user concept at all. Confirms the 7-collection list
  (`contacts, channels, messages, timeline_events, sync_state,
  beeper_events, merge_suggestions`) and the package responsibility split
  (`beeper-ws`/`beeper-sync` Mac-only, `beeper-oplog` QNAP-only and **not
  yet deployed anywhere** — no docker-compose service exists for it, gated
  on the Mongo replica-set migration that hasn't happened).

- `bash-scripts/mongo/migrate-contacts-to-chad.mjs` — the original one-time
  migration (standalone `contacts` project → shared `chad-mongodb`'s
  `beeper` db). Used as the direct template for this Story's
  `migrate-beeper-to-per-user.mjs`: dry-run-by-default, `--apply` flag,
  preserves `_id` (so cross-collection ObjectId references stay valid),
  `redact()` helper for logging Mongo URIs safely.

- `bash-scripts/mongo/backup.sh` / `restore.sh` — existing whole-server
  `mongodump`/`mongorestore` scripts (via `docker exec` into the Mongo
  container). Already capture the `beeper` database as part of a full
  server dump — reused as-is for the mandatory pre-migration backup rather
  than writing a new backup mechanism (`04_deployment-rules.md`: never
  hand-roll what a script already does).

- `packages/dba/src/data-providers/mongo-cp-provider.test.ts` — this repo's
  only existing test convention: no Jest/Vitest anywhere in `dba`/
  `dashboard`. Hand-rolled `async function test(name, fn)` runner, compiled
  via `tsc` and run with `node dist/....test.js`, always against a **real**
  local MongoDB test database (never mocked, never `beeper`/`chad`
  themselves). This Story's isolation tests follow the same convention.

- `.env.mac-beeper.example` / `.env.local.example` / `.env.qnap.example` —
  confirmed the pre-Story env var split: `MONGODB_URI` (dashboard's CP `chad`
  db) vs `BEEPER_MONGODB_URI` (dashboard's Beeper db) vs, confusingly,
  `MONGODB_URI` again but meaning something different in
  `beeper-ws`/`beeper-sync`'s own `.env.mac-beeper` (their **only** Mongo env
  var, pointed straight at `.../beeper`) — these are separate processes with
  separate env files, so the name collision is not a live bug, just a naming
  trap to be careful about when editing docs/env examples.

- Confirmed `kamil_s` / repoGuid `8b603669-f8e6-4224-bd78-a474998995fa`
  already exists as a real, working CHAD user (referenced across many prior
  Stories for CP-item isolation testing) — so this Story's manual/smoke
  verification can log in as Kamil for real, no user provisioning needed
  first.
