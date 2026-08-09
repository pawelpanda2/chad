# Story 114 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE      |             | Add "Examples" to the sidebar under Others, opening a Msg-Auto-style hub |
| 2 | DONE      |             | Examples hub has a "Knowledge v1" tile → frozen mock snapshot of Knowledge's pre-v2 look |
| 3 | DONE      |             | Knowledge (`/dashboard/knowledge/[category]`) uses an intelligent up-to-3-column layout instead of the fixed 2-column grid, still on real data |
| 4 | DONE      |             | Long section/document names wrap; a single unbreakable token gets local ‹ › shift instead of horizontal scroll |
| 5 | DONE      |             | Cards with many items get a capped height + vertical scrollbar instead of growing unbounded |

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
