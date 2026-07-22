# Google Sheets sync — AI start

Status: created Story 75 (2026-07-21) — the Daily Tracker → Google Sheets
export/sync integration. New specialization folder under `ai-docs/` (no
prior Google Sheets/export/queue documentation existed in the repo before
this Story — confirmed by search before creating this). Revised twice more
the same day (2026-07-21): (1) one spreadsheet **per user** (not a single
shared one) and the worker now actually runs, inside the Dashboard process
— `architecture.md` §0b; (2) the "daily"/"dates" tabs are now visually laid
out (column groups, colors, widths, frozen panes, hidden CHAD_* columns,
filters, light data validation) to actually look like the Dashboard's own
tables, not just contain the same data — `architecture.md` §0c/§11,
including a real incident (a formatting bug briefly clobbered the real
header row on both live spreadsheets, caught the same session, fixed, both
spreadsheets repaired — no real personal data was affected, see §0c).

Mirrors `ai-docs/beeper/`'s structure (an `ai-start.md` index + a technical
`architecture.md`) — this is global AI knowledge about a cross-cutting
integration, not a per-feature Dashboard-tab doc (those live under
`human-docs/dashboard/<tab>/features/`).

## Read this first, then

[`architecture.md`](architecture.md) — the full technical design: which
`dba` functions trigger a sync, the outbox job shape, the sheet's column
mapping and schema-evolution rules, the service-account auth flow, env var
reference, and current limitations/what's explicitly out of scope.

## One-line summary

`packages/dba/src/leads.ts`'s `saveDailyEntry`/`updateDailyEntry`/
`deleteDailyEntry`/`saveDateEntry`/`updateDateEntry` each resolve the
acting user's own spreadsheet (`GOOGLE_SHEETS_SPREADSHEET_MAP`, one per
CHAD username — never a single shared spreadsheet) and enqueue a durable
outbox job (`packages/dba/src/google-sheets/outbox.ts`, Mongo collection
`google_sheets_sync_outbox`) when `GOOGLE_SHEETS_ENABLED=true`; a worker
(`packages/dba/src/google-sheets/worker.ts`, started by `bootstrap.ts`)
drains that outbox and writes rows into each user's own Google Sheet via a
shared service account (`packages/dba/src/google-sheets/sheets-api-client.ts`).
Disabled by default. The worker runs as a background interval loop inside
the already-running Dashboard Next.js process
(`packages/dashboard/instrumentation.ts`) — no separate container. Dashboard
itself still has zero knowledge of Sheets internals — it only ever calls the
five `dba` functions above, same as before this Story; `instrumentation.ts`
is the one exception, a single opaque bootstrap call at server startup.

## Where the Story that built this lives

`backlog/stories/75/` — full input, plan (including why this is a parallel
outbox rather than a reuse of `data-outbox.ts`'s types), knowledge, and the
task checklist/report.

## Read the global entry point first if you haven't

If you're arriving here without having read
[`ai-docs/begin_here/01_ai_start.md`](../begin_here/01_ai_start.md) yet, read
that first — this folder is a specialization, not a replacement for the
global reading order.
