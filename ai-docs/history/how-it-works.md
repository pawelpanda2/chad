# History (transactional, cp_history) — how it works

Status: rewritten 2026-07-23, Story 79 — replaces the Change-Stream-based
mechanism Story 74 built and Story 78 hardened. Read `backlog/stories/79/`
for the full rationale; `backlog/stories/74/` and `backlog/stories/78/` are
kept as historical record of the superseded approach (their `rs0`
replica-set work is still in effect, just repurposed — see below).

## Why this changed

Story 74/78's `history-worker` derived `cp_history` asynchronously from a
MongoDB Change Stream watching `cp_items` — a separate process, its own
resume-token/shadow-state collections (`cp_history_state`,
`cp_history_last_state`), in-memory caches to rebuild across restarts.
Story 79 replaced all of that with a single MongoDB **transaction** around
every `cp_items` write: the mutation and its one `cp_history` event commit
together, or neither commits. No separate process, no resume token, no
shadow state, no Change Stream at all.

## Pipeline

```
Dashboard UI/API
  -> dba (leads.ts, repo-context.ts, data-commands.ts, data-router.ts)
  -> MongoCpProvider.putItem / .createChild / .deleteItem
       (packages/dba/src/data-providers/mongo-cp-provider.ts)
  -> executeCpMutationWithHistory (packages/dba/src/cp-history/mutate.ts)
       one MongoDB transaction:
         read current cp_items doc (same session)
         compute version / diff / hashes / mutationId
         write cp_items
         insert exactly one cp_history doc
         commit
  -> packages/dba/src/cp-history.ts (read side)
  -> packages/dashboard/app/api/content-provider/{history,daily-history,dates-history}
  -> packages/dashboard/app/(dashboard)/dashboard/history/{page.tsx,entry/[id]/page.tsx}
```

`MongoCpProvider`'s `putItem`/`createChild`/`deleteItem` are the **only**
three places in the whole monorepo that ever write `cp_items` — every
business function (`leads.ts`'s Daily/Date Entry save/update/delete, the
folder-chain helpers used by Views) already goes through
`mongo.executeWrite(command)` or `mongo.deleteItem(address)`, so wiring
those three methods was enough to make history impossible to bypass
without touching any call site.

## `rs0` — still needed, different reason

