# cp-mongo

MongoDB storage implementation of `cp-core`'s `ContentProviderStorage`. **Stage 2 skeleton only** — a thought-through document model (`document.ts`) and a connection helper (`client.ts`), plus one real, working operation (`GetItem`) to prove the model is actually queryable. Everything else throws `ContentProviderError`. **Not wired into `cp-entry`'s routing yet.**

## Document model

One MongoDB document = one logical Content Provider item (`CpMongoDocument` in `document.ts`): `repoId`, `itemId`, `parentId`, `loca` (slash-joined, same convention as `cp-files`/`cp-net-adapter`), `name`, `type`, `body`, `bodyFormat`, `metadata`, `createdAt`, `updatedAt`.

Deliberately **not** a 1:1 copy of the filesystem's `repoGuid/numeric/numeric/.../config.yaml`+`body.txt` shape — that structure exists to satisfy a filesystem, and copying it blindly into Mongo (e.g. one collection per nesting level, or numeric-folder-shaped `_id`s) would only make it harder to query. What's preserved is the ability to resolve any document back to the same `repoId` + `loca` addressing `cp-files` and `cp-net-adapter` already use — that's what lets `cp-entry` route between backends transparently and is the actual requirement, not physical-shape parity.

## Shared instance, not a dedicated database

Points at the **same shared MongoDB instance** planned for `contacts`/Beeper/dashboard (see `documentation/dashboard/common/features/shared-qnap-services.md` — one `chad-mongodb` container, no dedicated per-consumer instance). This does **not** mean one shared collection — `getCollectionName()` defaults to `content_provider_items`, kept separate from whatever `contacts`/Beeper eventually use.

## Config

```env
CP_MONGO_URI=mongodb://change_me:change_me@localhost:27017
CP_MONGO_DB_NAME=chad
CP_MONGO_COLLECTION_NAME=content_provider_items
```

Local dev default matches `docker-compose.local.yml`'s `mongodb` service (`chad-mongodb-local-mac-docker`). On QNAP, the shared `chad-mongodb` container has **no published host port** (internal-only on the `chad-shared` network) — `CP_MONGO_URI` must be set explicitly there, never assumed.

## What's real vs. skeleton

- **Real**: `GetItem(repoGuid, loca)` — a plain `findOne({ repoId, loca })`. Connection is lazy (`client.ts`'s `getDb()` connects on first use, reused after).
- **Skeleton (throws `ContentProviderError`)**: `GetByNames`, `GetManyByName`, `FindRecursively`, `Put`, `PostParentItem`. Each needs a real design decision not yet made — e.g. does `GetByNames`' name-based descent need a `{repoId, parentId, name}` index? Does `FindRecursively` need a MongoDB text index on `body`, or should it defer to the filesystem/net-adapter backend for search? Guessing these now, before any real document exists in the collection, would be designing against nothing.

## Does NOT do

- No writes (`Put`/`PostParentItem` throw).
- Not wired into `packages/content-provider/entry`'s backend-routing switch — `cp-entry`'s `"mongo"` case still throws its own inline "not implemented" error, unchanged by this package's existence.
- No migration/import tooling from `cp-files` — populating real documents here is future work, not part of this skeleton.
