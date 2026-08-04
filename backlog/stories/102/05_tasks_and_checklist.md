# Story 102 — Tasks and checklist

## Checklist

| # | Task | Real Status |
|---|------|-------------|
| 1 | DBA: categories + reports-by-category + prefix strip | PASS unit |
| 2 | Thin API `/api/reports/categories` + `/api/reports` + `/item` | implemented |
| 3 | Views Reports: combobox + search + text list | implemented |
| 4 | Creator Auto: compact Conv/Report + picker + effectiveReport | PASS unit |
| 5 | Tests, build, local Docker smoke, commit | PASS unit + build + local Docker; commit `03eaff6` |

## Task write-ups

### 1. DBA report categories

`packages/dba/src/report-browse.ts`: `listReportCategories`, `listReportsInCategory`, `getReportTextByAddress`, `reportCategoryDisplayName` (`^\d+\s+`), `effectiveReportAddress`. Missing `reports` → `[]`.

### 2. API

Session + `runWithRepoContext`; shared by Views and Creator.

### 3. Views Reports

Category combobox from root `reports` Folders; Text list + client search; body loaded on open via `/api/reports/item`.

### 4. Creator Auto

Two-line Conversation/Report; Change opens pickers; `userReport` vs `autoReport`; Send/preview use `effectiveReportAddress`.
