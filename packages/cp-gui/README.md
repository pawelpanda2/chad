# cp-gui

Content Provider GUI. **Stage 1: structure + the three integration contracts (`BackendAdapter`, `PluginAdapter`, `RepoAdapter`) — done. `createHttpBackendAdapter`/`createHttpPluginAdapter` now have real implementations (2026-07-12), verified live against `cp-api`/`cp-plugin`. First-pass React components (2026-07-12) also added — `TextView`, `FolderView`, `ContentProviderBrowser` — see "Components" and "Verification status" below before trusting them further.**

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

## Components (2026-07-12, first pass)

Ported from a direct reading of the real Blazor `.razor` source (not the earlier summary-only pass):
`packages/net-content-provider/front_blazor/BlazorApp/Pages/Repos.razor` (nav) and
`.../Components/ItemModels/{TextView,FolderView}.razor` (item views).

| Component | File | Ports |
|---|---|---|
| `ContentProviderBrowser` | `src/components/ContentProviderBrowser.tsx` | `Repos.razor`: repo picker, loca input, back/GO toolbar, address/type/name display, hosts both item views (both always mounted, each self-checks `item.Config.type` — same pattern as Blazor) |
| `TextView` | `src/components/TextView.tsx` | `TextView.razor`: Folder/Content/Config/Terminal buttons (via `PluginAdapter`), body content (read-only) |
| `FolderView` | `src/components/FolderView.tsx` | `FolderView.razor`: Folder/Config/Terminal buttons, one button per child (parsed from the `{childIndex: childName}` Body map), click navigates |

**One deliberate improvement over the Blazor original, not a faithful port**: Blazor's toolbar wires THREE buttons (←, ↶, →) to the exact same `OnBackArrowBtnClicked` handler — dead/duplicate code in the real source, not a feature. `ContentProviderBrowser` implements one real, working back-history stack instead.

**Not ported** (Stage 2 is read-only; none of these have a `ContentProviderStorage`-contract method to call anyway):
- GoogleDoc/Tts buttons (`TextView.razor` Row 2) — Blazor's own "Open" branch was already fully commented out; the rest call raw, uncontracted operations.
- "Add" child-creation forms (both views) and editable body content — all writes; `Put`/`PostParentItem` still throw in `cp-files`/`cp-mongo` (Stage 3).
- Logout — no auth system exists yet in this stack (`[Authorize]` was already removed from the Blazor source itself for local dev).

**Still open**: whether a Blazor-style "Add via `Ref`" type option belongs in the real write-capable `FolderView` — `content-provider.md`/`frequent-bugs.md` forbid it, `CONTENT_PROVIDER_GUIDE.md` implements it. Not resolved, not copied either way (moot until Stage 3 adds real writes).

No decision yet on Vite+React standalone vs. sharing these components directly with the Next.js dashboard — components are written framework-agnostic (plain React, no Next.js APIs) specifically so that decision doesn't block writing them.

## Verification status (be aware before trusting this further)

- `createHttpBackendAdapter`/`createHttpPluginAdapter`: verified with real Node script calls against a live `cp-api` + live `cp-plugin` (see their source comments for exact results).
- `TypeScript`: `pnpm --filter cp-gui build` passes clean (real type-checking of props/imports/JSX).
- **Components were NOT verified rendering in an actual browser.** This session's environment has no headless-browser/screenshot tool available. A Node-based `react-dom/server` render check was attempted but hit a dual-React-instance issue from an ad-hoc test harness (not a bug in the components) and was abandoned rather than risk further `pnpm add`/`remove` churn on `pnpm-lock.yaml` while another concurrent session was actively committing unrelated work to this same repo. **Before trusting these components, actually run them in a browser** (e.g. via a Vite dev server importing `cp-gui`'s built `dist/`, pointed at a real running `cp-api`+`cp-plugin`) and click through a real repo.

## Depends on

`cp-core` (workspace package) for `CpItem`/`CpItemType` types only — no storage logic.