MongoDB requires a replica set for **both** Change Streams (Story 74's
original reason) **and** multi-document transactions (Story 79's reason).
`rs0` itself — the single-node replica set, its keyfile, its idempotent
initialization (`bash-scripts/mongo/rs-init.js`) — is completely unchanged
by this Story. See Story 74's own doc (superseded above) for how `rs0` is
configured/verified; nothing there changed.

## `cp_items` bookkeeping fields (Story 79)

Every `cp_items` document now carries, as top-level siblings of
`config`/`body` (never inside `config` — so they never affect the content
hash, see below):

```js
{
  _historyVersion: number,       // 1 on first insert, +1 per mutation
  _lastMutationId: string,       // ties this state to its cp_history event
  _lastActor: { username, repoGuid } | null,
  _lastRequestId: string | null,
}
```

A document written before this Story has none of these fields. Mutating it
throws `CpItemNotMigratedError` — deliberately, never a silent guess at a
starting version. See "Migrating pre-Story-79 data" below.

## `cp_history` — the only history/audit collection

One document per mutation, `_id === mutationId`:

```js
{
  _id, mutationId, requestId,
  sourceCollection: "cp_items", sourceId, repoGuid, address, itemName,
  version, operationType,                 // insert | update | delete
  actor: { username, repoGuid, kind },    // kind: user | system | migration
  changedAt,
  beforeHash, afterHash,                  // sha256 of canonical {config,body}
  changes: { config: [...ops], body: [...hunks] | null },
  afterSnapshot: { config, body } | null, // insert: always. delete: pre-delete state. update: every HISTORY_SNAPSHOT_INTERVAL-th version only.
  metadata: { endpoint?, commandKind?, environment?, seedRunId? },
}
```

- **Hash chain**: `beforeHash` of version N equals `afterHash` of version
  N-1 (verified by the integrity checker, see below). `afterHash` of the
  latest event for a still-existing item always equals
  `hashCpState(currentItem.config, currentItem.body)`.
- **`itemName`**: the item's `config.name` at the time of the event —
  stored directly (not derived from a snapshot, which isn't present on
  every event) for the Dashboard History table's "Item" column. Events
  from before this field existed fall back to the address's last segment
  at read time (`cp-history.ts`'s `toListItem`) — a documented fallback,
  never a silent invention.
- **Idempotency**: `_id === mutationId` — a retried mutationId either
  short-circuits on a pre-transaction lookup or hits the collection's own
  unique-`_id` constraint; either way, exactly one event, one version.
  Reusing a mutationId for a *different* item is rejected
  (`CpMutationIdReusedError`), never silently treated as a replay of the
  wrong item.
- **Concurrency**: two concurrent mutations of the same item rely on
  MongoDB's own transaction conflict detection — the losing transaction
  gets a `TransientTransactionError`, which the driver's
  `session.withTransaction()` retries automatically, re-reading the
  now-updated version. No custom optimistic-lock code needed.

## No pre-Story-79 collections in the read/write path

`cp_history_state` and `cp_history_last_state` are no longer read or
written by anything (they may still physically exist from Story 74/78 on a
long-lived deployment — nothing in this Story drops them automatically,
since that would be a destructive operation on shared data outside this
Story's scope). `packages/history-worker` is retired: its `index.mjs` is
now a no-op stub that logs a clear message and exits if something still
starts it (see the file's own header comment) — no docker-compose file in
this repo references it anymore.

## Migrating pre-Story-79 data

`packages/dba/scripts/migrate-legacy-cp-items-to-history.mjs --repoGuid=<guid> [--apply]`
— explicit, per-repoGuid, dry-run by default. For each `cp_items` document
under that repoGuid missing `_historyVersion`, establishes
`_historyVersion: 1` and a matching `insert`-shaped `cp_history` event
built from the document's own current state (`actor.kind: "migration"`),
via `migrateLegacyCpItem` (`cp-history/mutate.ts`) — the same transactional
guarantee as a live mutation. Idempotent (already-migrated items are
skipped, not re-processed).

## Integrity checking

`pnpm test:cp-history:integrity -- --repoGuid=<guid>` (or
`CP_HISTORY_INTEGRITY_REPO_GUID=<guid>`) —
`packages/dba/scripts/cp-history-integrity-check.mjs`. Per repo, verifies:
version continuity (1..N, no gaps/duplicates), the hash chain, that the
last event for a still-existing item matches current `cp_items` exactly,
that a deleted item's last event is a `delete` with no surviving document,
that every event carries `actor`/`repoGuid`/`address`, and that
insert/delete snapshots self-consistently hash to their own
`afterHash`/`beforeHash`. Prints a plain-text report and exits non-zero on
any inconsistency — no separate error collection is ever written.

## How to test locally

```bash
pnpm test:unit                      # hash/diff/versioning — no Mongo needed
pnpm test:integration:local-mongo   # real local rs0: mutate.test.ts + cp-history.test.ts + google-sheets/config.test.ts
```

`mutate.test.ts` (`packages/dba/src/cp-history/mutate.test.ts`) calls
`executeCpMutationWithHistory` directly against the real local `rs0` — no
child process to spawn, no restart to simulate (there's no separate
process left to restart).

## Rollback

There is no longer a separate "history" process to stop — history is
inseparable from the `cp_items` write itself (same transaction). Disabling
history entirely would mean not calling `executeCpMutationWithHistory`,
which is not a supported configuration (it's the only write path). Rolling
back this Story means reverting to the Story 78 code (Change Streams +
`history-worker`) via git — `rs0` itself needs no change either way.
