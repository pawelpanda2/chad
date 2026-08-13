# Story 120 — Tasks Checklist

Starting point commit: `4df7914` (baseline checkpoint of pre-existing,
unrelated cp_1 Finder-sidebar changes found in the working tree at the
start of this Story — committed separately before any Story 120 edits, per
the mandatory-return-point rule).

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE      |             | Shared address↔slug codec (`lib/cp-address/route-codec.ts`), UUID-safe, unit-tested |
| 2 | DONE      |             | Canonical `/dashboard/folders/<address-slug>` — URL is the source of truth for the current item, deep-link/refresh/base-route-restore all work |
| 3 | DONE      |             | Shared `DashboardHistoryProvider` rewritten on a pure, unit-tested reducer — real Back/Forward vs a fresh `A→B→A` navigation, `MAX_BACK` raised to 30, works dashboard-wide |
| 4 | DONE      |             | CP-link is a real `<a>`/`<Link>` (right-click/Cmd-click/middle-click/plain-click all open a new tab) instead of a click-handler button |
| 5 | DONE      |             | CP-link opens the correct chrome-free view by target type: Text → new `/dashboard/item-view/<slug>`; Folder → `/dashboard/knowledge/<slug>` |
| 6 | DONE      |             | Knowledge gained an address-based mode (any CP Folder, not just its own menu tree) alongside its existing, unchanged name-slug browsing; a Knowledge Text row now opens in a new tab |
| 7 | DONE      |             | Structural Wstecz/Naprzod (address-tree up/redo stack) in Folders, independent of the shared cross-page history |
| 8 | PARTIAL   |             | Local Docker rebuild + live smoke test of the FINAL build (Knowledge address mode, Item View, type-based CP-link routing) — blocked by an unrelated cp_1 SMB-auth infra issue; see Task 8 write-up |

# Task 1 — Shared address↔slug codec

**Requested:** One shared, testable codec (`cpAddressToRouteSlug`/`cpRouteSlugToAddress`/...), not a naive `slug.replaceAll("-", "/")` — a UUID's own hyphens make that ambiguous. Reject path traversal/injection.

**Done:** `packages/dashboard/lib/cp-address/route-codec.ts`. Relies on the UUID's fixed 36-char canonical form: the first 36 characters of a slug are always the repoGuid, the rest is `-`-joined numeric loca segments (CP's own numeric child indices), each validated `^[0-9]+$` — rejects traversal/injection by construction. Also exports `cpAddressToFoldersHref`, `cpAddressToItemViewHref`, `cpAddressToKnowledgeHref`, `cpAddressRepoGuid`, `cpRouteSlugToParts` (straight to `{repoGuid, loca}`, used by Item View/Knowledge address mode to skip an intermediate address round-trip).

**Files changed:** `packages/dashboard/lib/cp-address/route-codec.ts` (new), `route-codec.test.ts` (new).

