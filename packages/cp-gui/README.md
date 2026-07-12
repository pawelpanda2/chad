# cp-gui

Content Provider GUI. **Stage 1: structure + the three integration contracts (`BackendAdapter`, `PluginAdapter`, `RepoAdapter`) — done. `createHttpBackendAdapter`/`createHttpPluginAdapter` now have real implementations (2026-07-12), verified live against `cp-api`/`cp-plugin`. No React components yet — that's next.**

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

## Contents

```txt
src/
├── index.ts                      # re-exports the three contracts
└── adapters/
    ├── backend-adapter.ts         # BackendAdapter + createHttpBackendAdapter (real, calls cp-api)
    ├── plugin-adapter.ts          # PluginAdapter + createHttpPluginAdapter (real, calls cp-plugin)
    └── repo-adapter.ts            # RepoAdapter, RepoInfo
```

`createHttpBackendAdapter(baseUrl)` calls `cp-api`'s endpoints (see `packages/content-provider/api/README.md`) — `getItem("")` uses `/root`, everything else maps 1:1 to a `cp-api` route. `put`/`postParentItem` still throw — `cp-api` has no write endpoints yet (Stage 3). Verified live (2026-07-12): `getItem` and `getManyByName` (64 real matches) both round-tripped correctly through a real running `cp-api` + the real .NET backend.

`createHttpPluginAdapter(baseUrl)` calls `cp-plugin`'s endpoints directly. **Important:** its `address` parameter is `cp-plugin`'s OWN dash-joined format (`{repoGuid}-{physical-loca-with-dashes}`, see `packages/cp-plugin/ADDRESS_FORMATS.md`) — a different convention from the slash-joined `loca` used everywhere else in Content Provider (`cp-core`/`cp-files`/`cp-api`). Callers of this adapter (eventually, the real components) are responsible for converting. `isAvailable()` never throws — a network failure just means "not available," matching cp-plugin's optional-by-design contract. Verified live against a real running `cp-plugin` instance.

## Not yet done

- No React components (no FolderView/TextView/nav/breadcrumb equivalents) — this is the actual next step.
- No decision yet on Vite+React standalone vs. sharing components directly with the Next.js dashboard (open question, doesn't block adapter work — the contracts are framework-agnostic).
- No resolution on whether a Blazor-style "Add via `Ref`" selector belongs in the real `cp-gui` — `content-provider.md`/`frequent-bugs.md` forbid it, `CONTENT_PROVIDER_GUIDE.md` implements it. Do not copy either behavior without resolving this first.

## Depends on

`cp-core` (workspace package) for `CpItem`/`CpItemType` types only — no storage logic.
