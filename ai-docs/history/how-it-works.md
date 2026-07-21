# History (Change Streams) — how it works

Status: written 2026-07-21, Story 74 (continuation session — Claude Code,
after earlier Claude Code / Copilot / Cline sessions on the same Story).
Read `backlog/stories/74/` for the full task history, root-cause
investigation, and what was fixed in this session specifically.

## Pipeline

```
Dashboard UI/API
  -> dba (packages/dba/src/leads.ts, repo-context.ts, data-commands.ts,
          data-router.ts, data-providers/mongo-cp-provider.ts)
  -> chad.cp_items (MongoDB, replica set rs0)
  -> MongoDB Change Stream
  -> packages/history-worker (independent process)
  -> chad.cp_history / chad.cp_history_state
  -> packages/dba/src/cp-history.ts
  -> packages/dashboard/app/api/content-provider/{history,daily-history}
  -> packages/dashboard/app/(dashboard)/dashboard/history/page.tsx
```

The worker is a separate process from the Dashboard on purpose: a
Dashboard restart/crash never stops history tracking, and a bug in the
worker never takes the Dashboard down.

## `rs0` — why and how

MongoDB Change Streams require a replica set (even a single-node one).
`rs0` is a one-member set (`chad-mongodb:27017` on QNAP,
`chad-mongodb-local-mac-docker:27017` locally). Initialization is
idempotent (`bash-scripts/mongo/rs-init.js` — safe to run on every
restart: does nothing if `rs0` is already configured).

Verify:

```bash
docker exec <mongo-container> mongosh --quiet --eval "
  printjson({ok: rs.status().ok, setName: db.hello().setName, primary: db.hello().isWritablePrimary})
"
```

Expect `{ok: 1, setName: "rs0", primary: true}`. This survives a normal
`docker compose down`/`up` cycle (no `-v`) because the replica set
configuration lives in the `local` database on the same persistent data
volume as everything else.

**Local Mac Docker specifically runs without Mongo auth** (`mongod
--replSet rs0 --oplogSize 1024`, no `--auth`, no root user) — this is a
local-only simplification that predates this Story's continuation session;
QNAP keeps its own separate compose file and keyfile-based auth
unaffected by it.

## Oplog

Shared across every database on the same `mongod` (including
`beeper_<repoGuid>` per-user databases) — sized at 1024MB by
`--oplogSize 1024`. A resume token that falls outside the current oplog
window can no longer be resumed from; see "Resume token" below for how
the worker handles that.

## History worker (`packages/history-worker`)

Plain Node.js (`index.mjs`, ESM, no build step — deployed via `pnpm
deploy --prod` in its Dockerfile, not `tsc`). Watches `cp_items` via
`itemsCol.watch([], { fullDocument: "updateLookup" })` and writes one
`cp_history` document per change event.

**No pre-images.** MongoDB 4.4 (the QNAP target version) has no
`fullDocumentBeforeChange`/pre-image support (6.0+ only), and a delete
event's change-stream document never carries `fullDocument` at all,
regardless of Mongo version. The worker keeps its own in-memory
`lastKnownState` cache (`Map<sourceId, {config, body, actor}>`),
populated *progressively* from events it has actually observed since its
own last start — never bootstrapped from a full collection scan at
startup (that would make catch-up-after-downtime diffs subtly wrong, by
diffing against state from before the worker ever ran). The first event
seen for any given item after a (re)start has no known "before" and is
recorded honestly as `beforeUnknown: true` — never fabricated.

**Actor attribution.** Writes flow `_lastActor` onto the `cp_items`
document itself (`repo-context.ts`'s `tryGetCurrentActor()` →
`data-commands.ts` → `MongoCpProvider.putItem`/`createChild`). The worker
reads `change.fullDocument._lastActor` for insert/update/replace. **A
delete event has no `fullDocument`**, so `MongoCpProvider.deleteItem()`
never gets a chance to record an actor for that specific operation either
way — the worker instead falls back to the actor it cached from that
item's own last insert/update (`cached?.actor`), which is the only actor
information a delete event can possibly carry under this architecture.

**Idempotency.** Each `cp_history` document's `_id` is the change event's
own resume-token data string — unique and stable per event. A retried
insert of the same event hits Mongo's unique-`_id` constraint
(`error.code === 11000`), caught and logged as "duplicate event, skipping"
rather than needing a separate dedup check.

## Resume token (`chad.cp_history_state`)

Singleton document, `_id: "cp_history_worker"`:

