# Data providers: Mongo/Content-Provider primary+follower layer

Status: added in Story 72 (2026-07-18) — the first working version of the
configurable-primary/follower data layer described in that Story's
`backlog/stories/72/`. Infrastructure only: no existing `dba` business
function has been rewired onto it yet (see that Story's
`06_others_from_report.md`).

## What this is

A common layer in `packages/dba` so that reading/writing a Content
Provider Item can be backed by **MongoDB**, the **legacy Content Provider**,
or both at once (one primary, one asynchronous follower), controlled by
config — without any `dba` business function hand-rolling
`if (mongoEnabled) ... if (contentProviderEnabled) ...` itself.

```
business function
  -> builds one DataWriteCommand (data-commands.ts)
  -> DbaDataRouter.executeWrite(command)   (data-router.ts)
       -> primary.executeWrite(command)     — synchronous, must succeed
       -> enqueueFollowerOperation(...)      — durable, async (data-outbox.ts)
                -> outbox worker (data-outbox-worker.ts) replays it later
```

## Configuration

Env vars (all optional, defaults shown), read by
`packages/dba/src/data-providers/config.ts`'s `loadDataProvidersConfig()`:

| Env var | Default | Meaning |
|---|---|---|
| `DBA_MONGO_ENABLED` | `true` | Is the Mongo provider available at all |
| `DBA_CONTENT_PROVIDER_ENABLED` | `true` | Is the legacy CP provider available at all |
| `DBA_PRIMARY_BACKEND` | `mongo` | `"mongo"` or `"content-provider"` — which one is synchronous/authoritative |
| `DBA_FOLLOWER_WRITES_ENABLED` | `true` | Whether writes get mirrored to the other (enabled) backend at all |
| `DBA_SHADOW_READS_ENABLED` | `true` | Whether reads also fire an async comparison against the follower |

`loadDataProvidersConfig()` calls `validateDataProvidersConfig()`, which
**throws (fails startup)** if the configured `primaryBackend`'s own
`*Enabled` flag is off, or if both backends are disabled. There is no
fallback primary — a misconfigured primary is a startup error, not a
silent degradation.

### Reversing primary/follower later

Flipping from "Mongo primary, CP follower" to "CP primary, Mongo follower"
is exactly:

```
DBA_PRIMARY_BACKEND=content-provider
```

No code change, no business-function change — `DbaDataRouter` re-resolves
primary/follower from config on every call.

## The canonical Item model (`cp-model.ts`)

One Mongo document == one CP Item (`_id == config.id`, `config.address`
unique). `config` is a free-form object beyond 4 CP-required keys
(`id`/`type`/`name`/`address`) — arbitrary custom fields, plus this Story's
own `created`/`modified` convention fields, round-trip untouched. See
`cp-model.ts`'s doc comments and Story 72's `03_knowledge.md` for the full
audit trail of exactly how this maps onto the real Content Provider's
`ItemModel`/`config.yaml`/`body.txt` contract.

## Known limitation: same-GUID parity isn't possible with CP as a target today

When Content Provider is the **follower**, this layer guarantees the same
**address** as the primary decided, but **not** the same `id`/GUID — the
real CP's only wire-callable write methods (`Put`, `PostParentItem`)
always mint a fresh GUID and drop custom config fields on every write; the
one method that would preserve them (`PutConfig`) isn't callable over the
reflection-based `/invoke` protocol at all. Full detail:
`packages/dba/src/data-providers/legacy-cp-provider.ts`'s class doc
comment and Story 72 `02_plan.md`'s "Correction" section. Closing this
would require a new CP-side write method — out of this Story's scope.

## Collections (MongoDB)

- `items` — one CP Item per document (`MongoCpProvider`). Unique index on
  `config.address`.
- `folder_child_counters` — internal, one doc per parent address, used
  only to atomically allocate the next numeric child index (standalone
  Mongo has no multi-document transactions — see `mongo-cp-provider.ts`).
- `data_sync_outbox` — durable follower-write queue (`data-outbox.ts`).
  `_id` is `${operationId}:${followerBackend}`. Statuses: `pending`,
  `processing`, `retry`, `synced`, `failed`, `conflict`.
- `data_sync_diagnostics` — shadow-read mismatch records
  (`data-sync-diagnostics.ts`) — never the full item body, only a short
  truncated preview.

## Outbox worker

`data-outbox-worker.ts` exports `processOutboxJobsOnce`/`drainOutboxOnce`/
`runOutboxWorker`. **Not wired into any running process in this Story** —
see `06_others_from_report.md` for why and what's needed to do so.

## Migrator

`packages/console/src/migrateCpToMongo.ts` — `tsx src/migrateCpToMongo.ts
--repo=<repoGuid> [--dry-run|--validate-only|--apply]`. Walks a repo's
whole item tree via the legacy adapter, reports counts (scanned/valid/
imported/unchanged/conflicting/failed/duplicates/missing), never deletes
anything, and is naturally idempotent (a re-run of an unchanged tree
reports everything as `unchanged`, not re-imported).
