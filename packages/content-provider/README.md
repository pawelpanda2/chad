# packages/content-provider — TypeScript/Node Content Provider

Group of separate pnpm packages (`pnpm-workspace.yaml`: `packages/content-provider/*`). Gradual replacement for [`packages/net-content-provider`](../net-content-provider).

## Layout (backends separated)

```text
packages/content-provider/
├── common/          # cp-core — shared interfaces, contracts, types (DB-independent)
├── entry/           # cp-entry — router/factory; only package callers should import
├── mongo/           # cp-mongo — Mongo-specific provider / repositories / models
├── postgre/         # cp-postgre — PostgreSQL-specific (folder name exactly "postgre")
├── files/           # cp-files — filesystem/Dropbox
├── net-adapter/     # cp-net-adapter — live .NET /invoke
└── api/             # HTTP façade over cp-entry
```

Mongo is **not** removed — it remains an optional backend. PostgreSQL is selected via config only; business code always talks to `cp-entry`.

| Package | Folder | Role |
|---|---|---|
| `cp-core` | `common/` | Models + `ContentProviderStorage` contract. Never selects a backend. |
| `cp-entry` | `entry/` | Router/factory: `CP_DEFAULT_BACKEND` / per-repo overrides → storage. |
| `cp-mongo` | `mongo/` | MongoDB backend (optional, kept for the future). |
| `cp-postgre` | `postgre/` | PostgreSQL backend (`cp_items`). |
| `cp-files` | `files/` | Filesystem storage. |
| `cp-net-adapter` | `net-adapter/` | .NET HTTP adapter (default Stage 1). |

## Backend selection (config only)

```bash
CP_DEFAULT_BACKEND=postgre          # or mongo | files | net-adapter
CP_REPO_BACKEND_OVERRIDES=guid:mongo,other:postgre
# or JSON: CP_REPO_BACKEND_OVERRIDES={"guid":"mongo"}
```

Callers use `entry` from `cp-entry` — switching backend does not change business code.
