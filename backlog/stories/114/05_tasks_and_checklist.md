# Story 114 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE      |             | Add "Examples" to the sidebar under Others, opening a Msg-Auto-style hub |
| 2 | DONE      |             | Examples hub has a "Knowledge v1" tile → frozen mock snapshot of Knowledge's pre-v2 look |
| 3 | DONE      |             | Knowledge (`/dashboard/knowledge/[category]`) uses an intelligent up-to-3-column layout instead of the fixed 2-column grid, still on real data |
| 4 | DONE      |             | Long section/document names wrap; a single unbreakable token gets local ‹ › shift instead of horizontal scroll |
| 5 | DONE      |             | A card shows every item in full up to 10; only above 10 does it cap to 10 visible rows + its own vertical scrollbar (per-card, no averaging with neighbors) |
| 6 | DONE      |             | Cards are not stretched to match their row-mates' height — a short card just ends where its own content ends, titles across columns don't have to line up |
| 7 | DONE      |             | Every document/folder row and folder title is a real link — opens in a new tab via ctrl/cmd-click, middle-click, or right-click → "Open in new tab", same as any other link in the app |

# Task 1 — Examples hub + Knowledge v1

**Requested:** New sidebar entry "Examples" under Others, opening a hub in the same pattern as Msg Auto, with one tile "Knowledge v1" that freezes the Knowledge category view's pre-redesign look on local mock data (no `/api/knowledge` fetch, no `chad_shared` reads, no DBA/backend of its own).

**Done:** Added `Examples` to `sidebarGroups` (Others group) in `sidebar.tsx` with a `FlaskConical` icon and `activePrefixes: ["/dashboard/examples"]`. Added `/dashboard/examples/page.tsx` (hub, `DashboardPageShell` + `grid-cols-4` button grid, one "KNOWLEDGE V1" tile — same recipe as `msg-automation/page.tsx`). Added `/dashboard/examples/knowledge-v1/page.tsx`: a self-contained page with a local mock array of sections with varying item counts (1, 5, 3, 8 items + 2 loose documents), rendered with the exact pre-Story-114 markup/classes (`grid-cols-1 md:grid-cols-2`, `truncate`, `LIST_ROW_WRAPPER_CLASS`/`LIST_ROW_CLASS`, no height cap) — deliberately duplicated rather than imported from the production page, so later changes to production Knowledge can't alter this frozen reference.

**Files changed:** `packages/dashboard/components/shared/sidebar.tsx`, `packages/dashboard/app/(dashboard)/dashboard/examples/page.tsx` (new), `packages/dashboard/app/(dashboard)/dashboard/examples/knowledge-v1/page.tsx` (new), `human-docs/dashboard/examples/features/examples-hub.md` (new).

**Tested:** `tsc --noEmit` clean for these files; `next lint` clean for these files. Manual smoke pending (see report).

**Status: DONE**

# Task 2 — Knowledge v2 intelligent grid layout

**Requested:** Rebuild only the arrangement algorithm of the production Knowledge folder view (`/dashboard/knowledge/[category]/[[...path]]`) per the accepted mockup (`examples/knowledge_v2_clean_no_debug_mockup.html`): up to 3 columns chosen by real fit (no fixed breakpoints), each column with its own width from a per-column text-length heuristic, normal long names wrap, a single unbreakable token gets local ‹ › shift instead of horizontal scroll, card height capped to ~5 (or ~8 when every card in the row is large) visible rows with the rest scrollable — while keeping colors/borders/radius/icons/typography/`DashboardPageShell`/Back-Forw/up-level/document-click-flow/data source unchanged.

