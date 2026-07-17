# Story 72 — Knowledge

Pointers into the code this Story depends on, and why.

## Content Provider contract (C#, `packages/net-content-provider/api_charp/SharpRepoService/SharpRepoServiceProg/`)

- `Workers/System/PathWorker.cs` — `contentFileName = "body.txt"`,
  `configFileName = "config.yaml"`. `GetItemPath`/`GetConfigPath`/
  `GetBodyPath` all build `repoPath + "/" + loca (+ "/" + filename)`.
- `AAPublic/Names/ConfigKeys.cs` — the only 4 config keys the codebase
  actually names: `type`, `name`, `id`, `address` (+ `refAddress`/`refGuid`/
  `googleDocId`, unrelated to this Story). No `created`/`modified` anywhere.
- `Models/ItemModel.cs` — `Settings` setter (`SetIndentificators`) is where
  the 4 required keys are enforced; throws `InvalidOperationException` with
  a real message (unlike `PathWorker.HandleError()`, see Story 64) if any
  is missing/null/empty. `Address` setter parses the string into
  `AdrTuple: (Repo, Loca)` via `CustomOperationsService.UniAddress`.
- `Workers/CrudReads/ReadFolderWorker.cs`:
  - `GetNextAdrTuple`/`GetNextIndex`/`GetFolderLastNumber` — the next-child
    numbering algorithm, based on scanning physical sibling directory
    names (not config addresses) and taking `max+1`.
  - `ListOfIndexesQNames`/`GetIndexesQNames` — how a Folder's children map
    is actually produced: iterate siblings one address segment past the
    parent, key by zero-padded index string, value is each sibling's
    `Name`. **Not stored anywhere** — always recomputed.
- `Workers/CrudWrites/WriteFolders/PostWriteFolderWorker.cs` —
  `IfMineParentPost` is the real `PostParentItem`: exact-name match against
  existing children (find-or-create); on miss, allocates next index via
  `ReadFolderWorker.GetNextAdrTuple`, assigns a **new `Guid.NewGuid()`**,
  writes config. This is the exact place a race between two concurrent
  `PostParentItem` calls on the *same* CP instance could double-allocate —
  CP itself has no lock here; not this Story's problem to fix in CP, but
  the reason the Mongo side needs its own atomic counter (`02_plan.md`
  §2.4) rather than copying this exact scan-then-write pattern.
- `Workers/CrudWrites/WriteMultiWorker.cs` — `PostItem`/`PutItem` dispatch
  by type to `WriteFolderWorker`/`WriteTextWorker`/`WriteRefWorker`, and run
  `ValidationWorker` checks first (Story 64 also touched
  `ValidationWorker.cs` — same file, unrelated concern there).
- `AAPublic/IItemWorker.cs` — full public method list: `GetItem`,
  `GetByNames`, `GetByNames2`, `GetManyItemByName`, `GetItemBySeqOfNames`,
  `GetBody`, `AppendLine`, `PutItem`, `Put`, `PutConfig`, `GetByGuid`,
  `PostParentItem`, `PostByNames`.
- `Workers/APublic/ItemWorkers/PostItemWorker.cs` / `PutItemWorker.cs` — the
  thin `ItemWorker` (`IItemWorker` implementation) wrappers around
  `WriteMultiWorker`, JSON-serializing the resulting `ItemModel`.
- `Workers/Operations/Index/IndexOperations.cs` (in
  `SharpOperations/SharpOperationsProg`) — `IndexToString`/`StringToIndex`,
  the exact zero-padding rule ported into `cp-model.ts`.
- `/invoke` wire protocol and error shapes — already fully documented in
  Story 64's `03_knowledge.md`/`02_plan.md` (not repeated in full here);
  relevant fact for this Story: `packages/dba/src/client.ts`'s
  `invokeContentProvider` already throws on non-2xx/unparseable bodies, so
  `LegacyContentProviderAdapter` doesn't need its own error translation
  layer beyond catching and attaching `operationId`/`address` context.

## `packages/dba` existing conventions (all read in full before writing new code)

