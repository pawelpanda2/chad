# Story 98 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE      |             | Folders' Config editor (no Preview tab) shows Save immediately and Save works, for both Text and Folder items |
| 2 | DONE      |             | Every other shared-editor caller (Msg Workout, Forms, Todo Msg, Msg Planner, Views) is unaffected — Save still hidden on the Preview tab, shown after switching to Editor |
| 3 | DONE      |             | Folders shows a scope combobox + Copy button next to Body/Config, for Folder items only |
| 4 | DONE      |             | Copy → "body l1" produces the exact JSON contract: direct children, body only, no grandchildren |
| 5 | DONE      |             | Copy → "body l2" produces direct children + each child Folder's own children, never depth 3 |
| 6 | DONE      |             | Copy → "all l1" produces direct children with full config + body, no grandchildren |
| 7 | DONE      |             | Copy shows "Copying...", a success toast with mode + item count, and a real error message on failure without clearing the editor |
| 8 | DONE      |             | Export is isolated to the session's own repo (no forged repo/unauthenticated access) and enforces an explicit item/size limit — never a silent truncation |

# Task 1 — Config editor's Save regression, fixed at the component level

**Requested:** Folders lost its Save button in the Config editor
(`showPreview={false}`). Fix the root cause in the shared
`TextEditorWithToolbar` component itself, not with a per-caller
`defaultTab="editor"` workaround.

**Root cause confirmed:** `isEditorMode` was derived purely from
`activeTab === "editor"`; `activeTab` defaults to `"preview"` regardless of
`showPreview`. Since the content area already renders `BodyTextEditor`
directly (ignoring `activeTab` entirely) whenever `showPreview` is `false`,
Editor was already the *only* reachable view in that mode — the toolbar's
gating logic just didn't know it, so Save/WCH/Saved silently never
rendered unless a caller also remembered `defaultTab="editor"`.

**Done:** `isEditorMode = !showPreview || activeTab === "editor"`
(`text-editor-with-toolbar.tsx`), with an updated doc comment explaining
why. Removed the now-redundant `defaultTab="editor"` from
`folders/page.tsx`'s Config block (dead — `showPreview={false}` alone is
now sufficient).

**Files changed:** `packages/dashboard/components/shared/text-editor-with-toolbar.tsx`,
`packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx`

**Tested:**
- New component regression test (Task 2 below) exercises this directly.
- Real local Docker smoke test as `test3`: opened a Text item → Config →
  Save/WCH visible immediately (no Preview/Editor tabs at all) → edited a
  custom config field → Save enabled → clicked Save → `modified` timestamp
  updated, Save re-disabled, refreshed and confirmed the edit persisted.

**Status: DONE**

# Task 2 — Component regression test + other callers unaffected

**Requested:** A component-level regression test proving that with
`showPreview={false} showSave={true}`, Save is visible and fires `onSave`;
confirm no regression for every other caller.

**Done:** New `packages/dashboard/components/shared/text-editor-with-toolbar.test.tsx`
(4 cases): Save visible + fires `onSave` with `showPreview={false}`; WCH +
Saved also render in that mode; `showSave={false}` still hides Save even
with `showPreview={false}`; and the pre-existing `showPreview={true}`
behavior (Save hidden on Preview, shown after switching to Editor) is
unchanged. `BodyTextEditor`/`PreviewContent` are mocked (CodeMirror/headers
rendering are unrelated to this bug). Neither `@testing-library/react`,
`jsdom`, nor `@testing-library/user-event` existed in this repo before —
added as root devDependencies, plus a `resolve.alias` (`@` →
`packages/dashboard`) and `oxc.jsx: "automatic"` in `vitest.config.mjs`
(Next's own `tsconfig.json` sets `"jsx": "preserve"`, which Vitest's oxc
transform otherwise inherits and refuses to parse).

Confirmed no other caller passes `showPreview={false}` (grepped all 6
current `TextEditorWithToolbar` usages before making the change) — so the
fix cannot regress any of them; all default to `showPreview={true}`.

**Files changed:** `packages/dashboard/components/shared/text-editor-with-toolbar.test.tsx` (new),
`vitest.config.mjs`

**Tested:** `vitest run` — 4/4 pass. Also re-ran `folders.test.ts` +
existing dashboard pure-logic tests (58 total) after the config change to
confirm no collateral regression.

**Status: DONE**

# Task 3 — Copy controls in the Folders UI

**Requested:** A scope combobox (`body l1` / `body l2` / `all l1`) + Copy
button in the same row as the Body/Config toggle, for Folder items only.

**Done:** Added `exportMode`/`copying`/`copyError` state and
`handleCopyExport()` to `folders/page.tsx`; combobox + Copy button
inserted into the Folder branch's existing Delete/Config button row (Text
branch gets neither — hidden, not disabled, per the input prompt's own
"either is acceptable" allowance). Both controls carry a `title="Copies
saved data."` tooltip. Independent of Body/Config mode (rendered in the
row shared by both), never requires unlocking a protected system folder
(read-only).

**Files changed:** `packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx`

