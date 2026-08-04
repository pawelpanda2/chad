# Story 102 — Plan

## Approach

1. **DBA** — shared `listReportCategories` / `listReportsInCategory` / display-name strip `^\d+\s+` over root logical folder `reports` via `resolveByNames` + `getChildrenOf` (Folder → categories, Text → reports).
2. **API** — thin authenticated routes under `/api/reports/…` reused by Views Reports and Creator.
3. **Views Reports** — category combobox + client search + Text-item list; open/edit by loca as today.
4. **Creator Auto** — compact two-line Conversation + Report; Change / Your Pick opens report picker; `userReport` vs `autoReport`; `effectiveReportAddress = user ?? auto`.
5. Tests + local Docker rebuild; commit Story 102 only (no folders WIP).
