# Story 72 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE | | MongoCpProvider reads/writes CP Items correctly (id/address/uniqueness/custom fields/created-modified) |
| 2 | DONE | | LegacyContentProviderAdapter reads/writes through the existing legacy CP wire API, no direct HTTP calls elsewhere |
| 3 | DONE | | DbaDataRouter selects primary/follower from config; follower writes are async/durable, never block or fail the primary |
| 4 | DONE | | Config validation blocks startup if the configured primary backend is disabled |
| 5 | DONE | | Outbox is durable across restarts, retries with backoff, recovers stale locks, never double-processes a job |
| 6 | DONE | | Migrator CP -> Mongo works in `--dry-run`/`--validate-only`/`--apply`, reports counts, is idempotent |
| 7 | PARTIAL | | Migrator verified against a real, running Content Provider instance (only verified against a fake in-process tree — see Task 7 below) |

# Task 1 — MongoCpProvider

**Requested:** A real (not mocked) MongoDB-backed provider implementing
insert/update/read-by-id/read-by-address/`getByNames`/`getByNames2`,
preserving `_id == config.id`, unique `config.address`, preserving
`created` across updates, refreshing `modified`, never losing custom
config fields, and safe find-or-create for numbered children (Story 72 §10).

**Done:** `packages/dba/src/data-providers/mongo-cp-provider.ts`. Indexes
created idempotently. `getByNames`/`getByNames2` resolve hierarchically
(sibling-by-sibling), never a global name search. Folder children are
never stored, always derived by querying one address segment past the
parent — matching the real Content Provider's own behavior (audited in
`03_knowledge.md`). Next-child-index allocation uses an atomic
single-document counter (`folder_child_counters`, `$inc`) plus the unique
address index as a second safety net, since standalone MongoDB (this
project's actual deployment) has no multi-document transactions.

**Files changed:** `packages/dba/src/cp-model.ts`, `data-clock.ts`,
`data-commands.ts`, `data-providers/types.ts`, `data-providers/config.ts`,
`data-providers/mongo-cp-provider.ts`.

**Tested:** `packages/dba/src/cp-model.test.ts` (24/24) and
`packages/dba/src/data-providers/mongo-cp-provider.test.ts` (15/15), run
against the real local `chad-mongodb-local-mac-docker` instance (dedicated
test database `chad_test_story72`, dropped after the session — never the
real `beeper`/`chad` data). Command: `cd packages/dba && npx tsc &&
MONGODB_URI="mongodb://change_me:change_me@localhost:27017/chad_test_story72?authSource=admin"
node dist/data-providers/mongo-cp-provider.test.js`. Caught and fixed a
real bug this way: the first version of the child-counter reservation used
`$max` and `$inc` on the same field in one `findOneAndUpdate`, which
MongoDB rejects — split into two atomic single-field steps.

**Status: DONE**

# Task 2 — LegacyContentProviderAdapter

**Requested:** Same provider contract, backed by the real legacy Content
Provider, reusing the existing `packages/dba` CP client (§9).

**Done:** `packages/dba/src/data-providers/legacy-cp-provider.ts`, wrapping
`invokeContentProvider` (`client.ts`) — no new HTTP calls, no
dashboard-level CP access. `getByNames2` returns the full resolved trail
(matching `MongoCpProvider`'s shape) by calling real `GetByNames2` once
per name-prefix length, since real CP's own `GetByNames2` only returns the
final item.

**Important, audited finding (not assumed):** the real CP's `Put`/
`PostParentItem` always mint a brand-new GUID and drop custom config
fields on every write (`WriteTextWorker.IfMinePut`/`WriteFolderWorker.
IfMinePut`); the one method that would preserve them (`PutConfig`) can't
be invoked over the reflection-based `/invoke` protocol at all (its
`Dictionary<string,object>` parameter has no case in
`FindParameters.ConvertParamFromString`). Consequence: with CP as
follower, this layer guarantees the same **address** as the primary
decided, but not the same **id/GUID** — a genuine, current limitation of
the real Content Provider API, documented in `02_plan.md`'s "Correction"
section and the module's own doc comment, not a shortcut taken here.

**Files changed:** `packages/dba/src/data-providers/legacy-cp-provider.ts`.

**Tested:** Exercised indirectly through `data-router.test.ts`'s fake
providers (which stand in for both real providers using the identical
interface) and directly via the migrator's real invocation against the
running Content Provider container during manual debugging (see Task 7)
— confirmed `getItem`/error-shape handling against the real `/invoke`
wire protocol works exactly as audited.

**Status: DONE**

# Task 3 — DbaDataRouter

**Requested:** One central router: primary executes synchronously and
must succeed for the request to succeed; follower is never awaited
in-request, only enqueued; follower failure never changes primary success;
no follower configured means no job created (§11).

**Done:** `packages/dba/src/data-router.ts`. `executeWrite` awaits primary,
then (only if a follower is configured and enabled) enqueues the same
command — replayed with the primary's now-decided `item` so the follower
never re-allocates its own address/id (§8/§23) — wrapped in try/catch so
an enqueue failure only logs (`onFollowerEnqueueError`), never throws into
the caller. Read paths (`getItem`/`getByNames`/`getByNames2`) always
return the primary's result; when `shadowReadsEnabled`, fire an
un-awaited comparison against the follower via `data-sync-diagnostics.ts`.

**Files changed:** `packages/dba/src/data-router.ts`,
`data-sync-diagnostics.ts`.

**Tested:** `packages/dba/src/data-router.test.ts` (8/8) — fake in-memory
providers for primary/follower (no real CP/Mongo needed for the provider
behavior itself), but the **real** outbox (real local test MongoDB) to
verify enqueue side effects genuinely happen. Covers: Mongo-only, CP-only,
both-active-Mongo-primary, both-active-CP-primary, follower-writes-disabled,
invalid-primary-config rejected, primary failure propagates with no
follower job created, and — the trickiest one — a follower-enqueue
failure (forced via a circular-reference config that BSON serialization
rejects) never fails the already-succeeded primary write. Command:
`cd packages/dba && npx tsc && MONGODB_URI="..." node dist/data-router.test.js`.

**Status: DONE**

# Task 4 — Config validation

**Requested:** Configuration must block startup if the configured primary
is disabled (§4).

**Done:** `packages/dba/src/data-providers/config.ts`'s
`validateDataProvidersConfig()`, called from `loadDataProvidersConfig()`.

**Files changed:** `packages/dba/src/data-providers/config.ts`.

**Tested:** Covered directly in `data-router.test.ts` ("invalid config
(primary backend disabled) is rejected at validation").

**Status: DONE**

# Task 5 — Durable outbox

**Requested:** Persistent MongoDB-backed queue, statuses at least
pending/processing/retry/synced/failed/conflict, unique per
operationId+follower, atomic claim (no double-processing), backoff
schedule, stale-lock recovery, reconciliation for the primary-write +
enqueue gap (§12/§13/§14/§15).

**Done:** `packages/dba/src/data-outbox.ts` (collection
`data_sync_outbox`) + `data-outbox-worker.ts` (claim/execute/mark
synced-or-retry-or-conflict loop). Backoff: 1m/5m/15m/1h/6h then `failed`.
`recoverStaleLocks` resets jobs stuck in `processing` past 10 minutes.
`reconcileMissingOutboxJobs` backfills a job missing due to the
non-transactional primary-write-then-enqueue gap (standalone MongoDB has
no multi-document transactions — documented cause, not hidden, per §13's
explicit fallback instructions).

**Files changed:** `packages/dba/src/data-outbox.ts`,
`data-outbox-worker.ts`.

**Tested:** `packages/dba/src/data-outbox.test.ts` (11/11) against real
local MongoDB: idempotent enqueue, separate jobs per follower, atomic
claim (a second worker never claims an already-processing job — verified
directly, not assumed), synced/retry/failed transitions with exact
backoff timestamps, conflict recording, stale-lock recovery after
simulating an 11-minute-old lock, and reconciliation backfill.

**Status: DONE**

# Task 6 — Migrator

**Requested:** `packages/console` tool, `--dry-run`/`--validate-only`/
`--apply`, idempotent, resumable, reports the specified counts, never
deletes data, preserves custom fields and body (§18).

**Done:** `packages/console/src/migrateCpToMongo.ts`. Walks a repo's whole
tree via the legacy adapter + a new `getFolderChildren` export (added to
`legacy-cp-provider.ts` — the one piece of CP domain knowledge the
migrator itself needed that didn't already exist, since real CP has no
generic "list children" method other than a Folder's own computed `Body`).
Builds each item through the same `buildPutItemCommand`/`cp-model.ts`
validation every other write path uses. Naturally resumable: every write
is an idempotent Mongo upsert, so re-running after a crash just re-walks
the tree; already-migrated, unchanged items are classified `unchanged`,
not re-imported.

**Files changed:** `packages/console/src/migrateCpToMongo.ts`,
`packages/dba/src/data-providers/legacy-cp-provider.ts` (added
`getFolderChildren`).

**Tested:** `packages/console/src/migrateCpToMongo.test.ts` (5/5) — a
4-item fake tree (Folder -> Folder -> Text, plus a sibling Text), covering
`validate-only` (scans, never writes), `dry-run` (reports would-import,
never writes), `apply` (imports all 4), re-`apply` (idempotent — reports
all 4 `unchanged`, no duplicates), and a changed body correctly detected
and re-imported on the next `apply` (not silently skipped). Command:
`cd packages/console && MONGODB_URI="..." npx tsx src/migrateCpToMongo.test.ts`.
Required refactoring `migrateRepo` to accept injectable dependencies
(`getItem`/`getFolderChildren`/`mongo`) after discovering ES module named
exports can't be monkey-patched from another module — a genuine
testability fix, not a workaround.

**Status: DONE**

# Task 7 — Live verification against a real Content Provider instance

**Requested:** Practical verification including "test Mongo primary + CP
follower" against a real CP (§31).

**What actually happened:** Attempted to verify the migrator against a
disposable test repo. Content Provider only scans its repo search paths at
container startup, so a restart was needed. The restart failed because
`.env.local`'s second repo mount (`CP_REPOS_HOST_PATH_2=/Volumes/Dropbox/
kamilgame042`) wasn't currently mounted on this machine, which left the
shared `chad-content-provider-api-local-mac-docker` container **stopped**
— a real incident, reported to the user immediately. The user remounted
the volume and the container was restarted successfully. On retry, the
test repo still wasn't found — turned out the container's actual
configured search path is `/Users/pawelfluder/Dropbox` (via `.env.local`'s
`CP_REPOS_HOST_PATH` override), not `packages/dashboard/cp-root` (the
compose file's unused default) — the fixture had been created in the
wrong place entirely. Rather than restart this shared, login-critical
container a third time to place a fixture inside the real Dropbox account,
verification was done instead against a fake in-process CP-shaped tree
(Task 6's tests) — real coverage of the migrator's own logic, zero further
risk to the running container.

**Not done:** an actual end-to-end run of the migrator against a real,
running Content Provider repo. Recommended as a follow-up the user can
trigger themselves (see `06_others_from_report.md`) — the exact command is
`tsx src/migrateCpToMongo.ts --repo=<a real repo GUID> --dry-run`, safe to
run any time since dry-run never writes.

**Status: PARTIAL**
