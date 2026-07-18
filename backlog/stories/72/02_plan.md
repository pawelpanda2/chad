# Story 72 — Plan: Content Provider → MongoDB primary/follower layer in `packages/dba`

## 0. Documentation actually read (repo has moved since Input 1 was written)

Input 1 assumes paths that no longer match the repo (confirmed by reading
the repo itself, per Input 1's own instruction not to assume paths without
checking):

- `documentation/ai-docs/what-and-where.md` → now
  `ai-docs/begin_here/02_what-and-where.md` (top-level `ai-docs/`, not under
  `documentation/`).
- `documentation/stories/<N>/` → now `backlog/stories/<N>/` (moved in Story
  62, 2026-07-16).
- The six-file Story shape in Input 1
  (`01_input`...`05_report.md`/`06_propositions.md`) → the actual current
  standard (`ai-docs/begin_here/03_story-standard.md`) uses
  `05_tasks_and_checklist.md` (Checklist + per-task write-ups, mandatory)
  and `06_others_from_report.md` (optional), not `05_report.md`/
  `06_propositions.md`. **This Story follows the real current standard**,
  not Input 1's assumed filenames — the final report goes in
  `05_tasks_and_checklist.md`'s task write-ups plus `06_others_from_report.md`
  for the broader narrative Input 1 asked for in `05_report.md`/section 33.

Read in full: `01_ai_start.md`, `02_what-and-where.md`, `03_story-standard.md`,
`05_endpoint-rules.md` (all of `ai-docs/begin_here/`). Read
`documentation/dba/project-goal.md`, `post-parent-item.md`. No CP→Mongo
migration compendium exists in the repo under that name — per Input 1 §1,
this prompt itself is the governing spec.

Story number: **72** (highest existing was 71; `backlog/stories/72/` did not
exist).

## 1. Content Provider contract — audit findings from actual code

(Full file-by-file trail in `03_knowledge.md`.) Key facts, all taken from
`packages/net-content-provider/api_charp/**`, not assumed:

1. **Body file is `body.txt`**, not `body`
   (`PathWorker.SetNames(): contentFileName = "body.txt"`). Folder-type
   items have **no body file at all** — a Folder's "Body" in `ItemModel` is
   *computed at read time* (`ReadFolderWorker.ListOfIndexesQNames`), not
   stored. Confirms Input 1 §6.1's instruction not to guess.
2. **Required config.yaml keys**: exactly `id`, `type`, `name`, `address`
   (`ConfigKeys.cs`; enforced in `ItemModel.Settings` setter, which throws if
   any is missing/empty). `created`/`modified` are **not** part of the real
   CP schema — they don't exist anywhere in the C# codebase (confirmed via
   `grep -r "created\|modified"` across `SharpRepoServiceProg`, zero hits).
   Since `config` is a free-form `Dictionary<string, object>` with only
   those 4 keys enforced, `created`/`modified` (and any other custom field)
   round-trip through CP transparently as ordinary extra YAML keys — Input
   1's canonical model (§5) is legal, just CHAD-authored rather than
   CP-native.
3. **Folder children map**: not stored, always derived — one child's config
   `address` is `parent/<2-or-3-digit-index>`; the map is `{indexString:
   childName}` built from every sibling whose address is exactly one
   segment past the parent's (`ReadFolderWorker.ListOfIndexesQNames` /
   `GetIndexesQNames`).
4. **Next numeric child address** (`ReadFolderWorker.GetNextAdrTuple` →
   `GetFolderLastNumber` → `GetNextIndex`): lists the parent's existing
   child directories, parses each name as an int, takes the max (0 if
   none), adds 1, formats via `IndexOperations.IndexToString`: `n<10` →
   `"0"+n` (01–09), `n<100` → `n.ToString()` (10–99), `n<1000` → plain
   3-digit (100–999), else throws. Ported verbatim into
   `cp-model.ts`'s `formatChildIndex`/`nextChildIndex`.
