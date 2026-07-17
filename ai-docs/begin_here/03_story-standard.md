# Story documentation standard

This file is the single source of truth for how work on this repo is
organized into numbered **Stories**. Read this once; individual story
folders (`backlog/stories/<N>/`) do not repeat these rules.

**Location note (Story 62, 2026-07-16):** the story folders live at
`backlog/stories/<N>/` (repo root), not `documentation/stories/<N>/`. The
user moved them into a new top-level `backlog/` folder; this file and
`02_what-and-where.md` were updated to match. Stories 53–56's own file
contents still say `documentation/stories/...` in places — that's a
historical record of paths at the time and was intentionally left
unchanged (see the Story-standard rule against rewriting other Stories'
history).

**Second location note (Story 62, same day):** the folder this very file
lives in was also renamed, from `documentation/ai-docs/knowledge/` to
`documentation/ai-docs/begin_here/` — file names/numbering (`01_ai_start.md`
… `04_deployment-rules.md`) and content unchanged, only the containing
directory's name changed. All forward-looking docs were updated to the new
path; historical Story content citing the old `.../knowledge/...` path was
left as-is for the same reason as above.

## What is a Story

A Story is the whole unit of work behind one user task — not a single
"feature". It can include a new feature, a migration, fixes to an existing
feature, changes across several layers of the project, tests, documentation
updates, and consciously-deferred follow-up items. Every Story gets the
next sequential number (53, 54, 55, ...).

## When a Story gets created — and by whom

**This is the step that gets skipped most often. Read it as literally as
the Checklist rule below.**

Creating the Story folder is not something the user asks for by name, and
it is not a ceremony reserved for large, obviously-multi-day efforts. It is
the *default* way any non-trivial task on this repo gets recorded, and the
AI agent doing the task is the one who creates it — proactively, without
being asked, as close to the very first action of the task as possible.
Concretely: as soon as you understand what the user is asking for well
enough to start working, create `backlog/stories/<next-N>/` and write
`01_input.md` with their request verbatim, **before** you start reading
code, editing files, or running commands — not after you're done, and not
only if the task "feels big enough" in the moment. If the task goes through
Plan Mode, the presented plan becomes `02_plan.md` and this happens
naturally at the same point; if it doesn't go through Plan Mode, create
`01_input.md` yourself as the first step anyway.

**"Non-trivial" — how to actually decide:**

