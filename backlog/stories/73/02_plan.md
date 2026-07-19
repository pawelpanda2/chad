# Story 73 — Beeper per-user MongoDB isolation

## Context

`kamil_s` currently sees `pawel_f`'s Beeper contacts/messages in the CHAD dashboard — a real data-isolation bug, not a UI glitch. Root cause confirmed by full-repo audit: the Beeper CRM feature (`packages/dba/src/beeper-crm.ts` + `packages/dashboard/app/api/beeper-crm/**`) never adopted the per-user repo-context pattern that every other CHAD feature (leads, reports, statuses, CP items) already uses. It connects to one single, global `beeper` MongoDB database for every user, with no owner field and no per-user selection at all.

## Architecture decision (confirmed, unchanged from the request — restated here so there is no ambiguity)

Each CHAD user gets a **fully separate MongoDB database**:

```
beeper_21d11bdc-f1f4-44d1-b61a-3fa6b039c641   ← pawel_f
beeper_8b603669-f8e6-4224-bd78-a474998995fa   ← kamil_s
```

Inside every one of these databases, collection names stay exactly as they are today — **no prefixing, no owner field**:

```
contacts
channels
messages
timeline_events
beeper_events
sync_state
merge_suggestions
```

This plan does **not** propose (and never did): a single shared `beeper` database with isolation enforced by an `ownerRepoGuid` field on documents, and does **not** propose collection-name prefixing (`<repoGuid>_contacts`). Isolation is purely "which database did the driver open", decided once per request/process from a verified `repoGuid`, nothing else. The one physical `MongoClient`/TCP connection to the Mongo **server** is shared (same server, same credentials, same as today) — what changes is that `client.db(name)` is now called with a per-user database name instead of the server's default database. That server-level connection reuse is a driver-level efficiency detail, not a data-isolation mechanism — the isolation is the database boundary itself.

## Audit findings (repo: `chad` monorepo, not `chad-dba`)

### 1–3. Mongo connections / `getBeeperMongoDb()` / `client.db()` for Beeper

- **`packages/dba/src/mongo.ts`** (the only sanctioned place for a dashboard-side Mongo connection): `getBeeperMongoDb(): Promise<Db>` — **no arguments**, single module-level `MongoClient` built from `BEEPER_MONGODB_URI`, returns `client.db()` (whatever DB the connection string points at, currently `beeper`). No repoGuid concept exists at all in this file today. `ensureBeeperIndexes()` in `beeper-crm.ts` also takes no argument.
- **`packages/dba/src/beeper-crm.ts`** — 4 collection helpers (`contactsCol`, `channelsCol`, `messagesCol`, `timelineEventsCol`, lines 29–38) all call `getBeeperMongoDb()` with no owner context. ~30 exported functions (list, get, search, stats, inbox, merge, merge-suggestions, tags, events, avatar, export, SSE subscribe) all go through these 4 helpers — none currently take or use a `repoGuid`.
- **`packages/beeper-sync`** (Mac-only importer) — `lib/db.mjs` opens its own `MongoClient` directly from `process.env.MONGODB_URI` (fallback `mongodb://localhost:27017/beeper`), independent of `dba`. 9 standalone scripts (`fix-*.mjs`, `cleanup-*.mjs`, `dedup-messages.mjs`, `enrich-*.mjs`, `inspect.mjs`, `sync-google-contacts.mjs`) each open their **own** `MongoClient` + `client.db()` directly, duplicating the same pattern.
- **`packages/beeper-ws`** (Mac-only, long-lived WS listener) — `index.mjs` opens its own `MongoClient` from `process.env.MONGODB_URI` (same fallback), writes only to `beeper_events`.
- **`packages/beeper-oplog`** (QNAP, long-lived change-stream consumer — **not currently deployed anywhere**, no docker-compose service exists for it yet, gated on the Mongo replica-set migration) — `index.mjs`, same pattern, own `MongoClient` from `process.env.MONGODB_URI`.
- **`packages/dashboard/app/api/beeper-crm/**`** — 14 route files. **Every one** calls `getCurrentUserFromCookies()` and correctly 401s if there's no session — but then calls `dba` functions directly, **never** wrapping the handler in `runWithRepoContext(user, ...)`. The resolved `user.repoGuid` is fetched and then thrown away. This is the exact bug: auth works, authorization (which database) does not.
- **Migration/admin scripts**: `bash-scripts/mongo/migrate-contacts-to-chad.mjs` — the original one-time migration that moved the standalone `contacts` project's Mongo data into `chad-mongodb`'s `beeper` database. Confirms the authoritative collection list: `contacts, channels, messages, timeline_events, sync_state, beeper_events, merge_suggestions`. Good template for the new per-user migration script (dry-run-by-default, `--apply` flag, preserves `_id`, redacts credentials in logs).
- `bash-scripts/mongo/backup.sh` / `restore.sh` already do whole-server `mongodump`/`mongorestore` via `docker exec` into the Mongo container — this already captures the `beeper` database and can be used as-is for the pre-migration full backup.

