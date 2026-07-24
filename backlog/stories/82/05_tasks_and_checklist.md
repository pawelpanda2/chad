# Story 82 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE      |             | Add a child Text item under a Folder in the Folders tab |
| 2 | DONE      |             | Add a child Folder item under a Folder in the Folders tab |
| 3 | DONE      |             | Newly created item is visible immediately, no manual workaround needed |
| 4 | DONE      |             | Created item survives a page refresh |
| 5 | DONE      |             | Edit and save a Text item's body |
| 6 | DONE      |             | Saved body survives a page refresh |
| 7 | DONE      |             | Folder's body stays read-only (no edit path built for it) |

# Task 1 — Add a child Text item

**Requested:** Enable creating a new Text child under the currently open Folder.
**Done:** `POST /api/folders` (`packages/dashboard/app/api/folders/route.ts`) resolves the parent address from the session's own `repoGuid` + client-supplied relative `parentLoca`, calls new `dba` function `createFolderChildItem` (`packages/dba/src/folders.ts`), which validates name/type, confirms the parent exists and is a Folder, then delegates to the existing `createOrGetChild`. GUI (`folders/page.tsx`): Add button/name input/type select enabled for Folder items, disabled while in flight, clears the name on success, refreshes the current folder in place (no new history entry — matches `FolderView.razor`'s real behavior).
**Files changed:** `packages/dba/src/folders.ts` (new), `packages/dba/src/index.ts`, `packages/dashboard/app/api/folders/route.ts`, `packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx`.
**Tested:** `folders.test.ts` (fake-ops unit tests); real curl against local dev server (create, 400/404/409 validation cases); real browser click-through (created `story82-browser-folder`, appeared immediately as child "23").
**Status: DONE**

# Task 2 — Add a child Folder item

**Requested:** Enable creating a new Folder child under the currently open Folder.
**Done:** Same code path as Task 1 — `type: "Folder"` is one of the two allowed values (`Ref` intentionally excluded, per task instructions — no confirmed contract for it).
**Files changed:** same as Task 1.
**Tested:** same as Task 1 — real browser click-through created `story82-test-folder`/`story82-browser-folder`, both enterable afterward.
**Status: DONE**

# Task 3 — New item visible immediately

**Requested:** No manual refresh/workaround needed to see a newly created item.
**Done:** POST response includes both the created/found item and a refreshed view of the parent; the GUI replaces the current folder's item in place (`replaceCurrentItem`) with the parent's updated children map — no second round trip, no full page reload needed.
**Files changed:** same as Task 1.
**Tested:** real browser click-through — child button appeared in the same render after clicking Add, no refresh needed.
**Status: DONE**

# Task 4 — Created item survives refresh

**Requested:** New items must persist, not just live in client state.
**Done:** Writes go through `createOrGetChild` → `DbaDataRouter.executeWrite` → the configured primary provider (Postgres, in this Story's verification run) — a real, durable write.
**Files changed:** n/a (verification only).
**Tested:** Full browser page reload (`goto` on `/dashboard/folders`, fresh mount) then navigated back to the created item's `loca` — content still present; also confirmed via a direct `curl GET` after the dev server process itself had been restarted between checks.
**Status: DONE**

# Task 5 — Edit and save a Text item's body

**Requested:** Textarea active, explicit Save button, disabled when unchanged/saving, error handling that doesn't discard user input.
**Done:** `PUT /api/folders` (`{loca, body}`) resolves the address from the session, calls new `updateFolderTextBody` (confirms the item exists and is Text), delegates to existing `putItemBody`. GUI: Textarea is editable; a "Zapisz" button appears next to the Editor tab (only while that tab is active, mirroring `CodeEditorTabs.razor`), disabled when `editorBody === currentItem.Body` or a save is in flight; on success the item is replaced in place (`replaceCurrentItem`) and a "Zapisano!" notice shown; on error the textarea keeps the user's text and an inline error shows via `ErrorBox`.
**Files changed:** same as Task 1.
**Tested:** `folders.test.ts` (update existing / reject missing / reject Folder / Polish-character + multi-line body); real browser click-through — typed a two-line body with Polish diacritics and an em-dash, Save button went from disabled→enabled→disabled, content persisted.
**Status: DONE**

# Task 6 — Saved body survives refresh

**Requested:** Saved changes must be durable.
**Done:** Same durable write path as Task 4.
**Files changed:** n/a (verification only).
**Tested:** Full page reload + direct navigation to the item's `loca`, and a direct `curl GET` — saved Polish-character multi-line body confirmed present both times.
**Status: DONE**

# Task 7 — Folder body stays read-only

**Requested:** Never build an edit path for a Folder's body (it's a computed children map, not real content).
**Done:** No editor is rendered for Folder items (only the existing Add form + children list); `updateFolderTextBody` explicitly rejects (409 `NOT_TEXT_ITEM`) any attempt to PUT a Folder's body, even via a raw API call bypassing the GUI.
**Files changed:** same as Task 1.
**Tested:** `folders.test.ts` (`rejects updating a Folder`); curl `PUT` against a known Folder `loca` → confirmed 409.
**Status: DONE**

---

**Not yet done — deliberately stopped short at the user's explicit request mid-session** ("przerwij poprzednie zadanie... szkoda tokenów"): TEST deployment and the TEST-environment smoke test. Code is committed-ready, typechecked, unit-tested, and verified end-to-end against a real local Postgres + real browser session; it has **not** been deployed to QNAP TEST yet. See `06_others_from_report.md`.
