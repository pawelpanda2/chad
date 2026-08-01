# Story 95 — Plan

## Confirmed facts (from reading actual HEAD code, not the prompt's assumptions)

- `packages/dba/src/data-providers/types.ts` already declares
  `putItemConfig(item: CpItem): Promise<CpItem>` on `CpCompatibleDataProvider`,
  and it is **already implemented** by `PostgresCpProvider`, `MongoCpProvider`,
  and `NetFileCpProvider` — each preserves the existing item's `body`
  untouched and requires the caller-supplied `_id`/`config` to be used as-is
  (no re-allocation). This is exactly the "safe config update primitive" the
  input prompt asks for — it does not need to be invented, only wired up and
  exposed.
- `putItemConfig` is **intentionally not routed through `DbaDataRouter`**
  (confirmed by `mongo-cp-provider.ts`'s doc comment on its own
  `putItemConfig`: "No `DataWriteCommand` exists at this call site (not
  wired through the router)"). `item-ops.ts`'s existing `deleteItemByAddress`
  already establishes the precedent for calling the primary provider
  directly (via `loadDataProvidersConfig().primaryBackend`) for an operation
  that intentionally bypasses router/follower replication — config updates
  will follow the same pattern.
- `packages/dba/src/folders.ts` already has the exact shape to extend:
  `updateFolderTextBodyInternal` / `updateFolderTextBody` /
  `updateFolderTextBodyAllowingSystemFolderWrite`, each going through
  `assertNotSystemFolderWrite` for read-only system-folder protection. A new
  `updateFolderItemConfig*` trio will mirror this exactly.
- `packages/dashboard/app/api/folders/route.ts` already owns `PUT
  /api/folders` for body updates — per `05_endpoint-rules.md` §5
  (never change an existing endpoint's contract when unsure), config gets
  its **own** route file `packages/dashboard/app/api/folders/config/route.ts`
  exporting `PUT`, matching the prompt's own suggested shape
  `PUT /api/folders/config`. `toApiItem`/`statusForFoldersError` need to move
  to a shared, non-route module (`packages/dashboard/lib/folders-api.ts`)
  since Next.js App Router route files may only export the HTTP-verb
  functions (and a few reserved config exports) — extra named exports from
  a `route.ts` are a build error, so the two existing routes cannot just
  import from each other.
- `TextEditorWithToolbar` already supports `showPreview={false}` — but its
  `activeTab` state defaults to `"preview"` and `showSave` is gated on
  `isEditorMode` (`activeTab === "editor"`), so Config must also pass
  `defaultTab="editor"` or the Save button silently never renders.
- `CpItemConfig` in `cp-model.ts` already enforces exactly 4 required keys
  (`id`, `address`, `type`, `name`) with everything else free-form —
  matches the prompt's required-fields list precisely.
- `nav.items`/`replaceCurrentItem` already exist in `folders/page.tsx` for
  "update current item in place, no new history entry" — reused as-is for
  the post-config-save refresh.

## Design decisions

1. **New DBA layer, `item-ops.ts`:** `putItemConfig(item: CpItem):
   Promise<CpItem>` — selects the primary provider (postgres/mongo) exactly
   like `deleteItemByAddress` does, calls its `putItemConfig`.
2. **New business layer, `folders.ts`:** `updateFolderItemConfig(address,
   rawConfig, ops?)` / `...AllowingSystemFolderWrite(address, rawConfig)`.
   - Fetches existing item (404 `ITEM_NOT_FOUND` if missing).
   - Validates `rawConfig` is a plain object (not null/array/primitive),
     with `id`/`type`/`name`/`address` present as non-empty strings — new
     `FoldersOperationError` code `VALIDATION`.
   - Enforces `id`, `address`, `type`, `name` are byte-identical to the
     existing item's config — new code `FORBIDDEN_IDENTITY_CHANGE` (409) if
     any differs. `type`/`name` are blocked outright (no confirmed safe
     rename/retype contract in `dba` yet — noted as a follow-up, not
     implemented this Story per the input prompt's own instruction).
   - System-folder read-only check via the existing
     `assertNotSystemFolderWrite(names, "update-body")` — reused verbatim,
     same protection semantics as body edits, no need for a new action enum
     value.
   - Calls `ops.putItemConfig({ _id: existing._id, config: validatedConfig,
     body: existing.body })` — body is always the existing one, config save
     can never touch it.
3. **New API route**, `packages/dashboard/app/api/folders/config/route.ts`
   (`PUT`, body `{ loca: string, config: object }`) — same auth/repo-
   isolation/admin-unlock shape as the existing `PUT /api/folders`, calling
   `updateFolderItemConfig`/`...AllowingSystemFolderWrite`. Extracted shared
   `toApiItem`/`statusForFoldersError` (+ new 409 case) into
   `packages/dashboard/lib/folders-api.ts`, imported by both route files.
4. **UI**, `folders/page.tsx`:
   - `type EditorMode = "body" | "config"` state, reset to `"body"` on
     `currentItem.Address` change (same effect that already resets
     `editorBody`).
   - New `configText` draft state (JSON.stringify of `currentItem.Config`,
     pretty-printed), independent from `editorBody` — both reset together
     on navigation, never on mode toggle.
   - Config toggle button placed next to Delete (both Text and Folder
     branches).
   - Config mode renders `TextEditorWithToolbar` with
     `showPreview={false} defaultTab="editor"` over `configText`, its own
     save handler hitting the new route, independent `savingConfig`/
     `configSaved`/`configSaveError` state.
   - Folder's children list only renders in Body mode (unchanged from
     today); Config mode replaces it, not derives from it.
   - After a successful config save: `replaceCurrentItem` with the
     returned item (updates `Config`/`Settings`, keeps `Body`), reset
     `configText` to the server's returned config, clear the config dirty
     flag — never touches `editorBody`/body-save state.

## Out of scope (per input prompt's own "Zakazy i granice")

- Delete/Add child behavior unchanged.
- No `type`/`name` rename support — explicitly deferred, recorded as a
  follow-up proposal in `06_others_from_report.md`.
- No PROD deploy; local Docker rebuild + smoke test only.