### 4. Collections read/written (per package) — matches the mongo-schema.md doc, confirmed against code

`contacts`, `channels`, `messages`, `timeline_events` (dba + all background processes), `sync_state` (beeper-sync only), `beeper_events` (beeper-ws writes, beeper-oplog reads via change stream), `merge_suggestions` (migrated for completeness, not read by current UI/dba code — grep confirms zero references in `beeper-crm.ts`).

### 5. Indexes

Already centralized once, in `dba`: `ensureBeeperIndexes()` in `beeper-crm.ts` (lines 48–77) creates all 9 indexes across `contacts/channels/messages/timeline_events`. `beeper-sync/lib/db.mjs` and `beeper-ws`/`beeper-oplog` each **also** create their own copies of a subset of these indexes independently (duplicated, not shared) — acceptable today since `createIndex` is idempotent, but means index definitions live in 4 places, not 1.

### 6. Places assuming one global `beeper` database

Every one of the connection points in §1–3 above. There is no code today that selects a database by user — the concept doesn't exist yet.

### 7. Places where `repoGuid`/user can be silently skipped

All 14 `beeper-crm` API routes (session resolved, then discarded). `subscribeToBeeperChanges()` (SSE) — called from `events/route.ts` inside a `ReadableStream`'s `start()` callback; since `start()` runs synchronously at `ReadableStream` construction time, this is safe to bring under `runWithRepoContext` as long as the `new ReadableStream(...)` construction itself happens inside the `runWithRepoContext` callback (confirmed against the existing `repo-context.ts` AsyncLocalStorage implementation).

### 8. Background processes without Dashboard session access

`packages/beeper-sync` (Mac, manual/cron), `packages/beeper-ws` (Mac, long-lived), `packages/beeper-oplog` (QNAP, long-lived, not yet deployed). None can call `getCurrentUserFromCookies()` — they need the explicit `BEEPER_OWNER_REPO_GUID` env var the user specified.

### Existing patterns to reuse (found during audit, not new to write)

- **`packages/dba/src/repo-context.ts`** — `AsyncLocalStorage`-based `runWithRepoContext({repoGuid, username}, fn)` / `getCurrentRepoGuid()` / `getCurrentUsername()`, already used by every other `dba` module (`leads.ts`, `reports.ts`, `statuses-dashboard.ts`, `ai-answer.ts`, `path-resolver.ts`, `beeper.ts` — the *older*, unrelated CP-based Messages feature). This is exactly the mechanism the user's request describes wanting — it already exists, Beeper CRM is simply the one feature that never adopted it.
- **`packages/dashboard/lib/session.ts`** — `getCurrentUserFromCookies()` → `{ repoGuid, username } | null`, already validates against the real `chad_admin` user list via `resolveCurrentUser()` (`lib/user-service.ts`) — never trusts the raw cookie. Already imported by all 14 beeper-crm routes; just needs its result actually used.
- **`data-providers/mongo-cp-provider.test.ts`** — this repo's test convention: no Jest/Vitest configured anywhere (`dba`/`dashboard` package.json have no test framework). Hand-rolled `async function test(name, fn)` runner, compiled with `tsc` and run with `node dist/....test.js`, **against a real local MongoDB test database** (e.g. `chad_test_story72`), never mocked. New Beeper isolation tests should follow this exact convention.
- **`bash-scripts/mongo/backup.sh`/`restore.sh`** — reuse directly for the pre-migration backup, per `04_deployment-rules.md` (never hand-roll a `docker exec mongodump` when a script already exists).