- `src/mongo.ts` — the *only* place allowed to hold a MongoClient; `getMongoDb()`
  returns the shared `chad` `Db` handle (DB name comes from `MONGODB_URI`'s
  path). New collections (`items`, `data_sync_outbox`,
  `data_sync_diagnostics`, `folder_child_counters`) live in this same
  database, reusing this same connection — no second client.
- `src/repo-context.ts` — `getCurrentRepoGuid()`/`runWithRepoContext`,
  AsyncLocalStorage-based per-request repo isolation. `MongoCpProvider`
  must not trust a caller-supplied repo GUID for cross-repo reads; combined
  with the address-prefix check (config §21), a `getItem({id})` lookup by
  bare `_id` is additionally checked that the resulting document's
  `config.address` starts with the caller's own repo GUID before returning
  it — otherwise one user's Mongo `_id` guess could read another repo's
  item even though CP itself doesn't expose that lookup path publicly.
- `src/repo-access.ts` — strict `chad_<username>` repo-name matching,
  unrelated to this Story's provider layer directly, but the precedent for
  "never trust a client-supplied identifier without checking it against
  the resolved-server-side truth."
- `src/path-resolver.ts` — existing `chad_ResolveByNames`/
  `chad_GetLocaFromAddress`/`chad_GetRelativeLoca` helpers already do
  ad-hoc address-string manipulation against the legacy CP client
  directly; `cp-model.ts`'s address helpers are the provider-agnostic
  versions of the same string algebra, usable by both providers.
- `src/client.ts` — `invokeContentProvider(args: string[])`, the one
  legacine CP call surface; `LegacyContentProviderAdapter` is a thin
  provider-shaped wrapper over this, not a new HTTP client.
- `package.json` — no test framework (no vitest/jest). Existing
  `*.test.ts` files (`repo-access.test.ts`, `headers-parser.test.ts`) are
  hand-rolled: a local `test(name, fn)` helper catching thrown errors,
  `console.log` pass/fail, `runTests()` at the bottom, `process.exit(failed
  > 0 ? 1 : 0)`. Run via `npx tsc && node dist/<file>.test.js` (confirmed by
  actually running `repo-access.test.js` this way — 13/13 passed). New
  tests in this Story follow the identical shape for consistency.

## `packages/console`

- `src/statusMigration.ts` — precedent for a migration-flavored module in
  this package: plain exported functions, no CLI-framework dependency.
  `package.json` scripts (`dev`, `cli`, `test:write`) are all direct `tsx
  src/<file>.ts` invocations — confirmed there is no command-registry
  system to plug a new migrator into (Input 1 §18's conditional "jeżeli
  istnieje system commandów... użyj go" — it doesn't exist, so a new
  directly-runnable module is the correct, repo-consistent choice).

## Deploy / infra facts affecting this Story's design

- `ai-docs/deploy/2026-07-10_mongodb-replica-set-migration-plan.md` — Mongo
  is standalone (no replica set) "for now." **No multi-document
  transactions available** — directly shapes `02_plan.md` §2.4's atomic
  counter + reconciliation design instead of a transactional
  write-item+enqueue-outbox pair.
- Local dev Mongo: `chad-mongodb-local-mac-docker` container, already
  running on `localhost:27017`, credentials `change_me`/`change_me` (yes,
  literally — `.env.local`'s real configured default, confirmed via
  `docker-compose.local.yml`'s `MONGO_INITDB_ROOT_USERNAME/PASSWORD`
  defaults). Tests in this Story connect to this real local instance using
  a dedicated test-only database name (never the `beeper` database real
  dashboard data lives in), per Input 1 §25's "no real user data in tests."

## Story-standard mechanics

- `ai-docs/begin_here/03_story-standard.md` — story folders at
  `backlog/stories/<N>/`; `05_tasks_and_checklist.md` mandatory (Checklist
  + per-task write-ups together); `06_others_from_report.md` optional, for
  everything else (architecture decisions, deferred scope, follow-ups).
  This Story's final report (Input 1 §33) is split across both: functional,
  user-checkable items in `05_tasks_and_checklist.md`; the fuller
  narrative (documents read, contract findings, risks, commits) in
  `06_others_from_report.md`.
