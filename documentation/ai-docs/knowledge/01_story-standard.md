# Story documentation standard

This file is the single source of truth for how work on this repo is
organized into numbered **Stories**. Read this once; individual story
folders (`documentation/stories/<N>/`) do not repeat these rules.

## What is a Story

A Story is the whole unit of work behind one user task — not a single
"feature". It can include a new feature, a migration, fixes to an existing
feature, changes across several layers of the project, tests, documentation
updates, and consciously-deferred follow-up items. Every Story gets the
next sequential number (53, 54, 55, ...).

## Directory naming — numeric only

```text
documentation/stories/
    53/
        01_input.md
        02_plan.md
        03_knowledge.md
        04_todos.md
        05_report.md
        06_propositions.md
```

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
  `05_report.md`, not here.
- Must be sufficient, on its own, to reconstruct the entire task.

### `02_plan.md`

The implementation plan presented to the user for approval before coding
started (and any revisions made to it in response to feedback, before
implementation began). Written once, before Part-1-style implementation
work starts.

### `03_knowledge.md`

Pointers to the documentation and code needed to do **this specific
Story**, each with a short note on *why* it was needed — not a description
of the implementation (that's `05_report.md`). Goal: a future change to
this Story's area of the codebase shouldn't require re-discovering this
context from scratch.

**This is not the same thing as `documentation/ai-docs/knowledge/`** (this
directory, the one this file lives in). The distinction:

- `documentation/ai-docs/knowledge/` — global knowledge that holds for the
  **whole project**, read once at the start of any non-trivial task,
  independent of which Story is being worked on (this file is entry `01`
  of it).
- `stories/<N>/03_knowledge.md` — knowledge discovered **while doing this
  one Story**, scoped to it, and not assumed to apply anywhere else.

If something learned in a Story's `03_knowledge.md` turns out to be
generally true for the project (not just relevant to that one task), move
or copy it into `documentation/ai-docs/knowledge/` so later Stories benefit
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

By the time `05_report.md` is finalized, every item that was jotted into
`04_todos.md` during the work must be triaged into exactly one of:

- **fixed** — it turned out to be in scope after all, so it was done, and
  the note is removed;
- **discarded** — on reflection it wasn't worth keeping, so it's removed
  with no further trace;
- **promoted to `06_propositions.md`** — it's a real, worthwhile follow-up
  that belongs to the project's future, written up properly there.

`04_todos.md` ending up empty is not optional busywork — it is the actual
signal that the Story is complete with no loose ends left dangling in a
scratch file.

### `06_propositions.md`

This Story's curated, final list of follow-up proposals for future work —
where anything promoted out of `04_todos.md` ends up, plus any other
next-step idea worth recording (this replaces what used to be a loose
"Propozycje kolejnych kroków" prose section at the end of `05_report.md` —
it now gets its own numbered file instead). Unlike `04_todos.md`, there is
no rule requiring this file to end up empty — a Story can legitimately
close with real, unimplemented proposals recorded here for later.

### `05_report.md`

The final account of what was actually done: scope completed, files
changed, decisions made, tests actually run (never claimed beyond what was
actually executed — build/typecheck is not "tested"), real results,
problems hit, and anything left undone.

#### Mandatory opening section: the Checklist

**This is one of the most important rules in this entire standard. Always
follow it, without exception.**

Every `05_report.md` **must open** with a Checklist — before anything
else, including before the numbered Task sections that follow it. The
Checklist exists for one purpose only: **it is how the user, as product
owner, manually verifies the application** — not a summary of the
implementation, not architecture, not documentation bookkeeping. Someone
should be able to open `05_report.md` an hour or a week later and, in two
minutes, know:

- what was supposed to be done,
- what the AI believes is done,
- what the user has already personally verified,
- what the user still hasn't checked.

Format, exactly:

```text
# Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE      |             | Migrate `actions/*` → `views/*` across the whole project |
| 2 | DONE      |             | Rebuild the Reports form as a two-stage panel |
| 3 | DONE      |             | Move the "Generated name" field next to the Create button |
| 4 | DONE      |             | Uppercase all Forms menu labels to match the Views menu style |
```

Rules for this table:

- **`Ai Status`** is filled in by the AI: `DONE`, `PARTIAL`, or `NOT DONE`.
- **`Real Status`** is **always left blank by the AI.** It exists
  exclusively for the user to fill in after they have manually verified
  the item themselves in the running application. The AI must never write
  anything into this column, ever.
- Each row must correspond to one **functional** task the user can
  actually go and check by using the app.

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

That kind of work still gets documented — just further down in
`05_report.md`, in its own section, never in the Checklist and never as a
numbered Task tied to the Checklist. If a Story mixes functional work and
organizational work, only the functional part gets a Checklist row and a
Task section; the organizational part gets a plain prose section later in
the report.

#### The rest of the report

After the Checklist, one Task section per checklist row, each with its own
heading, in the same order and numbering as the Checklist:

```text
# Task 1 — [name]
# Task 2 — [name]
# Task 3 — [name]
```

Under each task heading, cover:

- what was requested,
- what was actually done,
- which files were changed,
- how the task was tested,
- what was not done or could not be verified,
- status: `DONE`, `PARTIAL`, or `NOT DONE` (matching the Checklist's `Ai Status`).

**Only after all Task sections** do the remaining sections follow — e.g.
architectural decisions, any organizational/documentation work (per the
rule above), problems encountered, limitations, general testing notes.
Follow-up proposals/next steps themselves belong in `06_propositions.md`,
not as a prose section in `05_report.md` — see below.

The report must never open with a general summary or with architectural
decisions. It must always start with the Checklist, immediately followed
by the numbered Task sections.

## Relationship to per-feature documentation

Documents describing how a specific piece of functionality works (e.g.
`documentation/dashboard/forms/features/reports-form.md`,
`documentation/dba/features/report-entries.md`) keep living in their
existing per-package locations and keep being maintained in place — a
Story does not replace them. The numbered Story folder documents the
*history of one task* and may span, reference, or update several such
feature docs at once.
