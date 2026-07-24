# Story 82 — Knowledge

## Entry point / docs actually read

- `ai-docs/begin_here/01_ai_start.md` → `03_story-standard.md`,
  `05_endpoint-rules.md`, `04_deployment-rules.md` — the real current entry
  point (not `README.md`/`CLAUDE.md`/`AGENTS.md`, none of which exist at
  repo root).
- `human-docs/dba/post-parent-item.md` — confirms `PostParentItem`
  find-or-create contract that `createOrGetChild` implements.
- `human-docs/features/folders-features.md` — **stale**, describes an
  older, unrelated read-only "Folders" page (`getFormsFolderStructure()`,
  forms/action/lead records). Does not describe the current CP-browser
  Folders page at all (that one has no per-feature doc of its own yet —
  its own header comment in `page.tsx` is the closest thing). Not updated
  in this Story (out of scope; noted here so nobody re-reads it expecting
  it to match the current page).
- `human-docs/content-provider/next-tasks/typescript-migration-plan.md` —
  background on the CP→TS migration; confirms the .NET CP is being phased
  out in favor of `dba`'s own providers (Mongo/Postgres), consistent with
  what `/api/folders/route.ts`'s own comments already say.
- `backlog/stories/57/`, `60/`, `68/` — Story 57 built the original
  read-only Folders CP browser (faithful Blazor port, Add/Save intentionally
  disabled). Story 60 fixed a real repo-isolation hole (`pawel_f` could
  browse any repo via `getAllRepos()`) — the current `/api/folders/repos`
  route's single-repo-from-session design is that fix. Story 68 unrelated
  to this area (not cited further here).

## Parallel session in progress on the same repo (per existing memory + observed live edit)

`backlog/stories/81/` already exists (created before this Story) as a
Postgres-migration follow-up — a second, concurrent Claude Code session is
running in this same working directory (confirmed live: `packages/dba/src/
index.ts` changed mid-Story, adding `data-outbox-bootstrap.js`'s export,
which this Story did not do). This Story used the next free number (82,
not 81) and only ever edits files it authored for this task — `git status`
was checked before staging to avoid picking up the other session's
in-flight changes.

## Architecture actually found (differs from the task prompt's assumption in one place)

The task prompt assumes a MongoDB-centric "DBA architecture: Mongo primary +
async CP mirror" (matches an earlier memory note). **Story 80 (already on
`HEAD` before this Story started, commit `1e74868`) replaced that**:
PostgreSQL is now available as an alternate primary backend
(`DBA_PRIMARY_BACKEND=postgres`), Mongo kept only for Beeper + as a CP
follower/legacy option. None of this matters for this Story's own code:
`item-ops.ts`'s `createOrGetChild`/`putItemBody`/`getItemByAddress`/
`getChildrenOf` already fully abstract over whichever backend
`getDataRouter()` is configured with (Mongo, Postgres, or the — no longer
deployed — .NET Content Provider) via `DbaDataRouter`. This Story's new code
never branches on backend; it only calls these four existing primitives.

`cp-gui` (README + components) targets the OLD `.NET Content Provider` via
an HTTP `BackendAdapter` → `cp-api`, which has no write endpoints (`put`/
`postParentItem` still throw — "Stage 3") and, per `/api/folders/route.ts`'s
own comment, that Content Provider is no longer deployed at all (Story 72
moved reads onto `dba`). Dashboard's `folders/page.tsx` is a **separate**,
independent port of the same Blazor source that talks to `dba` directly
through the dashboard's own Next.js API routes — not a cp-gui consumer.
Confirmed real duplication exists (task's own suspicion was correct); not
resolved in this Story, see `06_others_from_report.md`.

## Legacy Blazor reference (read directly, not summarized from memory)

- `packages/net-content-provider/front_blazor/BlazorApp/Components/
  ItemModels/FolderView.razor` — `OnAddClicked`: builds `{ parentAddress:
  Item.AdrTuple, name: formAddValue, type: formSelectedType }`, calls
  `Repo.PostParentItem(...)`, then **re-fetches the same folder** (`Repo.
  GetItem(Item.AdrTuple)`) and refreshes in place — does **not** navigate
  into the newly created child. Type select offers Text/Folder/Ref.
- `.../ItemModels/TextView.razor` — its own "Add" row (`OnAddClicked`) does
  **not** call `PostParentItem`/any child-creation operation at all — it
  calls a completely different, unrelated backend operation
  (`ItemWorker.AppendLine`), and the row's own "Up"/"Down" select
  (`formAddType`, bound to `Text`/`Folder` values) is never even read by
  that handler — dead UI, matches the cp-gui README's own callout about
  Blazor's duplicate back-button dead code. There is no confirmed,
  safe semantics for a Text item's "Add" row → removed rather than wired up
  (task's own explicit fallback instruction for this exact case).
- `.../ItemModels/CodeEditorTabs.razor` — real Save behavior this Story's
  GUI change mirrors: Save button only rendered while the Editor tab is
  active, calls `Put(repo, loca, type, name, editorCode)`, shows a
  transient success/error message, and only notifies the parent (updating
  the displayed body) **after** a successful save — never before.

## DBA primitives already in place (no need to add lower-level ops)

`packages/dba/src/item-ops.ts`:
- `createOrGetChild(parent: CpItem, name, type, body?)` → builds a
  `CreateChildItemCommand` via `data-commands.ts`, executes through
  `getDataRouter().executeWrite`. Idempotent find-or-create (confirmed by
  reading both `MongoCpProvider`/`PostgresCpProvider`'s `createChild`: an
  existing same-name child is returned as-is, `alreadyExisted: true` on the
  router's own `DataWriteResult` — but `createOrGetChild` itself discards
  that flag and returns only the item, so this Story's new `folders.ts`
  determines "already existed" itself via a children pre-check rather than
  changing `createOrGetChild`'s return shape, which several existing callers
  in `leads.ts`/`report-entries.ts` depend on as-is).
- `putItemBody(address, body)` → fetches the existing item, throws if
  missing, then `buildPutItemCommand` + `executeWrite`.
- `getItemByAddress(address)` / `getChildrenOf(parentAddress)` — plain
  reads through the router.
- `DuplicateChildNameError` (from the provider layer) is a *different*
  condition — two siblings already sharing one name (data corruption),
  raised by `getByNames2`, not by the normal create-or-get path used here.

## Session / repo-isolation pattern already established

`/api/folders/route.ts` (GET) and `/api/folders/repos/route.ts` are the
existing, working reference for this Story's new POST/PUT: resolve
`getCurrentUserFromCookies()`, never trust a client-supplied `repoGuid`
(403 on mismatch), build the full CP address as
`${user.repoGuid}/${loca}`. `api/forms/date-entry/route.ts` is the existing
reference for wrapping a *write* handler in
`runWithRepoContext({ repoGuid, username }, ...)` so `cp_history`'s actor
attribution works.

## Local dev environment note

`.env.local` has `DBA_MONGO_MODE=qnap` and a `POSTGRES_URI` pointed at the
docker-compose-internal hostname `postgres` (not reachable bare from a host
`next dev` process) with no `DBA_PRIMARY_BACKEND` override, so `dba`
defaults to Mongo-primary, and per existing memory that Mongo is the real,
shared QNAP instance (also used by TEST/PROD) — **not** a disposable test
DB. Any local browser smoke test in this Story creates real items in the
logged-in user's own repo; used clearly-named test items
(`story82-test-...`) for easy identification/cleanup, and this is called out
explicitly in the report rather than treated as a throwaway sandbox.
