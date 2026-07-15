# Story 57 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE      |             | Folders tab shows a Content Provider nav panel: repo dropdown, loca input, Wstecz/Naprzód/GO buttons, no Logout |
| 2 | DONE      |             | Opening a Folder item lists its children as clickable buttons; clicking one navigates into it |
| 3 | DONE      |             | Opening a Text item shows its body content, with Blazor-matching button rows (disabled — no backend yet) and Podgląd/Edytor tabs |
| 4 | DONE      |             | Wstecz/Naprzód move through already-visited items instantly, without a network refetch |
| 5 | DONE      |             | Typing a loca and pressing GO (or Enter) jumps directly to that item |
| 6 | DONE      |             | Repo dropdown lists ALL repos for `pawel_f` only; every other user sees only their own repo |
| 7 | DONE      |             | Folder-type items' `Body` (a raw JSON object from the real API, not a string) parses and renders correctly |

# Task 1 — Nav panel: repo dropdown, loca input, Wstecz/Naprzód/GO, no Logout

**Requested:** A navigation panel matching Blazor's `Repos.razor` — repo, loca, back, forward, GO — but without Logout. First pass made "repo" a read-only label (autonomous scope decision); corrected (Input 3/4) to a real dropdown after the user pasted reference screenshots and said the first pass was wrong — see `02_plan.md`'s "Correction 2".

**Done:** `packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx` — toolbar row (via `DashboardPageShell`'s `toolbar` prop) with a real repo `Select` (or plain text when there's only one option), a loca `Input`, `Wstecz`/`Naprzód` buttons (disabled at the ends of history), and a `GO` button. No Logout button anywhere on the page — kept deliberately even after the screenshots showed one, per the user's own ORIGINAL Input 1 ("bez logout"); the dashboard already has its own, unrelated Logout in the sidebar.

**Files changed:** `packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx` (full rewrite), `packages/dashboard/app/api/folders/route.ts` (full rewrite, then corrected — see below), `packages/dashboard/app/api/flow/cp-flow.ts` (new `getItemByLoca` export). `next.config.ts`/`package.json` were touched then reverted — see `02_plan.md`'s "Correction" section: a first pass added `cp-entry`/`cp-core` as a new dashboard dependency, which broke the Docker build (never gets its `dist/` built inside the container) and was explicitly rejected in favor of reusing the dashboard's existing `cp-flow.ts` → `.NET Content Provider` path, which every other endpoint already relies on.

**Tested (before the correction):** Real, authenticated `curl` session (logged in as `pawel_f`/`changeme` against a locally-running `next dev` + the real, already-running .NET Content Provider API on port 12024) — `GET /api/folders` returned the real repo root item (`Config.name: "chad_pawel_f"`, real children). `GET /dashboard/folders` returned HTTP 200 with the expected `Repo:` label text present in the rendered HTML shell, no server error in the Next.js dev log.

**Tested (after the correction, `cp-flow.ts`-based version):** `pnpm --filter dashboard exec tsc --noEmit` clean. Reproduced the exact failing production step locally — `rm -rf packages/dashboard/.next && pnpm --filter dashboard build` (same command the Dockerfile runs) — completed successfully, `/dashboard/folders` present in the build output (5.25 kB). Live `curl` re-run not repeated after the correction (the underlying `invokeCp` mechanism is identical to what every other already-working dashboard endpoint uses; the build success is the relevant new signal since the failure was a build-time module-resolution error, not a runtime one).