## Design

### Central resolver — `packages/dba/src/mongo.ts`

Replace the no-arg `getBeeperMongoDb()`/`connectBeeper()` with:

```ts
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertValidRepoGuid(repoGuid: string): void {
  if (!repoGuid || !GUID_RE.test(repoGuid)) {
    throw new Error(`getBeeperMongoDb: invalid repoGuid "${repoGuid}"`);
  }
}

// One MongoClient to the Beeper Mongo server (BEEPER_MONGODB_SERVER_URI,
// no database segment), many Db handles — one per repoGuid.
let beeperClientPromise: Promise<MongoClient> | null = null;
function connectBeeperServer(): Promise<MongoClient> { ... }

export async function getBeeperMongoDb(repoGuid: string): Promise<Db> {
  assertValidRepoGuid(repoGuid);
  const client = await connectBeeperServer();
  return client.db(`beeper_${repoGuid}`);
}
```

- `BEEPER_MONGODB_URI` env var changes meaning: today it includes a hardcoded `/beeper` database segment; going forward it must be a **server** URI with no database segment (or any segment is simply ignored — `client.db(name)` always overrides). Document this clearly in `.env.local.example`/`.env.qnap.example` and update the actual `.env.local`/`.env.qnap` files (with the user's explicit OK, since these hold real credentials).
- No fallback to `pawel_f`, no fallback to the old `beeper` db, no caller-supplied database name — matches every "must not" in the request.
- `Db` handles themselves aren't cached (cheap, stateless) — only the one `MongoClient` per process is cached, same lifecycle as today.

### `ensureBeeperIndexes(repoGuid)` — `beeper-crm.ts`

Change signature to take `repoGuid`, thread it into the 4 collection helpers (which also gain a `repoGuid` parameter). Same 9 index definitions, unchanged content — just parameterized by database instead of hardcoded to the single global one.

### `packages/dba/src/beeper-crm.ts` — full refactor

Every exported function currently doing (implicitly) `getBeeperMongoDb()` switches to:
```ts
const repoGuid = getCurrentRepoGuid();       // from repo-context.ts, already imported elsewhere in dba
const db = await getBeeperMongoDb(repoGuid);
```
via the 4 `*Col()` helpers, which become `async function contactsCol() { return (await getBeeperMongoDb(getCurrentRepoGuid())).collection<any>("contacts"); }` etc. — one change point covers all ~30 functions. `subscribeToBeeperChanges` gets an explicit `repoGuid` read at call time (same pattern) since it's called once per SSE connection setup, not per event.

### Dashboard API routes — `packages/dashboard/app/api/beeper-crm/**`

All 14 routes: after the existing `getCurrentUserFromCookies()` + 401 check, wrap the existing handler body in `runWithRepoContext(user, async () => { ... })` — mechanical, one wrapping change per route, no logic changes. `contacts/[id]/**` routes: a contact `_id` that resolves to nothing in the caller's own database already naturally returns `null` → existing code already returns 404 in that case (confirmed in `contacts/[id]/route.ts`) — since Kamil's database physically cannot contain Paweł's `_id`, this requirement is satisfied automatically by the per-database isolation, no extra code needed.

### Background processes — `beeper-sync`, `beeper-ws`, `beeper-oplog`

Each package gets one small shared helper (new file, e.g. `lib/owner-db.mjs`, duplicated 3x like their existing per-package `db.mjs` pattern, or a tiny shared local package if that's cleaner — will decide during implementation, leaning toward duplicated-but-tiny to match the existing per-package independence) that:
1. Reads `BEEPER_OWNER_REPO_GUID` at startup.
2. Validates full GUID format; `process.exit(1)` with a clear message if missing/invalid — before any Mongo connection is opened.
3. Connects using a **server** URI (`MONGODB_URI` for these Mac/QNAP processes, per their existing `.env.mac-beeper` convention) and calls `client.db(\`beeper_${repoGuid}\`)`.
4. Logs the resolved database name and repoGuid at startup, never the credential portion of the URI (reuse the `redact()` pattern already in `migrate-contacts-to-chad.mjs`).

`.env.mac-beeper.example` and the QNAP env files gain `BEEPER_OWNER_REPO_GUID=` with the two real values the user gave (Paweł's Mac, and a placeholder/commented example for Kamil's future device).

### Migration script

New `bash-scripts/mongo/migrate-beeper-to-per-user.mjs`, modeled directly on `migrate-contacts-to-chad.mjs`'s structure (dry-run default, `--apply`, preserves `_id`, per-collection report): source = old `beeper` db, target = `beeper_21d11bdc-f1f4-44d1-b61a-3fa6b039c641`. Copies all 7 collections, recreates indexes via `ensureBeeperIndexes(repoGuid)`, prints source/target counts for comparison. A second, trivial script/step just calls `ensureBeeperIndexes()` for Kamil's guid to initialize an empty `beeper_8b603669-...` database with the right indexes and no data.

Backup: reuse `bash-scripts/mongo/backup.sh` (whole-server dump, already covers `beeper`) before running the migration script with `--apply`.

## Implementation order (this session)

1. `packages/dba/src/mongo.ts` — new `getBeeperMongoDb(repoGuid)` resolver.
2. `packages/dba/src/beeper-crm.ts` — thread `repoGuid` through all collection helpers + `ensureBeeperIndexes` + `subscribeToBeeperChanges`.
3. `packages/dashboard/app/api/beeper-crm/**` (14 routes) — wrap in `runWithRepoContext`.
4. `packages/beeper-sync`, `packages/beeper-ws`, `packages/beeper-oplog` — `BEEPER_OWNER_REPO_GUID` startup guard + per-user db selection.
5. Env files: `.env.local.example`, `.env.qnap.example`, `.env.mac-beeper.example` (+ the real, gitignored `.env.local`/`.env.qnap`/`.env.mac-beeper` on this Mac, with the user's confirmation since they hold live credentials).
6. Hand-rolled isolation tests against a real local test Mongo (repo convention — see `mongo-cp-provider.test.ts`), covering the mandatory list in the request (§9): two-user contact list isolation, 404 on cross-user contact fetch, stats isolation, search, merge-suggestions, timeline/messages, sync writing only to its own db, missing/invalid `BEEPER_OWNER_REPO_GUID` stops the process, indexes created in both dbs.
7. `pnpm typecheck`/`build` across touched packages.
8. Backup old `beeper` db (`bash-scripts/mongo/backup.sh`), run migration script in dry-run then `--apply` for Paweł's data, initialize empty Kamil db + indexes.
9. Update docs: new `human-docs/beeper/per-user-databases.md` (or extend `architecture.md`/`mongo-schema.md` in place) + update `chad-user-data-isolation.md` to mention Beeper now follows the same model.
10. Write up Story 73's `02_plan.md` (this plan), `03_knowledge.md`, `05_tasks_and_checklist.md` per the repo's Story standard.

## Explicit stopping point

This round covers steps 1–10 above: code, local tests, backup, migration of Paweł's real data, and empty initialization of Kamil's database — all on the local Mac Docker environment. **QNAP TEST deployment, live-environment isolation testing, and any PROD action are separate, later checkpoints** requiring the user's explicit go-ahead each time, per their own instructions (§7 "po mojej osobnej zgodzie", §11 step 16 "zatrzymaj się przed PROD") and this repo's deployment rules (`04_deployment-rules.md` — QNAP TEST goes through its own numbered scripts, never ad hoc). I will report back once 1–10 are done and ask before touching QNAP.

## Verification

- `pnpm --filter dba typecheck && pnpm --filter dba build` (existing script) after the `mongo.ts`/`beeper-crm.ts` changes.
- `pnpm --filter dashboard build` (or `next build`) after route changes — Next.js route type-checking will catch a missed `runWithRepoContext` wrap if the route body references `getCurrentRepoGuid()`-dependent code without it.
- Run the new hand-rolled test file against a real local test Mongo database (never `beeper`/`chad`, matching `mongo-cp-provider.test.ts`'s own rule), covering the request's mandatory scenarios.
- Manual smoke check: log in locally as `pawel_f`, confirm contacts still load; simulate `kamil_s` (once that account exists in `chad_admin/users/users-list` — confirm it already does, since the request implies `kamil_s` can already log in today) and confirm an empty contact list plus a 404 on a direct request for one of Paweł's known contact `_id`s.
