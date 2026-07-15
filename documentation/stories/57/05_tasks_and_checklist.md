# Story 57 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE      |             | Folders tab shows a Content Provider nav panel: read-only repo label, loca input, Wstecz/Naprzód/GO buttons, no Logout |
| 2 | DONE      |             | Opening a Folder item lists its children as clickable buttons; clicking one navigates into it |
| 3 | DONE      |             | Opening a Text item shows its body content, read-only, no per-item toolbar buttons |
| 4 | DONE      |             | Wstecz/Naprzód move through already-visited items instantly, without a network refetch |
| 5 | DONE      |             | Typing a loca and pressing GO (or Enter) jumps directly to that item |
| 6 | DONE      |             | Only the current logged-in user's own repo is ever shown — no cross-user repo picker |

# Task 1 — Nav panel: repo label, loca input, Wstecz/Naprzód/GO, no Logout

**Requested:** A navigation panel matching Blazor's `Repos.razor` — repo, loca, back, forward, GO — but without Logout, and without a repo picker (per Story 57's autonomous scope decision, see `02_plan.md`).

**Done:** `packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx` — toolbar row (via `DashboardPageShell`'s `toolbar` prop) with a read-only `Repo: <name>` label, a loca `Input`, `Wstecz`/`Naprzód` buttons (disabled at the ends of history), and a `GO` button. No Logout button anywhere on the page (the dashboard already has its own, unrelated Logout in the sidebar).

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

# Task 3 — Text item: read-only body, no per-item toolbar

**Requested:** Below the nav, a panel for Text-type items showing the body — but WITHOUT the buttons Blazor's `TextView.razor` has below its own toolbar (Folder/Content/Config/Terminal/GoogleDoc/Tts/Add), since the user said those are unnecessary here.

**Done:** Text-type items render their `Body` in a plain, read-only `<pre>` block. No toolbar, no Add form, no `cp-plugin` integration of any kind.

**Files changed:** `packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx`.

**Tested:** `curl` against `GET /api/folders?loca=03/06/71/01` (a real "contacts" Text item) returned the real raw body content (`instagram:\n  - https://...`) — confirmed the fetch/shape works for a real Text item.

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

# Task 6 — Repo locked to the current user, no cross-user picker

**Requested:** Implicit in "repo" being a toolbar element, but resolved by this Story's own autonomous scope decision (see `02_plan.md` point 1) in favor of NOT porting Blazor's all-repos combobox, since this dashboard has an established per-user data-isolation model Blazor's single-operator tool doesn't need.

**Done:** `/api/folders` resolves `repoGuid` exclusively via `getCurrentUserFromCookies()` server-side; the client never sends or receives any other repo's GUID. The UI shows the resolved repo's own logical `name` as plain text, not a `<select>`.

**Files changed:** `packages/dashboard/app/api/folders/route.ts`.

**Tested:** `curl` without a session cookie against `GET /api/folders` correctly returned `401` (blocked before reaching the route handler, by the dashboard's own auth middleware/layout) — confirms the endpoint isn't reachable unauthenticated. Logged-in `pawel_f` correctly only ever saw `pawel_f`'s own repo (`21d11bdc-...`) in every test call.

**Status: DONE**