```js
{
  resumeToken: <opaque>,
  status: "running" | "error" | "stopped",
  startedAt, lastHeartbeatAt, lastEventAt,
  lastError, historyGapAt,
}
```

On start, the worker calls `itemsCol.watch([], { resumeAfter:
existingState.resumeToken })` if a token is persisted, else starts fresh
from "now". If the persisted token has fallen outside the oplog window,
`watch()` throws a resume-token-lost error — the worker logs a clear
warning, starts fresh from "now" (never fabricates the missing history),
and records `historyGapAt`.

**Restarting the worker never loses events that happened while it was
down**, as long as the gap is within the oplog window — verified in Story
74 by stopping the container, making a real change, restarting it, and
confirming the missed event was captured with no duplicate. **Restarting
the *container* with a newly built image requires `docker compose up -d
<service>`, not `docker stop`/`docker start`** — the latter reuses the
existing container's already-baked-in image layer and will silently keep
running old code.

## Daily Tracker mapping

Not a hardcoded address. `resolveDailyTrackerAddressPrefix(repoGuid)`
(`packages/dba/src/cp-history.ts`) calls the same `getByNames({repoGuid,
names: ["views", "daily"]})` lookup the real save/read path already uses
(`saveDailyEntry`/`getAllDailyEntries` in `leads.ts`), and filters
`cp_history` by that resolved address as a prefix. If the repo has no
Daily Tracker folder yet, this returns `null` and
`listDailyTrackerHistory` returns an empty result — not an error.

## Repo isolation

`listCpHistory`/`getCpHistoryEntry` filter by a regex anchored on the
caller's own `repoGuid` (`^${repoGuid}(/|$)`), sourced only from the
session/repo-context — never trusted from request query/body. Covered by
`packages/dba/src/cp-history.test.ts`, including a regression test for the
specific failure mode of a bare string-prefix match leaking across repos
whose GUIDs happen to share a prefix.

## Adding a new History view type (beyond Daily Tracker)

`History`'s menu (`packages/dashboard/app/(dashboard)/dashboard/history/page.tsx`)
is a `viewParam` switch, not hardcoded to Daily Tracker alone — adding
Reports/Statuses/Leads/etc. means:

1. A `resolveXAddressPrefix(repoGuid)` in `cp-history.ts`, following the
   same "reuse the real save/read path's own folder lookup" pattern as
   `resolveDailyTrackerAddressPrefix` — never guess or hardcode an
   address.
2. A `listXHistory` wrapper around `listCpHistory` (or reuse
   `content-provider/history?addressPrefix=...` directly from the
   Dashboard if a dedicated convenience endpoint isn't needed).
3. A new entry in `HistoryMenuPage`'s button list and the `HistoryView`
   union type, following the existing `daily-tracker` case.

## How to test locally

```bash
# DBA-layer tests (repo isolation, addressPrefix, pagination, Daily
# Tracker resolution) — real local Mongo, dedicated scratch database:
cd packages/dba
MONGODB_URI="mongodb://localhost:27017/chad_test_story74?directConnection=true" \
  npx tsc && node dist/cp-history.test.js
```

`directConnection=true` is required when connecting from the **host**
(outside Docker) — `rs0`'s configured member hostname
(`chad-mongodb-local-mac-docker`) only resolves inside the Docker network,
and a replica-set-aware driver would otherwise try (and fail) to reach
that hostname during topology discovery. Not needed from inside another
container on the same Docker network (e.g. the Dashboard or
history-worker containers themselves use the Compose service name
`mongodb`, which resolves fine there).

End-to-end (worker + Change Streams): make a real change through the
Dashboard UI, then check `chad.cp_history`/`chad.cp_history_state`
directly and confirm it via the `History` UI itself.

## Rollback

Disabling history entirely: stop the `history-worker` container/service
(`docker compose stop history-worker` or remove it from
`docker-compose.*.yml`) — this does not affect `cp_items` writes at all
(the worker is a pure read-side consumer of the change stream, never in
the write path). `chad.cp_history`/`cp_history_state` can be dropped
independently of `cp_items` with zero effect on the rest of the
application. Disabling the replica set itself (only relevant if `rs0`
somehow needs to be reverted) means restarting `mongod` without
`--replSet` — same data directory, same volume, no data loss — see
`backlog/stories/74/01_input.md` §9 for the original rollback procedure
(this Story's continuation session never needed to invoke it; `rs0` stayed
stable throughout).