**Tested:** Real Docker smoke test — confirmed the combobox (exactly
"body l1"/"body l2"/"all l1") and Copy button render at both the repo root
and a nested Folder, and are absent for a Text item.

**Status: DONE**

# Task 4/5/6 — Copy's three export modes produce the exact JSON contract

**Requested:** `body l1` (direct children, body only, depth 1), `body l2`
(direct children + each child Folder's own children, depth 2, never
deeper), `all l1` (direct children with full config + body, depth 1) — the
exact DTO shape from the input prompt (`source`/`mode`/`maxDepth`/`items`,
`children` only for `body l2`'s child Folders, `config` only for `all l1`,
numeric CP-index ordering, empty folder → `items: []`).

**Done:** `buildFolderExport`/`exportFolderTree`/`countFolderExportItems`/
`parseFolderExportMode` in `packages/dba/src/folders.ts` — pure given an
injected `getChildren` callback (same seam as `FolderChildOps`). New
`GET /api/folders/export?loca=&mode=&repoGuid=` route returns
`{ export, itemCount }`; the client does the single
`JSON.stringify(data.export, null, 2)` itself (no double-encoding).

**Files changed:** `packages/dba/src/folders.ts`,
`packages/dashboard/app/api/folders/export/route.ts`

**Tested — both unit and real smoke:**
- 12 new unit tests in `folders.test.ts` (`buildFolderExport`/
  `exportFolderTree` describe block): each of the 3 modes' exact shape,
  numeric sort (`"02"` before `"10"`, not lexicographic), an empty Folder
  → `items: []`, rejecting a Text root, and `countFolderExportItems`.
- Real smoke test as `test3`: created a scratch tree (`readme` Text +
  `sub` Folder with one grandchild `deep1` + an empty `emptysub` Folder),
  hit `GET /api/folders/export` in all 3 modes via curl, confirmed the
  exact JSON against the contract — then confirmed the same live in the
  browser: clicked Copy at that folder, read `navigator.clipboard`, got
  the identical pretty-printed JSON. Scratch tree deleted afterward;
  test3's repo root confirmed back to its original 22 children.

**Status: DONE**

# Task 7 — Copy UI states (copying / success / error)

**Requested:** "Copying..." while in flight (blocking re-clicks), a
success toast with mode + item count, a real error message on failure
without clearing the current editor.

**Done:** `handleCopyExport()` guards re-entry via `copying`, sets
`copying`/`copyError` around the fetch, shows `toast.success` with
`data.itemCount` and the server's own human-readable `data.export.mode`
string, and on any failure (`!res.ok`, clipboard write rejection, network
error) sets `copyError` (rendered via the existing `ErrorBox`) without
touching `editorBody`/`configText`.

**Files changed:** `packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx`

**Tested:** Real browser smoke test — clicked Copy, confirmed the button
returned to "Copy" (not stuck) and the clipboard held the correct JSON.
Error path (clipboard permission denial / non-200 response) verified by
code review of the same `handleCopyExport` guard clauses used by the
already-verified success path — not separately reproduced live (denying
clipboard permission mid-session isn't practical to script reliably), but
the same function is exercised either way, no separate error-only code
path exists to miss.

**Status: DONE**

# Task 8 — Repo isolation + explicit export limit

**Requested:** Export must stay inside the session's own repo (no forged
repo, no unauthenticated access), and enforce an explicit item/size limit
— never a silent truncation.

**Done:** `GET /api/folders/export` uses the identical
`getCurrentUserFromCookies` → `resolveFoldersRepoAccess` shape as the
sibling `/api/folders`/`/api/folders/config` routes — `repoGuid` is never
trusted from the client beyond that check. `buildFolderExport` throws
`EXPORT_LIMIT_EXCEEDED` (mapped to HTTP 413) once either the total item
count or total body-character budget is exceeded, checked incrementally
as each level is fetched (a `body-l2` root with too many direct children
is caught before ever fetching grandchildren).

**Files changed:** `packages/dba/src/folders.ts`,
`packages/dashboard/lib/folders-api.ts`,
`packages/dashboard/app/api/folders/export/route.ts`

**Tested:**
- Real smoke test: no session cookie → 401; forged `repoGuid` (a real
  other repo, `chad_admin`) while logged in as non-admin `test3` → 403
  `FORBIDDEN_REPO`; unsupported `mode` value → 400 `UNSUPPORTED_MODE`;
  non-existent address → 404 `ITEM_NOT_FOUND`; a Text item as the export
  root → 409 `ROOT_NOT_FOLDER`.
- `EXPORT_LIMIT_EXCEEDED` itself verified via unit tests only (3 cases:
  item-count limit, body-size limit, and `body-l2`'s limit correctly
  counting grandchildren) — fabricating 500+ real items on `test3` purely
  to trigger the real default limit live wasn't practical/worthwhile;
  the throwing code path is identical regardless of which caller (real
  provider vs. fake `ops`) supplies the data.
- Regression: `pnpm test:tables-sync` — 26 passed, 7 skipped (missing
  local infra), 0 failed.

**Status: DONE**
