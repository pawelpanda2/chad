# Story 95 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE      |             | Add a "Config" button next to Delete (both Text and Folder) that toggles the item view between Body and Config, label flipping accordingly |
| 2 | DONE      |             | Config view shows `currentItem.Config` as pretty-printed, editable JSON with only Editor + Save (no Preview tab) |
| 3 | DONE      |             | Body view unchanged for Text (Preview/Editor/Save) and Folder (children list) |
| 4 | DONE      |             | Valid config edits save and persist after refresh, without altering the item's body |
| 5 | DONE      |             | Body saves never alter the item's config (independent save paths verified both directions) |
| 6 | DONE      |             | Invalid JSON is rejected (client-side parse error shown, Save disabled; server also rejects non-object JSON) |
| 7 | DONE      |             | Identity fields `id`/`address`/`type`/`name` are protected — any attempted change is rejected with 409 |
| 8 | DONE      |             | Read-only system folders (e.g. `views/daily`) block Config saves the same way they already block Body saves (403), unless admin-unlocked |
| 9 | PARTIAL   |             | Body and Config drafts are independent and survive mode-switching without saving; both re-initialize on navigation to a different item |

# Task 1 — Config button next to Delete

**Requested:** A "Config" button directly beside the existing Delete button,
switching the item view Body ↔ Config, flipping its own label
("Config" ↔ "Body").

**Done:** Added `type EditorMode = "body" | "config"` state
(`packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx`) and a
`toggleEditorMode()` handler. The button is rendered in both the Text and
the Folder branch's top button row, immediately after Delete.

**Files changed:** `packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx`

**Tested:** `next build` succeeds (button renders in both branches, no
TS/JSX errors). Not click-tested in a live browser — see Task 9's note on
why.

**Status: DONE**

# Task 2 — Config view: JSON editor only, no Preview

**Requested:** Config panel shows `JSON.stringify(config, null, 2)`,
editor + Save only, no Preview tab.

**Done:** Reused the shared `TextEditorWithToolbar` with
`showPreview={false}` (already supported) and added a new optional
`defaultTab="editor"` usage — required because the component's `isEditorMode`
(which gates the Save button) is derived from `activeTab`, which defaults to
`"preview"`; without `defaultTab="editor"` the Save button would never
render when Preview is hidden. Also added a new optional `saveDisabled`
prop to `TextEditorWithToolbar` (default `false`, so every other caller is
unaffected) so Config's Save button can be disabled for invalid JSON / no
changes / in-flight save / protected folder — the component previously only
gated Save on `saving`.

**Files changed:**
`packages/dashboard/components/shared/text-editor-with-toolbar.tsx`,
`packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx`

**Tested:** Confirmed by reading the component's own gating logic
(`isEditorMode = activeTab === "editor"`) before wiring `defaultTab`; `tsc
--noEmit` and `next build` both clean.

**Status: DONE**

# Task 3 — Body view unchanged

**Requested:** Text keeps Preview/Editor/Save; Folder's Body mode keeps
showing the real children list (not a derived/editable body).

**Done:** All existing Body-mode JSX kept as-is, only wrapped in
`{editorMode === "body" && (...)}`. Folder's Add-child row, error/notice
messages, and children list are all still rendered exclusively in Body
mode — Config mode fully replaces them, never derives from them.

**Files changed:** `packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx`

**Tested:** `next build` clean; confirmed via smoke test (Task 4) that
`Body` in the API response for a Folder is still the real computed
children map, untouched by a Config save.

**Status: DONE**

# Task 4 — Config save persists, body untouched

**Requested:** A correct config saves and survives a refresh; body must
never change or be lost as a result.

**Done:** New DBA primitive `putItemConfig` (`packages/dba/src/item-ops.ts`)
— selects the primary provider (Postgres/Mongo) directly, same convention
as the existing `deleteItemByAddress`, and calls the provider's own
`putItemConfig` (already implemented on `PostgresCpProvider`/
`MongoCpProvider`/`NetFileCpProvider` per `CpCompatibleDataProvider`'s
existing contract — it re-fetches the existing body and always writes it
back unchanged). New business function `updateFolderItemConfig`/
`updateFolderItemConfigAllowingSystemFolderWrite`
(`packages/dba/src/folders.ts`) validates the incoming JSON and calls it.
New route `PUT /api/folders/config`
(`packages/dashboard/app/api/folders/config/route.ts`).