5. **Duplicate name detection** (`WriteFolderWorker.IfMineParentPost`, the
   real `PostParentItem`): searches existing children by exact `Name`
   match (`ReadMultiWorker.GetItemBySeqOfNames` → `ListOfOnlyConfigItems`
   filtered by `.Name == name`); if found, returns the existing item
   (idempotent find-or-create, no error); if not found, allocates the next
   index, generates a **new GUID**, writes config, returns the new item.
   **This means the follower-side write for a create-child command must
   use `Put` (write exact settings at an exact, already-decided address),
   never `PostParentItem`** — calling `PostParentItem` on the follower
   would let CP re-run its own name-search/numbering and could produce a
   different address or GUID than the primary already committed to. This
   directly satisfies Input 1 §8/§23 ("follower nie może sam ponownie
   wybierać kolejnego numeru dziecka").
6. **Request/response shape**: `/invoke` takes `string[]` args
   (`[service, worker, method, ...params]`) and returns either the raw
   JSON of `ItemModel` (`Settings`/`Body`, PascalCase C# properties;
   `Settings` itself is a plain dict so its own keys — `id`, `type`,
   `name`, `address` — are lowercase, straight from YAML) or, on a domain
   exception, the literal text `"error:" + JSON(BackendErrorInfo)` with
   **HTTP 200** (`StringArgsResolverService.TryInvoke`) — a second,
   different `{error:{...}}` shape with HTTP 500 is possible from a
   separate top-level exception-handling middleware
   (`DefaultPreparer.ConfigureWebApp`). Both already documented in Story 64
   (diagnostics Story, not yet implemented) — `LegacyContentProviderAdapter`
   reuses `packages/dba/src/client.ts`'s existing `invokeContentProvider`,
   which already throws on non-2xx and on unparseable bodies; this Story
   does not change that error handling.
7. **Methods actually used by CHAD today** (grepped across
   `packages/dba/src/*.ts`): `GetByNames`, `GetAllReposNames` (via
   `getAllRepos`), `PostByNames`, `GetManyByName` (`IManyItemsWorker`),
   and — per `documentation/dba/post-parent-item.md` and
   `daily-tracker-dates.md` (Story 62 index entry) — `PostParentItem` and
   `Put` are the established write patterns elsewhere in `dba` (e.g.
   `report-entries.ts`, `statuses-dashboard.ts`). `GetItem`/`GetByNames2`
   are defined on `IItemWorker` but not yet called from any `packages/dba`
   source file today — first real callers are this Story's new
   `LegacyContentProviderAdapter`.
8. **Mongo has no replica set** (`ai-docs/deploy/
   2026-07-10_mongodb-replica-set-migration-plan.md`: "Mongo pozostaje
   standalone... na dziś"). **Multi-document ACID transactions are
   unavailable** on a standalone MongoDB instance — this directly affects
   §13's "primary write + outbox in one transaction" requirement; see
   §5 below for the fallback design Input 1 itself asked for in that case.

## 2. Architecture

### 2.1 Canonical model (`packages/dba/src/cp-model.ts`)

`CpItemConfig` (required `id`/`address`/`type`/`name`, optional
`created`/`modified`, open index signature for arbitrary custom fields) and
`CpItem` (`_id`, `config`, `body: string`) exactly as Input 1 §7, plus:

- `validateCpItem(item)` — the 8 checks from §7, in one place, returning a
  typed result (`{ ok: true } | { ok: false, errors: string[] }`) so
  providers never re-implement validation (§7's "nie duplikuj walidacji").
- Address helpers ported from the C# audit: `formatChildIndex(n)`,
  `parseChildIndex(segment)`, `splitAddress(address)` (repo GUID + loca
  segments), `joinAddress(...)`, `nextChildIndexFromSiblings(existingAddresses,
  parentAddress)`.

### 2.2 Commands (`packages/dba/src/data-commands.ts`)

`PutItemCommand` / `CreateChildItemCommand` per §8, both carrying the fully
decided `CpItem` (so the follower never invents its own id/address/dates).
Builders (`buildPutItemCommand`, `buildCreateChildItemCommand`) generate
`operationId` (UUID v4) and `createdAt`/timestamps using one shared,
injectable clock/id generator (§28 "testowalny clock i generator GUID") —
`packages/dba/src/data-clock.ts`.

### 2.3 Provider interface (`packages/dba/src/data-providers/types.ts`)

`CpCompatibleDataProvider` per §9, with `GetItemInput`
(`{ repoGuid, address } | { id }` — see §10 "po trwałym id lub po pełnym
config.address", both supported since callers vary), `GetByNamesInput`
(`repoGuid`, `names: string[]`, resolved hierarchically parent-by-parent —
§10/§23, mirroring `IItemWorker.GetByNames`'s real sequential-name-walk
semantics, not global name search), `GetByNames2Input` (adds a starting
loca, matching `ItemWorker.GetByNames2`'s signature), `DataWriteResult`
(`{ item: CpItem; alreadyExisted: boolean }`).

### 2.4 `MongoCpProvider` (`packages/dba/src/data-providers/mongo-cp-provider.ts`)

- Database: the existing shared `getMongoDb()` (`packages/dba/src/mongo.ts`)
  — no new connection. Collection: **`items`** per §10.
- Indexes (idempotent `createIndex`, safe to call every startup):
  `_id` (native unique, no action needed), unique index on `config.address`.
- `getItem`: by `_id` (Mongo native) or by `config.address` (indexed
  lookup) — both paths supported, caller picks (mirrors CP's own two
  natural lookup keys, per audit point 6).
- `getByNames`/`getByNames2`: walk one name at a time — at each step, find
  the current parent's children (documents whose `config.address` is
  exactly `parentAddress + "/" + <index>`, one segment deeper) and pick the
  one whose `config.name` matches; fail if not found. **Never** a global
  `find({"config.name": name})` (§10 explicit prohibition — names aren't
  globally unique).
- **Folder children are never stored** — matching the CP audit finding
  (2.1/§5 above): a Folder document's `body` is always `""`; "children" are
  computed on demand the same way `getByNames` finds them, by querying
  siblings one address-segment deeper.
- `put` (write path for `PutItemCommand`): `findOneAndUpdate({_id},
  {$set: {config, body}, $setOnInsert: {createdAt-preserving config.created}},
  {upsert: true})` — preserves `config.created` across updates (only set on
  insert), always refreshes `config.modified`. Enforces `_id ===
  config.id` before the write (reuses `cp-model.ts`'s validator).
  `config.address` uniqueness is enforced by the unique index — a genuine
  address collision on a *different* `_id` surfaces as a Mongo duplicate-key
  error, translated to a typed `AddressConflictError`.
- **Create-child (find-or-create)**: this is the one place needing real
  concurrency safety, and the one place Input 1 §13 asks about
  transactions. Standalone Mongo (audit point 8) has **no multi-document
  transactions**, so the design is:
  1. A dedicated **atomic counter document** per parent
     (`folder_child_counters` collection, `_id: parentAddress`), reserved
     via `findOneAndUpdate({_id: parentAddress}, {$inc: {lastIndex: 1}},
     {upsert: true, returnDocument: "after"})` — a **single-document**
     operation, which is atomic on MongoDB regardless of replica-set
     status. This is the race-condition guard Input 1 asks for (§10 "unikaj
     race condition"), achieved without needing transactions.
  2. Before reserving a new index, re-check for an existing child with the
     same `name` under that parent (the normal find-or-create check) — if
     found, return it, no counter increment, no insert (idempotent).
  3. Insert the new document with the reserved address. The unique index
     on `config.address` is a second, independent safety net: if the
     counter and the actual sibling set ever disagree (e.g. a previous
     crash left the counter ahead of reality), the insert either succeeds
     cleanly at the reserved address or fails on a duplicate key, which is
     reported rather than silently overwriting anything.
  - **Primary-write + outbox-enqueue is not transactional** (no
    transactions available at all, not just for this operation) —
    documented honestly per Input 1 §13's fallback instructions:
    - **Cause**: standalone MongoDB, no replica set (see audit point 8).
    - **Risk**: a crash between "item/child written" and "outbox job
      written" loses that one follower sync silently.
    - **Reconciliation**: `data-outbox.ts` exports
      `reconcileMissingOutboxJobs()` — scans `items` for documents whose
      `operationId` (stored on the document) has no matching
      `data_sync_outbox` entry for an enabled follower, and backfills the
      job. Documented as a periodic/manual repair step in
      `06_others_from_report.md`, not wired into a cron in this Story
      (out of scope — see "What was deliberately not implemented").

### 2.5 `LegacyContentProviderAdapter` (`packages/dba/src/data-providers/legacy-cp-provider.ts`)

Wraps the **existing** `invokeContentProvider` (`client.ts`) — no direct
HTTP calls, no dashboard-level CP access (§9, `05_endpoint-rules.md` §2).
- `getItem`: `IItemWorker.GetItem(repo, loca)` (address form only — CP's
  `/invoke` has no bare-id lookup other than `GetByGuid`, which resolves a
  Ref target, not a general id lookup).
- `getByNames`: `GetByNames`. `getByNames2`: real CP's `GetByNames2`
  returns only the final resolved item, not the whole trail — to keep the
  same "full trail" shape as `MongoCpProvider.getByNames2` (which returns
  it cheaply, just N Mongo queries), the adapter calls real `GetByNames2`
  once per prefix length (N real calls for N names). Extra network calls,
  not extra write-path cost — this provider isn't wired into a live
  request path in this Story.
- `executeWrite` for both command kinds ultimately calls `IItemWorker.Put(
  repo, loca, type, name, body)` at the command's already-decided address.

**Correction (found while implementing, not assumed in advance): `Put` and
`PostParentItem` cannot carry a caller-decided `id` or custom config
fields.** Audited `WriteTextWorker.IfMinePut`/`WriteFolderWorker.IfMinePut`
(the real code behind `Put`): both **unconditionally replace `Settings`**
with a **freshly minted `Guid.NewGuid()`** plus only `{id, type, name,
address}` — every custom field is dropped and the id changes on every
single `Put`, not just on create. The one CP method that would preserve an
exact config dict as-is, `IItemWorker.PutConfig(adrTuple, Dictionary<string,
object>)`, takes a non-string parameter type that
`StringArgsResolver/FindParameters.cs`'s `ConvertParamFromString` cannot
convert — **it is not callable through the reflection-based `/invoke`
wire protocol at all**, confirmed by reading that converter's full type
list (string/int/long/ulong/bool/Guid/DateTime/enum/nullable, nothing
else).

**Consequence, stated plainly:** with Content Provider as the follower,
this Story's code guarantees the **same address** as the primary decided
(§23's emphasized invariant — achieved by writing at the exact repo+loca
the command carries, never `PostParentItem`, which would let CP allocate
its own next index). It **cannot** currently guarantee the **same id/GUID**
as the primary (§8/§29) for CP-follower writes — CP always assigns its
own, and drops custom config fields, on every `Put`. This is a genuine,
audited limitation of the *current* Content Provider wire API, not a
shortcut taken here. Closing it would require adding a new CP-side write
method that accepts and preserves a caller-supplied `id`/config dict — a
`packages/net-content-provider` change, explicitly out of this Story's
scope (§27: "zmieniaj tylko, gdy konieczne"). Flagged as the single most
important open risk in `06_others_from_report.md`.

### 2.6 Config (`packages/dba/src/data-providers/config.ts`)

`DbaDataProvidersConfig` per Input 1 §4, loaded from env vars following the
existing lazy-read pattern (`client.ts`/`mongo.ts`'s `getContentProviderApiUrl`/
`getMongoUri` — read inside a function, not at module load, so Next.js
build-time page-data collection doesn't fail before docker-compose injects
runtime env). New env vars only (no new ad-hoc system, §4):
`DBA_MONGO_ENABLED`, `DBA_CONTENT_PROVIDER_ENABLED`, `DBA_PRIMARY_BACKEND`,
`DBA_FOLLOWER_WRITES_ENABLED`, `DBA_SHADOW_READS_ENABLED`.
`validateDataProvidersConfig()` throws (fails startup) if the configured
primary's own `*Enabled` flag is off — Input 1 §4's explicit requirement.

### 2.7 `DbaDataRouter` (`packages/dba/src/data-router.ts`)

Exactly the shape in Input 1 §11: resolves primary from config, awaits
`primary.executeWrite(command)` synchronously, and — only if a follower is
configured and enabled — enqueues (does **not** call) the follower's
operation via the outbox, wrapped so a follower-enqueue failure is logged
but never turns a successful primary write into a failed response (§11's
"błąd followera nie zmienia sukcesu primary" — enqueue failure is treated
the same as a follower error for this purpose). Read path
(`executeGetItem`/`getByNames`/`getByNames2`) reads only from primary and,
when `shadowReadsEnabled`, fires an async (non-blocking) comparison against
the follower via `data-sync-diagnostics.ts` — never blocks or alters the
response (§16).

### 2.8 Outbox (`packages/dba/src/data-outbox.ts`)

Collection `data_sync_outbox`, document shape exactly per Input 1 §12.
`_id` is literally `${operationId}:${followerBackend}` (§12's uniqueness
requirement is then enforced by Mongo's native `_id` uniqueness — no
separate index needed). Statuses: `pending`, `processing`, `retry`,
`synced`, `failed`, `conflict` (§12). Functions: `enqueueFollowerOperation`,
`claimNextJob` (atomic `findOneAndUpdate` filtering `status in
[pending,retry]` and `nextAttemptAt <= now`, setting `processing` +
`lockedAt`/`lockedBy` — the single-document atomicity that makes "no two
workers process the same job" possible without transactions),
`markSynced`, `markRetry` (backoff per §14: 1m/5m/15m/1h/6h, `failed` after
the list is exhausted), `markConflict`, `recoverStaleLocks` (jobs stuck in
`processing` past a lock-timeout get reset to `retry` — crash recovery,
§14 point 10), `reconcileMissingOutboxJobs` (§2.4 above).

### 2.9 Outbox worker (`packages/dba/src/data-outbox-worker.ts`)

`processOutboxJobsOnce()` (claim → look up follower provider → execute →
mark result) and `runOutboxWorker(intervalMs)` (a simple `setInterval`
loop calling `recoverStaleLocks` then `processOutboxJobsOnce` in a loop
until no jobs remain) — process placement (which long-lived Node process
runs this loop) is a deploy-time decision out of this Story's scope (§27
"nie modyfikuj deployment scripts... chyba że minimalna zmiana jest
bezpośrednio wymagana" — wiring it into a specific running process is
exactly that kind of deploy change); the worker module itself is complete
and independently invocable/testable. Idempotency/conflict handling per
§15: replaying an already-`synced` operationId is a no-op (checked before
re-executing); if the follower's current state at that id/address
disagrees with the command's expected state, the job is marked `conflict`
with a diagnostic diff, never blindly overwritten.

### 2.10 Sync diagnostics (`packages/dba/src/data-sync-diagnostics.ts`)

Collection `data_sync_diagnostics` (or reuses the outbox job's own
`lastError`/status fields for the outbox-failure case — a **separate**
collection is only needed for **shadow-read mismatches**, which aren't
outbox jobs at all). Records exactly the fields in §17, mismatch
categories exactly as §16's list. Never logs full `body` — truncated/
redacted per §16 ("nie loguj całego body").

### 2.11 Migrator (`packages/console/src/migrateCpToMongo.ts`)

Follows the existing `packages/console` convention (plain module + `tsx`,
same shape as `statusMigration.ts`), since there is no command-registry
system in `packages/console` to plug into (confirmed by reading
`cli.ts`/`main.ts`/`package.json` — just directly-invoked scripts). Modes
`--dry-run` / `--validate-only` / `--apply` per §18, walks a given repo via
the legacy adapter's `getByNames2`-style traversal, builds
`PutItemCommand`s via the same `cp-model.ts`/`data-commands.ts` used
everywhere else (no separate ad-hoc mapping), writes through
`MongoCpProvider.executeWrite` directly (bypassing the router — a
migration is explicitly a one-directional bulk import, not a live
primary/follower write), and prints the exact report fields from §18.

## 3. What's deferred (honest scope cut, not silently skipped)

- Delete/Move: explicitly out of scope per §19 — CP's own `DeleteWorker`
  is a confirmed empty stub (`documentation/dashboard/forms/features/
  daily-tracker-dates.md`), and no semantics were specified to implement
  against.
- Rewiring existing `dba` business functions (`leads.ts`, `report-entries.ts`,
  etc.) to go through `DbaDataRouter` (§20): the router/provider layer
  itself is this Story's deliverable; migrating existing call sites is a
  larger, separately-reviewable change per function (each one needs the
  "check existing pattern, verify compatibility" step from
  `05_endpoint-rules.md` §5) — flagged as a concrete follow-up in
  `06_others_from_report.md`, not silently dropped.
- Wiring the outbox worker into an actual long-running process/deploy slot.
- A cron/scheduled call to `reconcileMissingOutboxJobs`.
- `--apply` mode of the migrator exercised against anything beyond a
  disposable temporary test repo (§25 forbids real user data in tests, and
  no real cutover is in scope per §26).
