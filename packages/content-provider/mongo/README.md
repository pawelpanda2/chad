# cp-mongo

MongoDB storage implementation of `cp-core`'s `ContentProviderStorage`.
**Kept as an optional backend** — not removed when CHAD uses PostgreSQL.

## Layout

```text
mongo/src/
├── provider/storage.ts
├── repositories/items-repository.ts
├── models/document.ts
├── client.ts
└── index.ts
```

PostgreSQL code lives under `packages/content-provider/postgre/` only — not mixed here.

## Status

- **Implemented:** `GetItem`
- **Skeleton (throws):** `GetByNames`, `GetManyByName`, `FindRecursively`, `Put`, `PostParentItem`

Selectable via `CP_DEFAULT_BACKEND=mongo` or per-repo override in `cp-entry`.
