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

## Layering (Story 109)

`packages/content-provider` sits **under** `packages/dba`, not beside it —
`Dashboard/API/Console → packages/dba → packages/content-provider (cp-entry → provider)`.
`packages/dba` owns session/repo context, permissions, and CHAD-specific
orchestration; it calls into `cp-entry` for CP domain operations rather
than picking a backend package itself. See
[`ai-docs/content-provider/ai-start.md`](../../ai-docs/content-provider/ai-start.md)
for the full rule, the current migration state (most existing `dba` code
still calls a provider directly — accepted transitional debt, not a
pattern for new code), and the runtime wiring this depends on
(`CP_DEFAULT_BACKEND`, Docker build order).

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
