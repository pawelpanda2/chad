# Story 53 — 06_propositions.md

Curated, final list of follow-up proposals from Story 53 — promoted out of
`04_todos.md` (now empty, per the Story standard) rather than left sitting
in a scratchpad. None of these block Story 53's completion.

## 1. Remove dead date/daily functions from `cp-flow.ts`

`getDateEntryRecords`, `getDailyEntryRecords`, `saveDateEntryForm`,
`saveDailyEntryForm` (in `packages/dashboard/app/api/flow/cp-flow.ts`)
aren't imported anywhere in the repo — a dead, duplicate reimplementation
of what `leads.ts` already does live. Story 53 only updated their
`actions`→`views` literals (to avoid a mixed model in the text), without
removing or refactoring them. Proposal: delete these four functions in a
dedicated, separate Story.

## 2. Backfill naming for reports created before Story 53

The two reports that existed under `views/reports` before Story 53 (`01`,
`02`) keep their old, purely sequential physical names — the new
`{YY-MM-DD}_{kind}_{suffix}` scheme only applies to reports created from
now on. Proposal: decide whether these should be renamed for consistency,
and if so, how to reconstruct a plausible date/kind/suffix for them
(their content would need to be reviewed manually).

## 3. `views/daily` (DAILY ENTRY) naming scheme

The user noticed (2026-07-14, during Story 53 Part 1) that entries under
`views/daily` are still named in date+letter format (`26-07-10`,
`26-07-10b`, ...), per `documentation/dashboard/views/features/views.md`
("Item Naming"). Request: change this to plain sequential numbers (`01`,
`02`, `03`, ...), matching the convention other views/entries use.
Out of scope for both Story 53 Part 1 (a pure path migration) and Part 2
(the Reports form) — proposal for a dedicated follow-up Story.

## 4. `PreviewContent`/`HeadersRenderer` shows "Empty content" for plain text without headers

Found during the Story 53 browser click-through (2026-07-14):
`groupNodes()` in
`packages/dashboard/components/shared/headers-renderer.tsx` only creates a
renderable group when it encounters a level-0 "header" line — plain free
text with no header line never lands in any group, so the shared renderer
shows the "Empty content" placeholder even though the Content Provider and
the API response genuinely contain the text (directly verified: a
`GetItem` call to the Content Provider and the raw JSON from
`/api/views/reports` both show the full body). This affects both the
Reports editor's own Preview tab and the Reports view — it predates Story
53 (a shared component, untouched by this Story) and is not a regression
from the migration or the form rebuild. Proposal: decide whether Reports
should enforce a minimal header, or whether `PreviewContent` should fall
back to rendering plain text when no headers are found.

## 5. Leftover test reports in the local Content Provider

Three test reports remain in the local Content Provider's data (repo
`21d11bdc-f1f4-44d1-b61a-3fa6b039c641`, `views/reports`):
`26-07-14_dg_verify story 53 test`, `26-07-14_dg_verify story 53 testb`
(from direct `dba`-layer verification), and `26-07-20_op_browser
click-through test` (from the browser click-through). The Content
Provider has no delete operation (`DeleteWorker.Delete` is a stub, see
`documentation/dba/features/report-entries.md`), so these couldn't be
cleaned up after testing — they remain as harmless test data in the local
environment. Proposal: if a delete operation is ever added to the Content
Provider, use it to remove these three items.