**Done:**
- `packages/dashboard/lib/knowledge-layout.ts` — pure, DOM-free algorithm (`charTargetForTexts`, `widthForChars`, `chooseColumnsAndWidths`, `targetForRow`, `computeRowCaps`, `hasUnbreakableToken`), named params (`maxColumns`, `maxColumnWidthPx`, `widthReserveRatio`, `normalRowCap`, `allLargeRowCap`, `largeRowThreshold`, `gapPx` matching the project's real `FRAME_SECTION_GAP_CLASS` 10px token, `unbreakableWordCharThreshold`), ported from the mockup's decisions.
- `packages/dashboard/lib/knowledge-layout.test.ts` — 25 unit tests covering the width-clamp math, the 3→2→1 column fit, the spec's own worked examples (`[1,5]→3`, `[1,1,5]→3`, all-large→cap 8), per-card row caps, and the unbreakable-token threshold.
- `packages/dashboard/components/shared/use-knowledge-grid-layout.ts` — DOM half: `ResizeObserver` on the grid container + a hidden probe-span measurement (inherits the grid's real font), feeding the pure functions above.
- `packages/dashboard/components/shared/knowledge-grid-row.tsx` — one grid row: normal names wrap in a real `<button>`; an unbreakable-token name renders as a `div[role=button]` (keyboard-accessible) so its own nested ‹ › `<button>`s stay valid HTML, shifting only that row's own text via `translateX`.
- `packages/dashboard/app/(dashboard)/dashboard/knowledge/[category]/[[...path]]/page.tsx` — `KnowledgeFolderGrid` replaces the fixed `grid-cols-1 md:grid-cols-2` + `KnowledgeCardGrid`; same `LIST_ROW_WRAPPER_CLASS` cards, same Folder/Text icons (now inside `KnowledgeGridRow`), same click handlers/routing/`DashboardPageShell`/`upLevel` — only the arrangement changed. Cards exceeding their row's cap get `overflow-y-auto` + `maxHeight`.
- Docs: `human-docs/dashboard/knowledge/features/knowledge-cp-items.md` updated with an "Update" section describing the catch-all routing (pre-existing, undocumented until now) and the Story 114 layout.

**Files changed:** `packages/dashboard/lib/knowledge-layout.ts` (new), `packages/dashboard/lib/knowledge-layout.test.ts` (new), `packages/dashboard/components/shared/use-knowledge-grid-layout.ts` (new), `packages/dashboard/components/shared/knowledge-grid-row.tsx` (new), `packages/dashboard/app/(dashboard)/dashboard/knowledge/[category]/[[...path]]/page.tsx`, `vitest.config.mjs` (registered the new test file), `human-docs/dashboard/knowledge/features/knowledge-cp-items.md`.

**Tested:**
- `vitest run packages/dashboard/lib/knowledge-layout.test.ts` — 25/25 pass.
- `vitest run packages/dashboard` (full dashboard subset, 21 files) — 122/122 pass, no regressions.
- `tsc --noEmit` — no new errors (2 pre-existing unrelated errors in Story 113's in-progress `dates-reports` DBA exports).
- `next lint` on changed files — clean (one pre-existing warning on an untouched `useEffect`).
- Local Docker rebuild (`02_build.sh`) + restart (`03_re-start.sh`) + `05_status.sh` — all 3 containers healthy, dashboard responding on :12020 (one unrelated pre-existing script error during restart — see `06_others_from_report.md`).
- Manual smoke via Playwright against the running local stack, logged in as `test3`: sidebar "Examples" under Others → hub (Msg-Auto-pattern) → "Knowledge v1" renders the frozen fixed-2-column/no-cap/`truncate` look on local mocks only (no `/api/knowledge` request observed). Real `/dashboard/knowledge/verbal-game` (6 real cards × 4 items, real `chad_shared` data): at 1900px width → 3 columns (`400px 400px 400px`), cards positioned in a 3×2 top-left-anchored grid via `getBoundingClientRect()`; at 1300/1000px → 2 columns; at 700/500px → 1 column (306px, not stretched to viewport); at every width `document.documentElement.scrollWidth === clientWidth` (no global horizontal scroll). Nested catch-all routing verified by drilling into `Deep Test Category → L1 → L2` (URL `/dashboard/knowledge/deep-test-category/l1/l2`). Console clean of new errors across every page visited (only a pre-existing unrelated `site.webmanifest` 404 present since before this Story). Height-cap/scroll for a large (~25-item) section verified via unit tests + code inspection only — no real category currently has that many items (disclosed in `06_others_from_report.md`, not fabricated into `chad_shared`).

**Status: DONE**

# Task 3 — Simplify height rule to a flat per-card threshold; drop cross-column height stretch

**Requested (follow-up, Polish, verbatim intent):** "w sumie bym jednak zmienil te zasady ze w pionie niech one sie wszyskie wyswietlaja a dopiero od duzej ilosci powyzej 10 niech pojawia sie scroll bar i nie musze byc horyzontalnie tytuly na tych samych poziomach miedzy kolumnami" — replace the row-averaging height cap (ceil-average of a visual row's item counts, ~5/~8 cap, "last row stays uncapped") with a flat rule: every card shows all its items; only once a single card's own count goes above 10 does it cap to 10 visible rows with its own scrollbar. Also: cards no longer need to be the same height as their row-mates, so titles across columns don't have to sit on the same line.

**Done:**
- `packages/dashboard/lib/knowledge-layout.ts` — removed `targetForRow` entirely and the `normalRowCap`/`allLargeRowCap`/`largeRowThreshold` params (and the earlier "last visual row stays uncapped" special case that had briefly existed between the initial Task 2 commit and this follow-up). Replaced with one param, `maxVisibleRowsBeforeScroll: 10`, and a one-line `computeRowCaps(cardCounts, params)`: `count > threshold ? threshold : null` — purely per-card, no grouping into visual rows, no dependency on neighbors or column count.
- `packages/dashboard/components/shared/use-knowledge-grid-layout.ts` — `computeRowCaps` call updated to the new 2-arg signature (dropped `cols`, no longer needed).
- `packages/dashboard/app/(dashboard)/dashboard/knowledge/[category]/[[...path]]/page.tsx` — grid container gained `items-start` (was relying on the CSS Grid default `align-items: stretch`, which silently forced every card in a row to the tallest card's height — confirmed live via `getComputedStyle(grid).alignItems` going from `"normal"` (resolves to stretch) to `"flex-start"` after the fix).
- `packages/dashboard/lib/knowledge-layout.test.ts` — removed the `targetForRow` describe block and the old row-grouping `computeRowCaps` tests; replaced with 3 tests for the flat per-card rule (≤10 uncapped, >10 capped to 10, independent of neighbors).
- Docs: `human-docs/dashboard/knowledge/features/knowledge-cp-items.md` "Update" section rewritten to describe the flat threshold + `items-start` instead of the retired row-averaging rule.

**Files changed:** `packages/dashboard/lib/knowledge-layout.ts`, `packages/dashboard/lib/knowledge-layout.test.ts`, `packages/dashboard/components/shared/use-knowledge-grid-layout.ts`, `packages/dashboard/app/(dashboard)/dashboard/knowledge/[category]/[[...path]]/page.tsx`, `human-docs/dashboard/knowledge/features/knowledge-cp-items.md`.

**Tested:** `tsc --noEmit` — no new errors. `next lint` on changed files — clean. `vitest run packages/dashboard` — 21/21 files, 117/117 tests pass (5 fewer than before — the removed `targetForRow` tests). Manual Playwright smoke against a Docker-rebuilt local stack (see stale-cache note below): `/dashboard/knowledge/verbal-game` grid className confirmed `items-start` present, `getComputedStyle(grid).alignItems === "flex-start"`. Real cards here all have 4 items (≤10), so the >10 cap itself is verified via unit tests only, same disclosed gap as Task 2 (no real category has >10 items yet).

**Status: DONE**

# Task 4 — Open document/folder in a new tab

**Requested (follow-up):** "dodaj jeszcze mozliwosc klikniecia w knowledge na dany dokument z listy i zeby mogl otworzyc w nowej karcie i tak samo folder" — clicking a document or folder in the Knowledge grid should support opening it in a new browser tab, same as any normal link.

**Done:** The row/title elements were `<button onClick={() => router.push(...)}>`, which has no `href` and therefore no native "open in new tab" (ctrl/cmd-click, middle-click, right-click context menu) — buttons never get that browser behavior. Converted both to real `next/link` `<Link href>`:
- `packages/dashboard/components/shared/knowledge-grid-row.tsx` — `KnowledgeGridRow` now takes `href` instead of `onClick` and renders a `<Link>`. The unbreakable-token case needed restructuring: a `<button>` (the ‹ › shift controls) cannot nest inside an `<a>` (invalid HTML, same constraint as the earlier button-in-button fix), so that variant now wraps the `<Link>` around only the icon+label, with the shift buttons as siblings in a plain wrapper `<div>` — simpler than the old `div[role=button]` + `stopPropagation` scheme it replaces, since the buttons are no longer nested inside anything interactive.
- `packages/dashboard/app/(dashboard)/dashboard/knowledge/[category]/[[...path]]/page.tsx` — folder title switched from `<button onClick>` to `<Link href>`; `KnowledgeFolderGrid` now takes `categorySlug`/`pathSlugs` instead of the three `onLooseRowClick`/`onCardTitleClick`/`onCardRowClick` callbacks and computes each row's/title's `href` directly via the existing `knowledgePageHref` helper. `useRouter`/`router` removed from the page entirely (no longer used anywhere in it).
- Normal left-click still navigates client-side exactly as before (Next `<Link>` behaves like `router.push` for a plain click) — this is additive, not a behavior change for the common case.

**Files changed:** `packages/dashboard/components/shared/knowledge-grid-row.tsx`, `packages/dashboard/app/(dashboard)/dashboard/knowledge/[category]/[[...path]]/page.tsx`.

**Tested:** `tsc --noEmit` — no new errors. `next lint` — clean. `vitest run packages/dashboard` — 117/117 pass. Manual Playwright smoke on the Docker-rebuilt local stack: confirmed both the folder title and a document row render as real `<a href>` elements with correct hrefs (`getAttribute('href')`/accessibility-tree `link` role, e.g. `/dashboard/knowledge/verbal-game/podstawy-rozmowy` and `.../jak-rozwijac-temat-zamiast-go-ucinac`); plain click still navigates correctly (URL changes, folder contents / document editor load as expected) — did not separately automate a literal ctrl-click/new-tab-open in Playwright, but a real `<a href>` getting that behavior is native browser behavior, not application logic, so verifying the element is a genuine anchor with the correct href is the meaningful check here.

**Status: DONE**

## Note — stale Docker build cache hit during this follow-up

Between the Task 2 commit and starting Task 3/4, a normal `02_build.sh` (cached) build silently produced an image that still contained the OLD `normalRowCap`/pre-`items-start` code, verified by grepping the compiled bundle inside the running container (`docker exec ... grep normalRowCap ...` matched; `maxVisibleRowsBeforeScroll` did not, and the rendered grid's `className` was missing `items-start`) even though the build log reported success and a new image tag. Manually running `docker compose build --no-cache` (reusing the same `01_config.sh` env/tag-writing exactly, just adding the flag) produced a correctly up-to-date image both times it was needed. Root cause not fully diagnosed (Docker layer cache vs. Docker Desktop's host↔VM file sync); flagging here rather than silently trusting a green "Image built" log — **anyone continuing Docker-based verification on this stack should sanity-check the compiled output matches current source, or just default to `--no-cache`, until this is root-caused.** Did not modify `02_build.sh` itself (deployment tooling change, out of scope for this GUI Story).
