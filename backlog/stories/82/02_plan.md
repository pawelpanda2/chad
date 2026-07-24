# Story 82 — Plan

Autonomous repair task (no interactive plan approval — user explicitly asked
for self-directed implementation). This file records the approach actually
taken.

## Scope decision: no cp-gui consolidation

`packages/dashboard`'s `folders/page.tsx` does **not** currently use
`packages/cp-gui`'s components — it's an independent port of the same Blazor
source, calling the dashboard's own `/api/folders` (which reads through
`dba`, not through cp-gui's `BackendAdapter`/`cp-api` HTTP path, since the
.NET Content Provider is no longer deployed — Story 72). `cp-gui`'s
`BackendAdapter.put`/`postParentItem` still throw (Stage 3 stub) and its
`createHttpBackendAdapter` talks to `cp-api`, an interface that no longer has
a live backend behind it in this deployment. Switching Dashboard onto cp-gui
now would mean either standing up cp-api's write endpoints against `dba`
(new, out-of-scope surface) or reworking cp-gui's adapter contract — real
architecture work, not this bug-fix. Per the task's own instruction, this is
deferred to `06_others_from_report.md` as a proposal; only the existing
dashboard page gets a real write path in this Story.

## DBA layer

`item-ops.ts` already has exactly the primitives named in the task:
`createOrGetChild`, `putItemBody`, `getItemByAddress`, `getChildrenOf` — all
routed through `getDataRouter()`, backend-agnostic (Mongo/Postgres/CP chosen
centrally, never per-feature). New file `packages/dba/src/folders.ts` adds
the business-level operations the Folders write path needs, calling these
primitives (per `05_endpoint-rules.md` naming rule — business name, not CP
method name):

- `createFolderChildItem(parentAddress, name, type, body?)` — validates
  `type` (`Text`/`Folder` only — `Ref` explicitly excluded per task), the
  name (trim, non-empty, no `/`, `\`, `..`), fetches the parent, confirms it
  exists and is a `Folder`, then delegates to `createOrGetChild`. Returns
  `{ item, alreadyExisted }` — `alreadyExisted` determined by checking the
  parent's existing children before the call (the underlying `PostParentItem`
  semantics are find-or-create and never throw on a name collision).
- `updateFolderTextBody(address, body)` — fetches the item, confirms it
  exists and is `Text` (never `Folder` — its Body is a computed children
  map, not real content), then delegates to `putItemBody`.

Both take a full CP `address` (not a bare `loca`) — the caller (API route)
is responsible for building it from the authenticated user's own
`repoGuid`, so these functions never see or trust a client-supplied
repo/parent id directly; they only ever operate on an address the route
itself constructed.

Both accept an optional injectable `ops` bundle (default: the real
`item-ops.ts` functions) purely so `folders.test.ts` can unit-test the
validation/branching logic with an in-memory fake — mirroring
`data-router.test.ts`'s existing fake-provider pattern — without needing a
live Mongo/Postgres. Production call sites never pass this parameter, so the
real code path is unaffected.

## API routes

Extend the existing `packages/dashboard/app/api/folders/route.ts` (thin
adapter, per `05_endpoint-rules.md`) with:

- `POST` — body `{ parentLoca, type, name, body? }`. Resolves
  `user.repoGuid` from the session (never trusts a client-supplied repo),
  builds the full parent address, calls `createFolderChildItem`, returns the
  created/found item plus a refreshed view of the parent (so the GUI can
  update its children list without a second round trip).
- `PUT` — body `{ loca, body }`. Same repo resolution, calls
  `updateFolderTextBody`.

Both wrap their handler body in `runWithRepoContext({ repoGuid, username },
...)` (existing convention, e.g. `api/forms/date-entry/route.ts`) so
`cp_history`'s actor attribution works for these writes too.

Status codes: 401 (no session), 400 (bad name/type/body), 404 (parent/item
not found), 409 (parent exists but isn't a Folder / item exists but isn't
Text), 500 (unexpected).

## GUI

`folders/page.tsx`:

- Folder view: enable Add (name input + Text/Folder select, no Ref) →
  `POST /api/folders`. On success, re-fetch the *current* folder (same loca)
  and replace it in place in `nav.items` (no new history entry) — matches
  `FolderView.razor`'s own `OnAddClicked` (stays on the folder, refreshes
  children; does not auto-navigate into the new item). Clears the name
  field, guards against double-submit, surfaces backend errors inline, and
  shows a distinct (non-error) message when `alreadyExisted` is true.
- Text view: the "Add" row in `TextView.razor` doesn't wire to
  `PostParentItem`/`createOrGetChild` at all — it calls an unrelated,
  disconnected operation (`ItemWorker/AppendLine`, with a dead `formAddType`
  that's bound to a "Text→Up / Folder→Down" select never even passed to the
  call). No safe, confirmed create-child semantics exist for Text items —
  per the task's own fallback rule, this row is removed rather than wired up
  or left as a misleading disabled stub.
- Text view: Textarea becomes editable; an explicit "Zapisz" button appears
  next to the Editor tab (mirrors `CodeEditorTabs.razor`'s own Save-only-in-
  edit-tab placement), disabled when `editorBody === currentItem.Body` or a
  save is in flight → `PUT /api/folders`. On success, replaces the current
  item in `nav.items` in place with the returned item (keeps `editorBody` as
  the user's just-saved text — no clobbering). On error, the textarea keeps
  the user's unsaved text and an inline error is shown.
- Folder body stays read-only (no edit path is built for it — its Body is a
  derived children map, not stored content, per the task).

## Tests

- `packages/dba/src/folders.test.ts` (Vitest, added to root
  `vitest.config.mjs` include list): pure, fake-`ops`-based — create Text,
  create Folder, find-or-create returns `alreadyExisted: true` on a name
  collision, update body, reject update of a non-existent item, reject
  update of a Folder, reject create under a non-Folder parent, reject create
  under a missing parent, name validation (empty / `..` / `/`).
- API-route-level checks (no session / correct create / correct update /
  validation / repo isolation / edit-Folder rejected) are done as real HTTP
  requests (curl) against the local dev server during manual verification,
  not as mocked Vitest tests — this codebase has no existing precedent for
  mocking Next.js route handlers, and the actual validation/business logic
  under test already has real unit coverage in `folders.test.ts`; the route
  itself is intentionally thin per `05_endpoint-rules.md`.
- `tsc`/typecheck for `packages/dba` and `packages/dashboard`.
- Real browser click-through locally (and repeated against QNAP TEST after
  deploy): create Text, create Folder, edit+save Text body, refresh/back/
  forward, confirm persistence.