**Not verified, either version:** an actual mouse click on the buttons in a real browser — no headless-browser/screenshot tool is available in this environment (same limitation noted in the earlier Content Provider TS rewrite session's `cp-gui` work). **The user should do a real `docker compose build` before considering this Story's deploy-readiness confirmed** — this Story only reproduced the equivalent of that build locally, not inside Docker itself.

**Status: DONE**

# Task 2 — Folder item: clickable children

**Requested:** Below the nav, a panel for Folder-type items listing children (per `FolderView.razor`), each clickable to navigate.

**Done:** `parseChildNameMap` parses the `{index: name}` JSON `Body` (the same shape `cp-files`/`cp-net-adapter` already produce, confirmed in the prior session's work) into a sorted list, rendered as one full-width ghost `Button` per child with its numeric index shown as a small monospace prefix. Clicking computes the child's relative loca (`parentLoca + "/" + index`) and fetches/navigates to it.

**Files changed:** `packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx`.

**Tested:** `curl` against `GET /api/folders?loca=03/06` (the real "leads" → "all items" folder) returned the real `{index: name}` map with dozens of real entries — confirmed the parsing/rendering logic against real data shape. Actual click interaction not verified in a browser (see Task 1's caveat).

**Status: DONE**

# Task 3 — Text item: body + Blazor-matching button rows (disabled) + Podgląd/Edytor tabs

**Requested:** First pass omitted `TextView.razor`'s button rows entirely, on the user's own words ("buttons below are unnecessary here"). Corrected (Input 3) after the user pasted a reference screenshot and said the omission was wrong — they wanted the full layout, just not necessarily functional.

**Done:** Text-type items now render, matching the screenshot: a Folder/Content/Config/Terminal row, an Open▾/GoogleDoc/Tts row, an Add/type▾/name row, and a Podgląd/Edytor `Tabs` pair (Podgląd = read-only `<pre>`, Edytor = a `Textarea` pre-filled with the body). Folder/Content/Config/Terminal and GoogleDoc/Tts are `disabled` (no `cp-plugin` bridge reachable from a web dashboard, no GoogleDoc integration exists in this codebase). Add and the Edytor `Textarea` are also `disabled` — a real write path exists (`cp-flow.ts`'s already-used `Put`) but wiring it here means answering "which repos can a given user WRITE to," a separate decision not made in this Story (see `06_others_from_report.md`'s follow-up proposal). Every disabled control has a `title` tooltip explaining why.

**Files changed:** `packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx`.

**Tested:** `curl` against `GET /api/folders?repoGuid=f8da1e9a-...&loca=28/02` (the exact Text item from the user's Input 3/4 reference — "pierwsza wizyta / weryfikacja psychoterapety") returned body content byte-for-byte matching the user's pasted reference JSON (Input 4).

**Status: DONE**

# Task 4 — Wstecz/Naprzód: instant, no refetch

**Requested:** Real back/forward navigation (an improvement over Blazor's own dead-code triple-button, per Story 57's autonomous scope decision).

**Done:** `nav` state is `{ items: CpItem[], index: number }` — a single state object (not two separate `useState` calls) specifically to avoid the stale-closure bug that had to be fixed in the earlier `cp-gui` session's equivalent component. Navigating to a new item after going back truncates everything after the current index (standard browser-history semantics). Wstecz/Naprzód only move the index — no network call.

**Files changed:** `packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx`.

**Tested:** Code review only (the single-state-object pattern was deliberately chosen to avoid a bug class already caught and fixed once this session in a near-identical component) — not exercised via an actual browser click sequence.

**Status: DONE**

# Task 5 — GO / Enter-to-navigate

**Requested:** A GO button (matching `Repos.razor`'s `OnGoBtnClicked`) to jump to a typed loca.

**Done:** `GO` button and `Enter` key in the loca `Input` both call the same `handleGo`, which fetches the typed loca and pushes it onto history.

**Files changed:** `packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx`.

**Tested:** `curl` against arbitrary `loca` query values (root `""`, `"03/06"`, `"03/06/71/01"`) all returned correct real items — confirms the underlying fetch path GO relies on. The `Enter` keypress binding itself not exercised in a real browser.

**Status: DONE**

# Task 6 — Repo dropdown: ALL repos for `pawel_f` only, own repo for everyone else

**Requested:** First pass locked "repo" to a read-only label for every user (autonomous scope decision). Corrected (Input 3) — the user's reference screenshots show a real dropdown over ALL repos (36 real repos, including clearly personal ones like "EmotionalThings", "Persistency"). Since this codebase has no admin/role flag, gating was done by username rather than silently exposing all repos to every logged-in user — flagged to the user in-conversation, not decided silently.

**Done:** New `GET /api/folders/repos` returns the full `getAllRepos()` list (`cp-flow.ts`, `["IRepoService","IMethodWorker","GetAllReposNames"]`) only when `user.username === 'pawel_f'`; otherwise a single-item list with just the caller's own repo. `GET /api/folders` accepts an optional `?repoGuid=` that's only honored under the same condition (own repo, or `pawel_f` requesting any repo) — any other value is `403`, never silently substituted.

**Files changed:** `packages/dashboard/app/api/folders/repos/route.ts` (new), `packages/dashboard/app/api/folders/route.ts`, `packages/dashboard/app/api/flow/cp-flow.ts` (new `getAllRepos` export).

**Tested:** `curl` without a session cookie against `GET /api/folders` still correctly returns `401`. Logged in as `pawel_f`: `GET /api/folders/repos` returned all 36 real repos (verified count + sample). `GET /api/folders?repoGuid=f8da1e9a-...` (a different, real repo — "EmotionalThings") correctly returned that repo's real data, not `pawel_f`'s own. The `403`-for-non-owner path was not exercised against a second real non-`pawel_f` login in this round (would need `kamil_s`'s real password, not available) — verified by code review of the exact same condition already proven correct in `/api/folders/repos`.

**Status: DONE**

# Task 7 — Folder `Body` shape bug

**Requested:** Not explicitly requested as a task — found independently via live testing, then confirmed by the user pasting real reference JSON (Input 4) showing the exact same issue.

**Done:** `getItemByLoca` required `raw.Body` to already be a `string`, but the real .NET API returns `Body` as a raw JSON object for Folder items (only Text items get a plain string). Fixed to normalize: `typeof raw.Body === 'string' ? raw.Body : JSON.stringify(raw.Body ?? '')` — same normalization `cp-net-adapter` (an earlier, separate TS-rewrite session) already applied for the identical reason.

**Files changed:** `packages/dashboard/app/api/flow/cp-flow.ts`.

**Tested:** `curl` against `GET /api/folders?repoGuid=f8da1e9a-...&loca=28` (the exact folder from the user's Input 3/4 reference — "wiedza moja") returned the exact same children as the user's pasted reference JSON, after the fix. Before the fix, this same call failed with `"returned an unexpected shape"`.

**Status: DONE**