- Gets a Story: anything that touches more than one file, anything with a
  real decision to make (naming, sequencing, trade-offs), anything that
  gets tested/verified, anything spanning more than a few tool calls,
  anything the user might reasonably want to look back on later ("why did
  we do it this way?"). When genuinely unsure, create one — an
  over-documented small task costs almost nothing; an undocumented real
  task is unrecoverable history.
- Skips a Story: a single trivial read-only question ("what does this
  function do?"), a one-line typo/formatting fix with no decisions
  attached, a pure lookup with zero file changes.

Concrete failure this section exists to prevent: a Story-sized task (new
script, renumbered sibling files, changed shared library behavior,
integration changes across two other scripts, six tested scenarios) was
completed start-to-finish with no Story folder at all, because the request
was a fully-specified, detailed spec rather than an open-ended ask — which
made it *feel* like "just implement this," not "plan and record this." Task
shape (detailed spec vs. open question) is not a signal for whether a Story
is warranted; the criteria above are.

**If you notice mid-task (or after finishing) that you skipped this:**
create the Story folder immediately, right then — don't finish skipping it.
Backfill `01_input.md` with the actual verbatim conversation history
reconstructed as faithfully as possible, note plainly in `03_knowledge.md`
or `05_tasks_and_checklist.md` that the Story was created retroactively and
why, and proceed with the remaining files normally. A late Story is far better than
no Story.

## Directory naming — numeric only

```text
backlog/stories/
    56/
        01_input.md
        02_plan.md
        03_knowledge.md
        04_todos.md
        05_tasks_and_checklist.md
        06_others_from_report.md
```

**2026-07-14 (Story 56 — this file structure went through three
corrections in one session; only the final one below matters going
forward, the rest is history so nobody repeats the intermediate
mistakes):**

1. Original: a single `05_report.md` — Checklist as its opening section,
   Task write-ups below.
2. First correction: split into a Checklist-only `05_tasks-checklist.md`
   plus a separate `06_report.md` for the Task write-ups (reasoning at
   the time: keep the Checklist short). **Wrong** — a checklist with no
   task context isn't actually usable on its own.
3. **Second correction (this is the one that applies):** the per-Task
   write-ups moved back **inside** the checklist file, and the leftover
   report/propositions content merged into one optional file — final
   names: `05_tasks_and_checklist.md` (mandatory: Checklist + Task
   write-ups together) and `06_others_from_report.md` (optional:
   decisions/problems/limitations/proposals — anything else from a
   report that isn't the Checklist itself).

Stories 53/54/55 were migrated through all of the above to match (content
unchanged, only relocated/merged/renamed — see each Story's
`06_others_from_report.md` for a short migration note).

- The directory name is **only the Story number** — never
  `53_reports`, `53_reports-first-version`, `Story 53`, or any other
  suffix/label.
- The Story's name/title is metadata stored inside the files (e.g. the
  `# Story 53 — ...` heading), never part of the physical directory name.
  This mirrors the Content Provider's own model: physical folders are
  numeric, the logical name lives in `config.yaml`, never in the folder
  name itself.
- Files inside a story folder use a numeric prefix (`01_`, `02_`, ...) so
  their reading order is obvious from a directory listing alone.

## The six files

### `01_input.md`

The verbatim record of every user input for this Story — the original
prompt and every later correction/clarification, each as its own numbered
`## Input N` section, in the order they were given.

- Contains **only** the user's inputs, verbatim, in full.
- No summaries, no shortening, no rewriting.
- No description of the Story standard itself (that's this file).
- No organizational commentary, notes, or explanations added by the
  assistant — those belong in `02_plan.md`, `03_knowledge.md`, or
  `06_others_from_report.md`, not here.
- Must be sufficient, on its own, to reconstruct the entire task.

### `02_plan.md`

The implementation plan presented to the user for approval before coding
started (and any revisions made to it in response to feedback, before
implementation began). Written once, before Part-1-style implementation
work starts.

### `03_knowledge.md`

Pointers to the documentation and code needed to do **this specific
Story**, each with a short note on *why* it was needed — not a description
of the implementation (that's `05_tasks_and_checklist.md`). Goal: a future change to
this Story's area of the codebase shouldn't require re-discovering this
context from scratch.

**This is not the same thing as `documentation/ai-docs/begin_here/`** (this
directory, the one this file lives in). The distinction:

- `documentation/ai-docs/begin_here/` — global knowledge that holds for the
  **whole project**, read once at the start of any non-trivial task,
  independent of which Story is being worked on (this file is entry `01`
  of it).
- `stories/<N>/03_knowledge.md` — knowledge discovered **while doing this
  one Story**, scoped to it, and not assumed to apply anywhere else.

If something learned in a Story's `03_knowledge.md` turns out to be
generally true for the project (not just relevant to that one task), move
or copy it into `documentation/ai-docs/begin_here/` so later Stories benefit
from it too, instead of leaving it buried in one Story's history.

### `04_todos.md`

A **working scratchpad**, written to *during* the Story, for things
noticed along the way but consciously deferred **out of** this Story's
scope — not a bug list, and not things that were fixed during this Story.
Example: a tempting refactor spotted in passing, a follow-up feature idea,
a migration of old data to a new convention.

**Critical rule — this file must be empty by the time the Story is
considered finished.** A non-empty `04_todos.md` at the end of a Story is
a signal — to the user and to any AI reading the Story later — that
something is still unresolved. Do not leave items sitting in
`04_todos.md` as if that were their permanent home.

By the time `05_tasks_and_checklist.md` is finalized, every item that was
jotted into `04_todos.md` during the work must be triaged into exactly
one of:

- **fixed** — it turned out to be in scope after all, so it was done, and
  the note is removed;
- **discarded** — on reflection it wasn't worth keeping, so it's removed
  with no further trace;
- **promoted to `06_others_from_report.md`** — it's a real, worthwhile
  follow-up that belongs to the project's future, written up properly
  there.

`04_todos.md` ending up empty is not optional busywork — it is the actual
signal that the Story is complete with no loose ends left dangling in a
scratch file.

### `05_tasks_and_checklist.md`

<span style="color:red">**⚠️ IMPORTANT — this is THE most important file
in this entire standard, and it is MANDATORY. It must always be produced,
in full, with both the Checklist table AND a description for every task —
never left as a bare table with no write-ups. Forgetting the per-task
descriptions here is the single most common mistake made against this
standard (it happened for real, in Story 56, before being corrected) —
do not repeat it.**</span>

This file contains **both**:

1. The Checklist table (see format below).
2. Immediately below it, one Task section per checklist row — what was
   requested, what was actually done, which files changed, how it was
   tested, what wasn't done/verifiable, and its status. **A checklist row
   with no matching Task section is an incomplete file, not an acceptable
   shorter version.**

**History, for context (do not repeat the earlier mistakes described
here):** originally this was the opening section of a combined
`05_report.md`. A first correction split it into a Checklist-only
`05_tasks_and_checklist.md` plus a separate `06_report.md` for the Task
write-ups — that turned out to be wrong too: the whole point of this file
is that the user can open **one** short file and both check things off
*and* see enough of what happened per task to make sense of the
checkbox, without needing to jump to a second file for the most basic
"what did this task actually do" context. The Task write-ups belong here,
with the Checklist, not split out.

The Checklist itself exists for one purpose: **it is how the user, as
product owner, manually verifies the application** — not a summary of the
implementation, not architecture, not documentation bookkeeping. Someone
should be able to open `05_tasks_and_checklist.md` an hour or a week later
and, in two minutes, know:

- what was supposed to be done,
- what the AI believes is done,
- what the user has already personally verified,
- what the user still hasn't checked.

Format, exactly:

```text
# Story <N> — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE      |             | Migrate `actions/*` → `views/*` across the whole project |
| 2 | DONE      |             | Rebuild the Reports form as a two-stage panel |
| 3 | DONE      |             | Move the "Generated name" field next to the Create button |
| 4 | DONE      |             | Uppercase all Forms menu labels to match the Views menu style |

# Task 1 — Migrate `actions/*` → `views/*`

**Requested:** ...
**Done:** ...
**Files changed:** ...
**Tested:** ...
**Status: DONE**

# Task 2 — ...
```

Rules for the table:

- **`Ai Status`** is filled in by the AI: `DONE`, `PARTIAL`, or `NOT DONE`.
- **`Real Status`** is **always left blank by the AI.** It exists
  exclusively for the user to fill in after they have manually verified
  the item themselves in the running application. The AI must never write
  anything into this column, ever.
- Each row must correspond to one **functional** task the user can
  actually go and check by using the app, and must have a matching
  `# Task N` section below with the same number.

**Very important — what belongs on the Checklist and what does not:**

The Checklist contains **only functional, user-facing tasks about the
application** — things the user can click through and observe. It must
**never** contain:

- documentation reorganization,
- changes to this Story standard itself,
- moving/renaming files,
- refactors,
- renaming symbols or files,
- updating documentation indexes,
- any other organizational/meta work.

That kind of work still gets documented — just in the optional
`06_others_from_report.md`, never in the Checklist and never as a
numbered Task tied to it. If a Story mixes functional work and
organizational work, only the functional part gets a Checklist row and a
Task section here.

### `06_others_from_report.md` (optional)

Everything else from a report that isn't the Checklist/Task write-ups —
additional, **non-mandatory** material such as architectural decisions,
problems encountered, limitations, general reflections, and follow-up
proposals. Unlike every other file, this one **may be completely empty
(or omitted entirely) if nothing important happened** worth recording
beyond what's already in `05_tasks_and_checklist.md` — there is no rule
requiring it to exist or have content.

Typical contents, none required:

- architectural decisions made along the way, and why;
- problems encountered during implementation and how they were resolved;
- known limitations / what was deliberately left undone;
- organizational/documentation work (per the rule above) that isn't a
  functional Task;
- follow-up proposals for future work — anything promoted out of
  `04_todos.md`, plus any other next-step idea worth recording. Unlike
  `04_todos.md`, there is no rule requiring proposals to end up empty —
  a Story can legitimately close with real, unimplemented proposals
  recorded here for later.

No required structure — this file is deliberately the loose,
low-ceremony one.

## Relationship to per-feature documentation

Documents describing how a specific piece of functionality works (e.g.
`documentation/dashboard/forms/features/reports-form.md`,
`documentation/dba/features/report-entries.md`) keep living in their
existing per-package locations and keep being maintained in place — a
Story does not replace them. The numbered Story folder documents the
*history of one task* and may span, reference, or update several such
feature docs at once.
