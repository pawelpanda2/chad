# cp-postgre

PostgreSQL storage implementation of `cp-core`'s `ContentProviderStorage`.
Folder name is exactly **`postgre`** (not `postgres`).

## Layout

```text
postgre/src/
├── provider/storage.ts      # ContentProviderStorage
├── repositories/            # SQL against cp_items
├── models/row.ts            # PostgreSQL-specific row types
├── client.ts                # Pool / URI
└── index.ts
```

Mongo-specific code stays under `packages/content-provider/mongo/` — not mixed here.

## Env

```bash
CP_POSTGRE_URI=postgres://...   # preferred
# or
POSTGRES_URI=postgres://...     # same as packages/dba
```

## Status

- **Implemented:** `GetItem` (reads Story 80 `cp_items` by `repo_guid` + `address`).
- **Not yet:** `GetByNames`, `GetManyByName`, `FindRecursively`, `Put`, `PostParentItem`.

Selectable from `cp-entry` when `CP_DEFAULT_BACKEND=postgre` or a per-repo override maps to `"postgre"`.
