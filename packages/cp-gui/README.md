# cp-gui

Content Provider GUI. **Stage 1 scope only: structure + the three integration contracts (`BackendAdapter`, `PluginAdapter`, `RepoAdapter`). No components implemented yet.**

## What this is (dual-purpose, one implementation)

1. A standalone browsing/editing app — the eventual replacement for `packages/net-content-provider/front_blazor`.
2. A component library reused inside `packages/dashboard`'s Folders page.

Not two separate frontends — one implementation consumed both ways.

## Where the design comes from

Modeled on a direct reading of Blazor's `FolderView.razor` / `TextView.razor` (in `packages/net-content-provider/front_blazor`), which inject three collaborators into each item view:

| Blazor collaborator | cp-gui contract | Role |
|---|---|---|
| `BackendAdapter` | [`BackendAdapter`](src/adapters/backend-adapter.ts) | The only way cp-gui reaches Content Provider data. Same method names as `cp-core`'s `ContentProviderStorage` (`getItem`, `getByNames`, `getManyByName`, `findRecursively`, plus Stage-3 `put`/`postParentItem`) — but over HTTP, since cp-gui runs in the browser and cannot import `cp-entry`'s Node code directly: `cp-gui --(HTTP)--> server layer --(import)--> cp-entry --> backend`. |
| `PluginAdapter` | [`PluginAdapter`](src/adapters/plugin-adapter.ts) | Talks to the locally-installed `cp-plugin` desktop helper for the Folder/Config/Terminal toolbar buttons. Optional by design — `isAvailable()` lets cp-gui disable/hide those buttons instead of blocking browsing or editing when `cp-plugin` isn't running. |
| repo picker (NavMenu combobox) | [`RepoAdapter`](src/adapters/repo-adapter.ts) | Deliberately minimal in Stage 1 — just `listRepos()`. |

## Stage 1 contents

```txt
src/
├── index.ts                      # re-exports the three contracts
└── adapters/
    ├── backend-adapter.ts         # BackendAdapter + createHttpBackendAdapter (throws — not implemented)
    ├── plugin-adapter.ts          # PluginAdapter + createHttpPluginAdapter (throws — not implemented)
    └── repo-adapter.ts            # RepoAdapter, RepoInfo
```

`createHttpBackendAdapter` / `createHttpPluginAdapter` intentionally throw `"not implemented yet"` — Stage 1 is the contract shape, not a working HTTP client.

## Not in Stage 1

- No React components (no FolderView/TextView/nav/breadcrumb equivalents).
- No real `createHttpBackendAdapter` / `createHttpPluginAdapter` implementation.
- No decision yet on Vite+React standalone vs. sharing components directly with the Next.js dashboard (open question, doesn't block Stage 1 — the contracts are framework-agnostic).
- No resolution on whether a Blazor-style "Add via `Ref`" selector belongs in the real `cp-gui` — `content-provider.md`/`frequent-bugs.md` forbid it, `CONTENT_PROVIDER_GUIDE.md` implements it. Do not copy either behavior without resolving this first.

## Depends on

`cp-core` (workspace package) for `CpItem`/`CpItemType` types only — no storage logic.
