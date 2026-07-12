# views/reports — dba layer

## Cel

Data-access layer for the "Reports" feature: free-text reports saved as
Text items under the logical path `views / reports` (a Folder), one
report per child item.

## Zakres

`packages/dba/src/report-entries.ts` (renamed from `actions-reports.ts` in
Story 53 — the physical/logical CP path moved from `actions/reports` to
`views/reports`, and the filename was chosen to describe the module's
responsibility rather than that path; `reports.ts` was unavailable, see
below). Used by the dashboard's Reports form (create/update) and Reports
view (list/read). Does NOT touch the pre-existing, unrelated root-level
`reports` folder (`GetReports`/`GetReportByName` in `reports.ts`) —
confirmed via real Content Provider data that this older folder already
holds unrelated report notes at repo root address `.../02`. The two must
never be merged (and this is exactly why this file isn't named
`reports.ts`).

## Zmienione pliki

- `packages/dba/src/report-entries.ts` (renamed from `actions-reports.ts`)
- `packages/dba/src/index.ts` (export updated to match)

## Route/API

Consumed by:
- `POST /api/forms/reports` (create/update)
- `GET /api/views/reports` (list, each entry includes its full body)

## Przepływ danych

Resolves the folder via the mandated call:

```
["IRepoService", "IItemWorker", "GetByNames2", repoId, "", "views", "reports"]
```

Confirmed against the real local Content Provider (repo
`21d11bdc-f1f4-44d1-b61a-3fa6b039c641`, 2026-07-14): the top-level `actions`
folder was manually renamed to `views` by the repo owner outside this
feature; `views/reports` now lives at address `.../07/04`. Real response
shape:

```json
{ "Body": { "01": "01", "02": "02" }, "Settings": { "type": "Folder", "name": "reports", "address": "21d11bdc-.../07/04" } }
```

Children are read from `Body` as `physicalKey -> logicalName` (never from a
`Children` field), and each child's numeric loca is built as
`${reportsLoca}/${physicalKey}` — the same proven approach as
`getAllDateEntries`/`getAllDailyEntries` in `leads.ts`.

**Create** (`createReportEntry(content, requestedName)`):
1. Resolve views/reports folder (falls back to `PostParentItem`-based
   ensure-folder-exists chain — root -> "views" -> "reports" — only if
   `GetByNames2` reports not-found; this is a fresh-repo fallback, not the
   primary path).
2. Resolve a collision-free name from `requestedName` (the Reports form's
   generated name, e.g. `26-05-06_dg_galeria mokotów`) via
   `nextAvailableName`: used as-is unless a report with that exact name
   already exists, in which case `b`, `c`, ... is appended — the same
   same-day-collision convention documented in `views.md`. (Since Story
   53's form rewrite, the item name is caller-supplied and meaningful —
   before that it was purely sequential `"01"`, `"02"`, ... via the shared
   `generateEntryName` helper, which `dates`/`daily` still use.)
3. `PostParentItem(repoId, reportsLoca, "Text", reportName)` — called
   exactly once per report.
4. `Put(repoId, reportLoca, "Text", reportName, content)`. If this fails
   after step 3 succeeded, the thrown error names the created item's
   loca/name explicitly — callers must not report success.

**Update** (`updateReportEntry`): `GetItem` to read the current
`Settings.type`/`Settings.name`, then `Put` to the same loca — never
`PostParentItem` (per the required update flow; avoids the
find-or-create ambiguity if two saves happened to generate the same name).

**List** (`getAllReportEntries`): walks the folder's `Body` map, and for
each child, `GetItem` to fetch its own body.

## Zależność od Content Providera

Fully hidden behind `IRepoService`/`IItemWorker` calls
(`GetByNames2`, `GetItem`, `PostParentItem`, `Put`). Physical folders are
numeric; the caller only ever passes/receives numeric loca resolved from
`Settings.address`, never a hand-built path.

## Cache/invalidation

No cache. Every call hits the Content Provider directly.

## Edge cases

- **views/reports not found** (fresh repo, never created): `getAllReportEntries`
  throws explicitly (`"views/reports folder not found"`) rather than
  returning `[]` — the API route surfaces this as `success:false`, never
  masked as an empty list. `createReportEntry` instead falls back to
  creating the "views"/"reports" folders via `PostParentItem`.
- **Not-found vs. real CP failure**: distinguished by
  `invokeContentProvider` throwing the specific `"Empty response body
  from /invoke"` message for not-found paths (confirmed via curl: HTTP 200,
  `Content-Length: 0`) vs. other error messages for timeouts/non-2xx/bad
  JSON, which are never treated as "not found".
- **PostParentItem succeeds, Put fails**: surfaced as an explicit error
  naming the created item, not a silent/false success.
- **Same requested name twice** (e.g. two reports with the same date/kind/
  suffix): resolved via `nextAvailableName`'s `b`/`c`/... suffixing, not a
  silent overwrite — without this, `PostParentItem`'s find-or-create
  semantics would resolve to the same existing item.

## Ograniczenia

- No delete operation exists in the Content Provider
  (`DeleteWorker.Delete` is a stub) — a created report can only be
  overwritten, never removed.
- The two reports that existed before Story 53 (`"01"`, `"02"`) keep their
  old sequential names — the new `{YY-MM-DD}_{kind}_{suffix}` scheme only
  applies to reports created from now on (no backfill/rename attempted).

## Dalsze etapy

None planned as part of Story 53. A future "edit an existing saved
report from the Reports view" feature (currently the view is read-only)
would reuse `updateReportEntry` unchanged.