**Files changed:** `packages/dba/src/item-ops.ts`, `packages/dba/src/folders.ts`,
`packages/dashboard/app/api/folders/config/route.ts`,
`packages/dashboard/lib/folders-api.ts` (new — `toApiItem`/
`statusForFoldersError` extracted here so both `/api/folders` and
`/api/folders/config` route files can share them; a Next.js App Router
`route.ts` may only export the HTTP-verb handlers).

**Tested — real smoke test against the running local Docker stack, user
`test3`, not just unit tests:**
1. Created a scratch Text item (`.../04`, name `story95-smoke-test`, body
   `"hello smoke test"`).
2. `PUT /api/folders/config` with the full config plus a new custom field
   `customTag: "story95-value"` → 200, response body still
   `"hello smoke test"`, config now carries `customTag`.
3. `GET /api/folders?loca=04` (fresh read) → same `customTag` present,
   confirming persistence, not just an echoed response.
4. `PUT /api/folders` (existing body-save endpoint) with a new body → 200,
   re-fetch shows the new body **and** `customTag` still present — proves
   body-save doesn't touch config.
5. Deleted the scratch item afterward; re-fetched the repo root and
   confirmed it's back to its original 3 children.

**Status: DONE**

# Task 5 — Body save never alters config

Covered by Task 4, step 4 above (the same smoke sequence exercises both
directions in one pass, per the acceptance criteria's own framing).

**Status: DONE**

# Task 6 — Invalid JSON rejected

**Requested:** Malformed JSON must not save; Save disabled while invalid;
parser error surfaced.

**Done:** Client: `configParseError` computed on every render via
`JSON.parse`/catch, shown through `ErrorBox`, folded into
`configSaveDisabled` (along with "no changes"/"saving"/"protected, not
unlocked"), passed to `TextEditorWithToolbar`'s new `saveDisabled` prop.
`handleSaveConfig` also re-parses and bails out with an inline error if
called anyway (e.g. via the editor's Ctrl+S shortcut, which calls `onSave`
regardless of the button's disabled attribute). Server:
`updateFolderItemConfig`'s `validateItemConfig` rejects non-object/null/
array JSON and missing required fields with `VALIDATION` (400) —
defense in depth, not just a client-side check.

**Files changed:** `packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx`,
`packages/dba/src/folders.ts`

**Tested — real smoke test:** `PUT /api/folders/config` with `"config":[]`
→ `400 {"error":"VALIDATION","details":"Config must be a JSON object (not
null, an array, or a primitive value)"}`. Also covered by 5 new unit tests
in `folders.test.ts` (array, null, missing required field).

**Status: DONE**

# Task 7 — Identity fields protected

**Requested:** Backend must require `id`/`address` identical to the
existing item, and by default block `type`/`name` changes too (no confirmed
safe rename/retype contract exists).

**Done:** `validateItemConfig` in `folders.ts` compares `id`, `address`,
`type`, and `name` against the existing item's config; any mismatch throws
a new `FoldersOperationError` code `FORBIDDEN_IDENTITY_CHANGE`, mapped to
HTTP 409 in `statusForFoldersError`. `name` editing was **not** enabled —
per the input prompt's own instruction, no confirmed safe rename contract
exists in `dba` yet (see `06_others_from_report.md`).

**Files changed:** `packages/dba/src/folders.ts`,
`packages/dashboard/lib/folders-api.ts`

**Tested — real smoke test, all 4 identity fields:**
- `id` changed → 409 `FORBIDDEN_IDENTITY_CHANGE`.
- `address` changed → 409 (also doubles as the cross-repo check — see
  Task 8).
- `type` changed (`Text` → `Folder`) → 409.
- `name` changed → covered by unit test (`folders.test.ts`) since the
  smoke run didn't need to repeat every combination live.

Also covered by 9 new unit tests in `folders.test.ts`.

**Status: DONE**

# Task 8 — System-folder read-only + auth/isolation

**Requested:** Config save must respect the same read-only system-folder
protection as Body/Delete, reject unauthenticated requests, and never allow
a cross-repo write.

**Done:** `updateFolderItemConfigInternal` reuses the existing
`assertNotSystemFolderWrite(names, "update-body")` — the same function
Body/Create/Delete already call, same protection semantics, no new action
enum needed. The route resolves `address` exclusively from
`user.repoGuid` (session-derived, per `getCurrentUserFromCookies`), exactly
like the sibling `/api/folders` route — the client never supplies a repo id.

**Files changed:** `packages/dba/src/folders.ts`,
`packages/dashboard/app/api/folders/config/route.ts`

**Tested — real smoke test:**
- No session cookie → `401 NOT_AUTHENTICATED`.
- Config save attempted on `views/daily` (a real registered system folder,
  `SYSTEM_FOLDERS` in `system-folders.ts`) as non-admin `test3`, no unlock
  → `403 SYSTEM_FOLDER_READ_ONLY`, with the same "managed by Daily
  Tracker" message Body edits already show.
- **Correction made during testing:** an earlier smoke-test attempt against
  `views` itself (the parent, not `views/daily`) succeeded — this is
  **correct** behavior, not a bug: only `views/daily`, `views/dates`, and
  `leads` are registered in `SYSTEM_FOLDERS`, `views` itself is not. The
  accidental custom field written to `test3`'s `views` config during that
  probe was reverted immediately in the same session before moving on.
- Cross-repo: since `address` is always the session's own
  `repoGuid + loca` and `updateFolderItemConfig` additionally requires the
  submitted `config.address` to match the existing item's real address
  exactly, there is no request shape that can target another repo's item —
  confirmed by reading the code path, not a separate live second-user test
  (no second real login was mutated for this, per "don't mutate `pawel_f`/
  `kamil_s`").

Regression: `pnpm test:tables-sync` (26 passed, 7 skipped for missing local
infra, 0 failed) — covers `assertNotSystemFolderWrite`'s own behavior,
which this Task's protection is built directly on top of.

**Status: DONE**

# Task 9 — Independent drafts, survive mode switching, reset on navigation

**Requested:** Body/Config each have their own draft state; switching modes
never saves or discards the other's unsaved edits; both reset when
navigating to a different item.

**Done:** `editorBody`/`configText` are separate `useState` values lifted
in `FoldersPage`, both reset together only in the effect keyed on
`currentItem?.Address` (real navigation) — never touched by
`toggleEditorMode()` itself. Because `editorMode === "body"`/`"config"`
conditionally mounts one `TextEditorWithToolbar` instance or the other, the
actual draft text survives a mode switch (it lives in the parent, not the
child component); only the child's own ephemeral UI state (e.g. which
inner Preview/Editor tab was selected) resets on remount, which is a
cosmetic detail, not data loss.

**Files changed:** `packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx`

**Tested:** Verified by reading the effect's dependency array
(`[currentItem?.Address, selectedRepoGuid]`, unchanged from before this
Story) and confirming `toggleEditorMode` only flips `editorMode`, touching
no other state. **Not verified by an actual click-through in a running
browser** — the shared Playwright MCP browser instance was locked by
another concurrent Claude Code session in this same repo throughout this
Story's work (`Error: Browser is already in use for
.../mcp-chrome-6ca972c`), so this specific interactive-UI behavior
(type in Body, switch to Config, switch back, confirm the Body edit is
still there) was reasoned through code, not observed live. Everything this
Task depends on server-side (the save calls themselves, independent
persistence) *was* proven live via curl in Task 4/5. Flagging this
explicitly rather than claiming a full PASS — this is the one gap in this
Story's testing.

**Status: PARTIAL** (server-side behavior fully proven; the pure front-end
mode-switching/draft-preservation interaction wants a real click-through
before being called fully verified)
