# Story 79 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE | | Transactional `executeCpMutationWithHistory` — cp_items mutation + one cp_history event commit atomically |
| 2 | DONE | | `_historyVersion`/`_lastMutationId`/`_lastActor`/`_lastRequestId` added to cp_items, migration-gated (no silent guessing) |
| 3 | DONE | | `cp_history` single-collection model: version, mutationId, requestId, repoGuid, itemName, actor.kind, hashes, changes, afterSnapshot, metadata |
| 4 | DONE | | Deterministic canonical hash of `{config, body}`, hash-chain (`beforeHash(N) == afterHash(N-1)`) |
| 5 | DONE | | Snapshot cadence: full on insert/delete, every `HISTORY_SNAPSHOT_INTERVAL` (20) on update |
| 6 | DONE | | Idempotency (same mutationId => one event) + concurrency (two concurrent updates => distinct versions, no lost update) |
| 7 | DONE | | Delete: full snapshot, `afterHash: null`, second delete rejected (no fabricated event) |
| 8 | DONE | | `MongoCpProvider` rewired — `leads.ts`/API routes needed zero changes (already funneled through 3 call sites) |
| 9 | DONE | | Only 2 indexes added to cp_history (`{sourceId,version}` unique, `{repoGuid,changedAt}`, `{address,changedAt}` — `mutationId` needs none, it IS `_id`) |
| 10 | DONE | | `cp-history.ts` read side rewritten: version-sort for one item, changedAt+_id sort globally, `repoGuid` field isolation (stricter than the old regex) |
| 11 | DONE | | `history-worker` retired: docker-compose services removed, package neutered to a safe no-op stub, its own tests deleted (superseded by `mutate.test.ts`) |
| 12 | DONE | | Migration script (`migrate-legacy-cp-items-to-history.mjs`) — explicit, per-repoGuid, dry-run default, idempotent — smoke-tested |
| 13 | DONE | | Integrity checker (`pnpm test:cp-history:integrity`) — smoke-tested including deliberate corruption detection (non-zero exit) |
| 14 | DONE | | Unit tests (28: hash/diff/versioning-adjacent) + integration tests (14: mutate.test.ts against real local rs0) + read-side tests (20: cp-history.test.ts) — all passing locally |
| 15 | DONE | | Dashboard History GUI rewrite: table (Date/Operation/Item), "All" filter, no pagination/accordion, separate details route |
| 16 | DONE | | Playwright spec for the new History UI written (`test/e2e/history-ui.spec.mjs`) |
| 17 | NOT DONE | | QNAP TEST deployment and running the Playwright/E2E suite against it |
| 18 | NOT DONE | | Full `test3` E2E walkthrough (create → update → delete Daily/Date Entry through the real UI on QNAP TEST) |
| 19 | NOT DONE | | Seed-from-scratch procedure executed against any real (even TEST) data — no real `cp_items` were migrated/re-seeded, only smoke-tested against scratch databases |
| 20 | PARTIAL | | `requestId` end-to-end plumbing — the mechanism exists (`repo-context.ts`, `CpMutationContext.requestId`) but no Dashboard API route was changed to actually generate/forward one; every real mutation today still carries `requestId: null` |

## Task write-ups

### 1–7 — Transactional core (`packages/dba/src/cp-history/{hash,diff,mutate}.ts`)

Built and tested bottom-up: `hash.ts`/`diff.ts` first (pure, unit-tested,
zero Mongo), then `mutate.ts`'s `executeCpMutationWithHistory` against the
real local `rs0`. Two real bugs were found and fixed by the integration
tests themselves before this was considered working, not just written:

- The idempotency pre-check (`historyCol.findOne({_id: mutationId})`)
  didn't originally verify the found event's `sourceId` matched the
  requested item — a reused mutationId across two different items would
  have silently returned the first operation's result for the wrong item.
  Fixed with `CpMutationIdReusedError`, both at the pre-check and at the
  post-duplicate-key-catch path.
- The "forced cp_items address-conflict" test initially passed for the
  wrong reason: `config.address`'s unique index is only ever created by
  `MongoCpProvider.ensureIndexes()`, which the test never triggers (it
  calls `executeCpMutationWithHistory` directly). Fixed by creating both
  that index and `ensureCpHistoryIndexes` explicitly in the test's
  `beforeAll`, matching what a real deployment already has in place before
  any write happens.

Atomicity itself (forced cp_history-insert failure rolls back cp_items;
forced cp_items-write failure creates no history) is proven by two
dedicated tests using MongoDB's own unique-index violations to force a
transaction abort mid-way — not simulated/mocked.

### 8 — Wiring `MongoCpProvider`

`putItem`/`createChild`/`deleteItem` now call
`executeCpMutationWithHistory` instead of raw `updateOne`/`insertOne`/
`deleteOne`. `resolveStaleAddressConflict` (a pre-existing migration-repair
helper, Story 72) also routed through the delete path when the target
document is already migrated, falling back to the old raw delete for
still-unmigrated orphans (so this narrow repair helper doesn't get blocked
by the new migration gate).

### 11 — Retiring `history-worker`

Chose **neuter, don't delete the package** — `index.mjs` is now a
one-screen no-op that logs why it's retired and exits 0 if something still
starts it, rather than either crash-looping or (far worse) silently
writing `cp_history` documents in the OLD schema (no
`mutationId`/`version`/`repoGuid`/hashes) alongside the new transactional
writer, which would have corrupted the single `cp_history` collection with
two incompatible shapes. Its own tests (`worker-process.test.mjs`,
`history-event-mapper.test.mjs`) and helper libs (`lib/`) were deleted —
they tested change-stream/shadow-state mechanics that no longer exist;
`mutate.test.ts` covers the equivalent properties for the new mechanism
without needing a child process or shadow state at all.

### 17–19 — What's NOT done

Everything requiring a QNAP TEST deployment or real user data:

- Not deployed to QNAP TEST. Local `pnpm --filter dashboard build` and
  `npx tsc --noEmit` were run (both clean) but the actual
  `docker-compose.qnap.test.yml`/official deploy script was not invoked in
  this session.
- The Playwright spec (`test/e2e/history-ui.spec.mjs`) was written against
  the real QNAP TEST convention (`test.skip` without
  `E2E_TEST3_PASSWORD`) but has never actually been run — it needs the new
  code deployed first.
- No real `cp_items`/`cp_history` data (test3's, pawel_f's, kamil_s', or
  otherwise) was touched. The "seed from scratch" procedure Input 1
  describes (backup, stop writes, clear history in an agreed scope,
  reseed, integrity-check, resume) was designed for and only exercised
  against disposable local scratch databases
  (`chad_test_story79_*`, all dropped after use) — never against any
  environment with real user data.

### 20 — `requestId`

The mechanism is real and tested (`CpMutationContext.requestId`,
`repo-context.ts`'s `requestId`/`tryGetCurrentRequestId()`), but wiring
every Dashboard API route to generate a request id and pass it into
`runWithRepoContext(...)` was not done — out of scope for the time
available in this session. Every mutation produced by the current, live
API routes will have `requestId: null` in its `cp_history` event until
that follow-up wiring happens.