**Tested:** Unit — round-trip (bare root, single segment, multi-segment despite the UUID's own hyphens), rejection of invalid UUID/non-numeric segment/path-traversal/malformed slug, `cpAddressToFoldersHref`/`cpAddressToItemViewHref`/`cpRouteSlugToParts`. All pass (`npx vitest run packages/dashboard/lib/cp-address/route-codec.test.ts`).

**Status: DONE**

# Task 2 — Canonical Folders URL

**Requested:** `/dashboard/folders/<address-slug>` as the source of truth for the current item; base route falls back to `localStorage` last-address then root; deep-link/refresh work from scratch; no dead history entry for the bare route.

**Done:** `packages/dashboard/app/(dashboard)/dashboard/folders/layout.tsx` holds the actual Folders component (see Task 8's note on why `page.tsx` couldn't hold it); `page.tsx`/`[slug]/page.tsx` are trivial leaves. `navigateToCpItem` is the single function every real identity change goes through: pushes the canonical URL, persists `lastAddress` (`lib/cp-address/last-address-store.ts`, scoped by `username`+`repoGuid` — not `repoGuid` alone, since `chad_shared`'s repoGuid is identical for every user). Base-route resolution: last-address → root, either way canonicalized via `router.replace` + the shared history's `notifyReplace()` opt-in so the bare route never becomes its own dead history step. An invalid/forbidden slug renders a controlled not-found state in place, never a silent fallback to a different item.

**Files changed:** `packages/dashboard/app/(dashboard)/dashboard/folders/{layout.tsx (new, moved from page.tsx),page.tsx (rewritten to a leaf),[slug]/page.tsx (rewritten to a leaf)}`, `lib/cp-address/last-address-store.ts` (new), `lib/local-storage-safe.ts` (new).

**Tested:** Live (Playwright, `test3`, local Docker, before the Knowledge-migration round — see Task 8): bare `/dashboard/folders` canonicalizes to root's slug; child click pushes a new distinct URL; refresh keeps the same URL; a fresh tab hitting a canonical slug directly shows the right item with no prior state; a fresh tab hitting the bare route restores the last-visited address; after deleting the last-address item, the bare route falls back to root without crashing. All passed.

**Status: DONE**

# Task 3 — Shared `DashboardHistoryProvider` rewrite

**Requested:** Real Back/Forward remembering 15-20+ steps, working across the whole dashboard (not just Folders), never confusing a fresh `A→B→A` navigation with a Back, branching drops stale forward, browser Back/Forward stays in sync.

**Done:** Extracted the state-transition logic into a pure function, `packages/dashboard/lib/dashboard-history-reducer.ts` (`applyHistoryUrlChange`), driven by two signals the provider observes: `wasPopState` (a native `popstate` listener — real session-history navigation, whether the browser's own buttons or the provider's own `goBack`/`goForward`, which now call `router.back()`/`router.forward()` instead of re-pushing a remembered URL) and `wasReplace` (an explicit `notifyReplace()` opt-in for same-identity canonicalization, used only by Folders' base-route redirect). Neither flag set = a genuinely new push, even if the URL happens to equal an existing stack entry (`A→B→A` records three entries, never mistaken for Back). `MAX_BACK` raised from 5 to 30. This provider already wraps the whole dashboard layout, so the fix applies everywhere, not just Folders.

**Files changed:** `packages/dashboard/lib/dashboard-history-reducer.ts` (new), `dashboard-history-reducer.test.ts` (new), `components/shared/dashboard-history-provider.tsx` (rewritten).

**Tested:** Unit — basic push/pop, `A→B→A` fresh-navigation-not-Back, branching drops stale forward, popstate resync when the URL isn't in the tracked window, `wasReplace` canonicalizes in place (both at index 0 and mid-stack), `MAX_BACK` cap. All pass. Live: browser Back after 3 real pushes returns to the exact expected URL each time (see Task 8's Folders smoke results); `nav-group.tsx` itself needed no changes (its "shared history first, else structural `upLevel`" logic was already correct).

**Status: DONE**

# Task 4 — CP-link is a real link

**Requested:** Right-click → "Open Link in New Tab", Cmd/Ctrl-click, middle-click all work natively — not a styled button with an `onClick` handler.

**Done:** `components/shared/cp-link-text.tsx` is now `<Link href="/dashboard/item-view/by-id/<uuid>" target="_blank" rel="noopener noreferrer">` — a real anchor known at render time (`href` never depends on a click-time fetch). Live clarification during the Story: plain left-click also opens a new tab by default now, not just right-click/Cmd-click — a CP-link is a side-reference, not meant to replace the current view.

**Files changed:** `components/shared/cp-link-text.tsx` (rewritten).

**Tested:** Live — `href` attribute inspected directly (`/dashboard/item-view/by-id/<uuid>`), `target="_blank"` confirmed, click opens a real new tab (via `context.waitForEvent("page")`), original tab confirmed unchanged afterward. All passed against the pre-Knowledge-migration build; the `href`/`target` assertions were re-run and passed again after the Knowledge migration (item-view-by-id route itself unchanged by that migration, only its downstream redirect target).

**Status: DONE**

# Task 5 — CP-link opens the correct view by target type

**Requested (live clarification, not in the original spec):** A CP-link to a Text item should open the earlier-built chrome-free single-item view; a CP-link to a Folder item should stay in Knowledge's own "nice" card-grid view, not the same single-item view and not the full Folders GUI.

**Done:** `/dashboard/item-view/by-id/[id]/page.tsx` (moved from `/dashboard/folders/by-id/[id]`) resolves the id via the pre-existing `resolveCpItemByIdForUser` (which already returns `type`) and redirects to `/dashboard/item-view/<slug>` for Text or `/dashboard/knowledge/<slug>` for Folder. `/dashboard/item-view/<slug>/page.tsx` (new) itself also redirects a Folder address there if reached directly (stale link after a Move, manual URL edit) — kept symmetric.

**Files changed:** `app/(dashboard)/dashboard/item-view/by-id/[id]/page.tsx` (new, moved+extended from the old Folders by-id route), `app/(dashboard)/dashboard/item-view/[slug]/page.tsx` (new), `app/(dashboard)/dashboard/folders/by-id/` (deleted).

**Tested:** Live — CP-link to `s120-b` (a Folder) opened `/dashboard/knowledge/<slug>` in the new tab, confirmed no Folders chrome (`Repo::` picker absent) in that tab. Direct navigation to a Text item's Item View URL confirmed: no Folders chrome, no `Address:`/`item-id:` header text, Preview/Editor toolbar visible.

**Status: DONE**

# Task 6 — Knowledge address mode + new-tab Text rows

**Requested (live clarification):** Knowledge's nice folder card-grid view should also be reachable by CP address (`/dashboard/knowledge/<address-slug>`), for any Folder item, not only ones under the Knowledge menu tree — while its existing name-slug browsing (menu tiles, `/dashboard/knowledge/<category>/<path>`) keeps working exactly as before. A Text row inside Knowledge should open in a new tab (clicking one used to navigate the whole browsing tab away from the grid).

**Done:** `[category]/[[...path]]/page.tsx` now detects whether `category` (with empty `path`) parses as a canonical CP address slug — if so, data comes from `/api/folders` instead of `/api/knowledge/...`, for any Folder address; a Text address redirects to Item View. A second Next.js route wasn't possible (`[[...path]]`'s catch-all already matches `/dashboard/knowledge/<anything>` with no further segments), so this is the same page/file gaining a second, additive mode — name mode's own code path is untouched. `/api/folders` gained an additive `ChildrenDetailed` field (`{index,name,type}[]`, alongside the pre-existing `Body` index→name map) so address-mode Knowledge can split folder-cards from loose-document rows without an extra request per child; `Body` itself, and every existing consumer of it, is unchanged. The Knowledge menu's own category tiles now link via `cpAddressToKnowledgeHref`, which needed `listKnowledgeCategories()` (`packages/dba/src/knowledge.ts`) to additively expose each category's `address` (Story 96 had deliberately never sent one to the client — no longer load-bearing now that addresses are already in URLs throughout the dashboard). `components/shared/knowledge-grid-row.tsx`'s Text rows now render `target="_blank"` (both modes); Folder rows/card titles stay same-tab.

**Files changed:** `app/(dashboard)/dashboard/knowledge/[category]/[[...path]]/page.tsx` (rewritten, address mode added), `app/(dashboard)/dashboard/knowledge/page.tsx` (tiles link via address), `components/shared/knowledge-grid-row.tsx` (new-tab for Text), `lib/cp-address/route-codec.ts` (`cpAddressToKnowledgeHref` added), `lib/folders-api.ts` (`ChildrenDetailed` added), `packages/dba/src/knowledge.ts` (`KnowledgeCategorySummary.address` added), `packages/dba/src/knowledge.test.ts` (5 `toEqual` assertions updated for the new field).

**Tested:** Unit — all 5 updated `listKnowledgeCategories` assertions pass with the new `address` field; full `packages/dba/src/knowledge.test.ts` suite (unrelated tests untouched) still passes. Typecheck clean; `next build` clean (no lint errors). **Not live-verified** — the local Docker rebuild carrying this migration is blocked; see Task 8.

**Status: DONE (code+unit-tested; live browser verification blocked, see Task 8)**

# Task 7 — Structural Wstecz/Naprzod stack

**Requested (live clarification):** The small arrows around Folders' GO button are NOT the same thing as the shared cross-page Back/Forward — they strip/restore one loca segment at a time (`14/07/02/01` → `14/07/02`), and repeated clicks (e.g. 5 back, then 5 forward) must retrace exactly, not just remember one step.

**Done:** `strippedLocaSegments: string[]` — Wstecz strips the current item's last loca segment and pushes it; Naprzod pops the most recent one and appends it back. A real undo/redo stack: N consecutive Wstecz clicks push N segments, N consecutive Naprzod clicks retrace them in order. No branching/clearing logic needed on Wstecz itself (a Naprzod always restores exactly the loca state a matching Wstecz produced, so a fresh Wstecz from there reproduces the same stack). Every step still goes through `navigateToCpItem`, so the canonical URL updates and the shared cross-page history observes it like any other navigation — this is an additional, independent control, not a second competing history.

**Files changed:** `app/(dashboard)/dashboard/folders/layout.tsx` (`strippedLocaSegments` state, `handleLocalBack`/`handleLocalForward`, restored Wstecz/Naprzod buttons in the toolbar).

**Tested:** Live — built a 3-level nested Folder chain, confirmed 3× Wstecz strips one segment at a time landing on the exact expected URL each step, then 3× Naprzod retraces the exact same 3 segments back down in order (stack, not a single slot).

**Status: DONE**

# Task 8 — Local Docker rebuild + live smoke test

**Requested:** Rebuild and restart the official local Mac Docker stack after code changes, then run a real browser smoke test against it — never just report success from typecheck/build/unit tests.

**Done (partial):** Ran `bash-scripts/dashboard/03_local_mac_docker/06_deploy.sh` repeatedly through the session; a Playwright script (`.runtime/story-120-smoke/smoke.mjs`, gitignored scratch, not a permanent regression file — the 4 fixed pillars under `tests/` weren't touched) drove `test3` through the full flow against the running local stack. This caught and fixed two real bugs before they'd have shipped:
1. A `page.tsx` re-export remounts on every `[slug]` change — silently wiped `strippedLocaSegments` (and would have wiped any other non-URL-derived state) on every single navigation. Root-cause fixed by moving the Folders component into `layout.tsx` (Next.js guarantees layouts stay mounted across navigation within the same subtree) — see Task 2/7.
2. `waitItemLoaded`'s "item-id: text visible" check could resolve on a stale, already-mounted element once the layout fix made the DOM persist across navigations — fixed with a short settle delay in the throwaway test script itself (not a product bug).

Confirmed live and PASSING (pre-Knowledge-migration build): canonical URL push/replace, browser Back/Forward, the 3-level Wstecz/Naprzod stack, CP-link real `href`+`target="_blank"`+hidden UUID, deep-link from a fresh tab, last-address restore in a fresh tab, refresh preserving the item, cleanup deletes landing on the correct parent.

**Blocked:** After building Task 5/6's changes (Knowledge address mode, Item View, type-based CP-link routing), the deploy script's `cp_1` SMB preflight failed — first STALE (needed sudo to recreate the mount point; the user added `CP1_SUDO_PASSWORD` to `.env.local`, which fixed that step), then the actual QNAP SMB login itself rejected the connection ("Authentication error") — a separate credential (`CP1_SMB_USER`/`CP1_SMB_PASSWORD` or `NAS_USER`/`NAS_PASSWORD`, or a Keychain entry) that isn't configured in this environment at all. `cp_1` is unrelated to this Story's actual functionality (Folders/Knowledge/Item View/CP-link are pure Postgres CP-item routing, no file storage) — it's the deploy script's own blanket preflight gate for every local-mac-docker deploy. Per the user's explicit choice, Docker verification was skipped for this final round rather than requesting further credentials. **The dashboard container is still running the pre-Knowledge-migration build** (image tag before `260813_215644`) — Task 5/6's changes are typecheck-clean, unit-tested, and `next build`-clean, but not yet live-browser-verified.

**Files changed:** none beyond the smoke script itself (`.runtime/story-120-smoke/smoke.mjs`, gitignored).

**Status: PARTIAL** — everything through Task 4/7 fully live-verified; Task 5/6 (the type-based CP-link routing + Knowledge address mode) verified by typecheck/unit-tests/build only, pending a Docker redeploy once `cp_1` is reachable.
