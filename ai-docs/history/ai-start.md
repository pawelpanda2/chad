# History (Change Streams / `cp_history`) — AI start

Status: created 2026-07-22 — this folder existed with only `how-it-works.md`
and no `ai-start.md` index, unlike every other `ai-docs/` specialization
folder (`beeper/`, `google-sheets/`, `deploy/`, ...). Added now to match
that convention, per direct instruction — no content changes to
`how-it-works.md` itself.

## Read this first, then

[`how-it-works.md`](how-it-works.md) — the full technical design: the
Change Streams pipeline (`cp_items` → `history-worker` → `cp_history`),
why `rs0` is required, resume-token/idempotency guarantees, actor
attribution, the "no pre-images on Mongo 4.4" constraint and how the
worker works around it, repo isolation, and rollback.

## One-line summary

Every write to `chad.cp_items` (via `packages/dba`'s `data-router.ts` ->
`MongoCpProvider`) is picked up by `packages/history-worker` (an
independent process/container, watching `cp_items` via a MongoDB Change
Stream on the `rs0` replica set) and written as one `chad.cp_history`
document per change — durable resume token in `chad.cp_history_state`, so
a worker restart resumes instead of starting fresh. The Dashboard's
History menu (`packages/dashboard/app/(dashboard)/dashboard/history/page.tsx`)
reads this via `packages/dba/src/cp-history.ts` and its
`/api/content-provider/{history,daily-history,dates-history}` routes —
never a hardcoded address, always resolved through the same
`getByNames({repoGuid, names: [...]})` lookup the real save/read path uses.

## What's in the History menu today (2026-07-22)

Two button rows: **All Items** + **Google Sheets** (link to the current
user's own spreadsheet, CHAD login, test-account credentials if
configured, service-account address — see
`ai-docs/google-sheets/architecture.md`), separated by a light divider
from **Daily Tracker** + **Dates** (mirrors the order of Views' own
buttons) — each a change-history view scoped to that folder's resolved
address prefix. "Google Sheets" is a link/info page, not itself a
change-history view — it doesn't go through `cp-history.ts`.

## Relationship to Beeper's own history/oplog concept

Not the same system. `packages/beeper-oplog` normalizes raw Beeper events
into `contacts`/`channels`/`messages` (a data-transformation pipeline, not
an audit trail) and lives in `beeper_<repoGuid>` databases, physically
separate from `chad.cp_history` since Story 76's Mongo split (see
`ai-docs/deploy/2026-07-22_mongodb-chad-beeper-split.md`). See
`ai-docs/beeper/ai-start.md` for that system.

## Where the Story that built this lives

`backlog/stories/74/` — full input, root-cause investigation, and what was
built. `backlog/stories/76/` — the physical Mongo split that this system's
replica-set requirement (`rs0`) depends on staying on `chad-mongodb`
specifically (never `beeper-mongodb`, which is deliberately standalone).

## Read the global entry point first if you haven't

If you're arriving here without having read
[`ai-docs/begin_here/01_ai_start.md`](../begin_here/01_ai_start.md) yet, read
that first — this folder is a specialization, not a replacement for the
global reading order.
