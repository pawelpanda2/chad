# packages/content-provider — new TypeScript/Node Content Provider (Stage 1)

Not one package — a group of separate pnpm packages (see `pnpm-workspace.yaml`: `packages/content-provider/*`). Gradual, staged replacement for [`packages/legacy-content-provider`](../legacy-content-provider) (currently running .NET/Blazor implementation, stays authoritative until fully replaced).

| Package | Role | Stage |
|---|---|---|
| `cp-core` | Models, interfaces, compatible method names (`GetItem`, `GetByNames`, `GetManyByName`, `FindRecursively`, `Put`, `PostParentItem`). Never selects a storage implementation. | 1 |
| `cp-entry` | **The only package dashboard/cp-gui/API should ever import.** Routes repo GUID → storage backend → unified `CpItem`. | 1 |
| `cp-net-adapter` | Implements `cp-core`'s contract by calling the real, running .NET Content Provider over HTTP `/invoke`. Read-only in Stage 1. | 1 |
| `cp-files` | Filesystem/Dropbox storage implementation. | 2 |
| `cp-mongo` | MongoDB storage implementation. | 2 |

```txt
cp-entry
   │
   ├─► cp-net-adapter  (Stage 1, only one that exists)
   ├─► cp-files         (Stage 2)
   └─► cp-mongo          (Stage 2)
```

Write operations (`Put`, `PostParentItem`) are Stage 3 — implemented in `cp-net-adapter` already (the `/invoke` shape is simple and already documented) but not exercised or relied on until then.

Compatibility requirement: for the same item, `cp-net-adapter` and (later) `cp-files` must return identical `Body`/`Config`/`Address`/legacy-`Settings`/`id`/`name`/`type`/`created` — an adapter isn't considered compatible until that's verified.
