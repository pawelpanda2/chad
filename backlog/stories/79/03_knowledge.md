# Story 79 — Knowledge

Pointers needed to work on this Story's area again later.

- **`packages/dba/src/data-providers/mongo-cp-provider.ts`** — the ONLY
  three call sites that write `cp_items` in the whole monorepo: private
  `putItem`/`createChild`, public `deleteItem`. Confirmed by grep across
  `packages/dba/src` and `packages/dashboard` for `ITEMS_COLLECTION`/
  `cp_items` writes. Everything else (`leads.ts`, API routes) calls these
  through `mongo.executeWrite(command)` or `mongo.deleteItem(address)` —
  this is why rewiring three methods was enough to make
  `executeCpMutationWithHistory` a true single choke point without
  touching any business function.
- **`packages/dba/src/data-commands.ts`** — `PutItemCommand`/
  `CreateChildItemCommand` already carry a stable `operationId` (generated
  once at command-build time via `clock.newId()`) and an `actor` stamped
  from `tryGetCurrentActor()`. Story 79 reuses `operationId` directly as
  `mutationId` — no new id-generation scheme needed.
- **`packages/dba/src/repo-context.ts`** — `AsyncLocalStorage`-based
  per-request context. Extended (non-breaking: new field is optional) with
  `requestId` and a matching `tryGetCurrentRequestId()`, mirroring the
  existing `tryGetCurrentActor()` pattern exactly.
- **`packages/dba/src/mongo.ts`** — added `getMongoClient()` (the shared
  `chad` database's `MongoClient` itself, not just its `Db`) — needed
  because `executeCpMutationWithHistory` must open a `ClientSession` for a
  transaction, which `getMongoDb()` alone can't provide.
- **`ai-docs/history/how-it-works.md`** (Story 74/78) — describes the
  Change-Stream-based mechanism this Story replaces. Its `directConnection=true`
  note (host-side connections to the local `rs0` must use it, or the
  driver tries and fails to resolve the Docker-internal hostname during
  topology discovery) is still accurate and was hit repeatedly while
  writing/running this Story's own tests and scratch scripts.
- **`backlog/stories/74/`, `backlog/stories/78/`** — the two prior Stories
  this one supersedes for the *mechanism* (Change Streams + `history-worker`
  + `cp_history_state`/`cp_history_last_state`), while their `rs0`
  replica-set setup itself is kept and repurposed (transactions instead of
  Change Streams).
- **`packages/dba/src/data-outbox.ts`** (Story 72) — the existing
  `data_sync_outbox` transactional-outbox pattern for CP-follower writes.
  Confirmed untouched and unrelated to history per Input 1's explicit
  instruction; its pre-existing non-atomicity relative to the primary
  write (enqueue happens after the primary write, outside any shared
  transaction) is a known, pre-existing gap, not something this Story
  introduces or fixes.
- **`docker-compose.local.yml` / `docker-compose.qnap.shared.yml`** — both
  already ran MongoDB as a single-node `rs0` (Story 74, for Change
  Streams). Story 79 needed no new replica-set work, only removed the
  `history-worker` service block from both files (the replica set itself
  stays, now serving transactions instead).
