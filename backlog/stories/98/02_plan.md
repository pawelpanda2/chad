# Story 98 — Plan

## Confirmed facts (read from actual HEAD, not assumed)

- Story 95 (still uncommitted, in-progress in this same working tree —
  `backlog/stories/95/` — confirmed via `git status`/`git log` before any
  edit) already built the Folders Body/Config toggle and its own
  `05_tasks_and_checklist.md` Task 2 write-up **already documents this
  exact Save regression** as a known caveat: `TextEditorWithToolbar`'s
  `isEditorMode = activeTab === "editor"`, with `activeTab` defaulting to
  `"preview"` regardless of `showPreview`, meant Config's
  `showPreview={false}` panel needed a `defaultTab="editor"` prop to make
  Save appear at all — exactly the caller-side workaround Story 98's input
  says not to rely on.
- Reading `text-editor-with-toolbar.tsx` at HEAD confirmed this precisely:
  `isEditorMode` was `activeTab === "editor"` with no `showPreview`
  involvement, and the content area already renders `BodyTextEditor`
  directly (ignoring `activeTab` entirely) whenever `showPreview` is
  `false` — i.e. Editor is already the only reachable view in that mode,
  the toolbar's gating logic just didn't know it.
- `grep` of every `TextEditorWithToolbar` caller (`msg-workout`, `forms`,
  `todo-msg/edit`, `msg-planner`, `views`, `folders`) showed only
  `folders/page.tsx`'s Config block passes `showPreview={false}` — so
  fixing `isEditorMode` to `!showPreview || activeTab === "editor"` cannot
  regress any other caller (all of them either omit `showPreview` — default
  `true` — or don't touch it).
- `packages/dba/src/folders.ts` (also mid-flight from Story 95) already has
  `updateFolderItemConfig`, `FoldersOperationError`, the `FolderChildOps`
  injectable-ops seam, and `folders.test.ts`'s `fakeOps` fixture — the
  export feature reuses `getItemByAddress`/`getChildrenOf` from that same
  seam rather than inventing a new ops shape.
- `cp-model.ts` already has `parseChildIndex` for numeric CP-index
  ordering — reused directly instead of re-deriving it.
- No existing precedent in this repo for unit-testing a Next.js
  `route.ts` handler in isolation (checked: no `*.test.ts` under
  `packages/dashboard/app/api/**`, no `vi.mock('dba')` anywhere). Story
  95's own equivalent route (`/api/folders/config`) was verified instead
  via real curl smoke tests against the running local Docker stack,
  documented directly in its checklist — `/api/folders/export`'s
  401/403/400/404/limit checks follow that same established convention
  here rather than introducing a new synthetic-route-test pattern.
- No `@testing-library/react`/`jsdom` anywhere in the repo before this
  Story — the existing component-adjacent tests
  (`beeper-conversations-logic.test.ts`, `ai-prompt-kind.test.ts`) all test
  extracted *pure logic*, never a rendered component. The input prompt
  explicitly requires a real "Save button is visible and fires onSave"
  regression test, which a pure-logic test can't actually prove (it can
  only prove the boolean feeding the gate is right, not that the JSX
  behaves) — so this Story adds `jsdom` + `@testing-library/react` +
  `@testing-library/user-event` as root devDependencies (Vitest's own
  `resolve.alias`/`oxc.jsx` needed config additions too — Next's
  `tsconfig.json` sets `"jsx": "preserve"`, which Vitest's oxc transform
  otherwise inherits and then refuses to parse).

## Design decisions

1. **Shared-editor fix**: `isEditorMode = !showPreview || activeTab ===
   "editor"` in `text-editor-with-toolbar.tsx` — one line, plus an updated
   doc comment. `folders/page.tsx`'s now-redundant `defaultTab="editor"` on
   the Config block removed (dead now that `showPreview={false}` alone is
   sufficient).
2. **Export contract** lives in `dba`'s `folders.ts`, next to the other
   Folder business operations:
   - `FolderExportMode` (`"body-l1" | "body-l2" | "all-l1"`, transport
     form) + `parseFolderExportMode` (validates a raw query string).
   - `buildFolderExport({ root, mode, getChildren, maxItems?,
     maxBodyChars? })` — pure given its `getChildren` callback (same
     injectable-seam convention as `FolderChildOps`), returns the exact DTO
     shape the input prompt specifies (`source`/`mode`/`maxDepth`/`items`,
     `children` only on `body-l2`'s child-Folder items, `config` only on
     `all-l1`). Throws `EXPORT_LIMIT_EXCEEDED` (never truncates silently)
     once either a total item-count or total body-character budget is
     exceeded — checked incrementally as each level is fetched, so an
     oversized `body-l2` root is caught before pulling in outright
     depth-3 data (not applicable) or endless grandchildren fetches.
   - `exportFolderTree(address, mode, ops?, limits?)` — resolves the root
     via `getItemByAddress` (404 `ITEM_NOT_FOUND`), then calls
     `buildFolderExport`; returns `{ result, itemCount }`.
   - `countFolderExportItems` — total node count including nested
     `children`, used both by `exportFolderTree`'s return value and
     directly asserted in tests.
3. **New thin route**: `GET /api/folders/export?loca=&mode=&repoGuid=`
   (`packages/dashboard/app/api/folders/export/route.ts`) — same
   session/`resolveFoldersRepoAccess` shape as the sibling `/api/folders`
   and `/api/folders/config` routes; maps `FoldersOperationError` through
   the shared `statusForFoldersError` (extended with `ROOT_NOT_FOLDER` →
   409, `EXPORT_LIMIT_EXCEEDED` → 413). Returns `{ export, itemCount }`;
   the client does the one `JSON.stringify(data.export, null, 2)` itself,
   per the input prompt's explicit instruction not to double-encode.
4. **UI**, `folders/page.tsx`: new `exportMode`/`copying`/`copyError`
   state, `handleCopyExport()` (GET → clipboard, never touches
   `editorBody`/`configText`, never requires an unlock). Combobox + Copy
   button added to the Folder branch's existing Delete/Config button row
   (same row per the input prompt's own layout spec), gated to
   `currentItem.Config.type === "Folder"` only — the Text branch gets
   neither control (hidden, not disabled-with-tooltip; simpler and the
   input prompt allows either).
5. **Test-infra addition**: `vitest.config.mjs` gets a `resolve.alias`
   (`"@"` → `packages/dashboard`) and `oxc.jsx: "automatic"` — both scoped
   additions, neither changes existing tests' behavior (they only matter
   to a test file that imports a dashboard component/its own `@/...`
   aliases, which no prior test file did).

## Out of scope (per input prompt's own "Zakazy i granice")

- No synthetic Next.js route-handler unit test for
  `/api/folders/export` — verified via real local-stack smoke test
  instead, matching Story 95's own precedent for its sibling config route.
- No `all-l2`, no unbounded depth, no PROD deploy, no Folders refactor
  beyond the two requested changes.
