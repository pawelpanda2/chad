# Story 56 — Others (decisions, problems, limitations, propositions)

## Organizational work (not on the Checklist, per `03_story-standard.md`)

**Story documentation standard changed mid-Story, in three steps** (see
`01_input.md` for the exact messages): originally a single `05_report.md`
(Checklist as its opening section, Task write-ups below). First
correction split it into a Checklist-only `05_tasks-checklist.md` and a
separate `06_report.md` for the Task write-ups. Second, final correction:
the per-Task write-ups moved back **inside** the checklist file (a
checklist with no task context isn't actually usable on its own), and the
leftover report/propositions content merged into one optional file —
final names `05_tasks_and_checklist.md` (mandatory) and
`06_others_from_report.md` (this file, optional). The authoritative
global standard, `documentation/ai-docs/knowledge/03_story-standard.md`,
was rewritten to describe this final structure, with the "Checklist must
include Task descriptions" rule marked prominently (red, "IMPORTANT",
flagged as the most common mistake against the standard) since forgetting
it is literally what happened here before being corrected.

**Stories 53/54/55 migrated to the final format**, per explicit
instruction ("zmigruj z poprzednich story 53 54 55 56 do nowego
standardu"): each Story's original `05_report.md` was split and
re-merged through all of the steps above (content unchanged throughout,
only relocated/merged/renamed) — final state for each: `05_tasks_and_checklist.md`
(Checklist + Task write-ups) and `06_others_from_report.md` (decisions,
problems, limitations, propositions). Cross-references to the old
filenames were fixed in living docs (`reports-form.md`,
`voice-recording.md`, `dashboard-deployment-scripts.md`) — but **not**
inside Story 54's own file, where two mentions of
`stories/53/05_report.md` describe a deliberate historical decision
("leave this frozen record untouched") made *at the time*; rewriting them
would misrepresent what Story 54 actually decided to leave alone.

**Per-feature documentation updated:** `documentation/dashboard/forms/
features/reports-form.md` (metadata row reorg, recording panel, editable
Views/Reports, navigation), `documentation/dashboard/common/features/
voice-recording.md` (recording panel architecture, the append-bug fix,
updated testing notes), `documentation/dashboard/common/features/
responsive-layout-standard.md` (the 100px strip, `DashboardHistoryProvider`,
`NavGroup` replacing `BackButton`, `toolbarSecondRow`).

## Problems encountered

- **Browser-testing tooling wasn't set up in this environment.** No
  `chromium-cli`, no `playwright` package installed anywhere in the repo
  or globally. Installed `playwright-core` into a scratch directory
  (outside the repo) and pointed it at the Playwright-managed Chromium
  binary already cached under `~/Library/Caches/ms-playwright/` (no new
  browser download needed) — this took a few iterations to get the exact
  executable path right (`chrome-mac-arm64/Google Chrome for Testing.app/...`).
- **The local Docker stack was serving a stale image** (built before any
  of this Story's changes) when testing started — a leftover
  `chad-dashboard-local-mac-docker` container from an earlier session.
  Rebuilt and redeployed via the repo's own official
  `bash-scripts/dashboard/03_local_mac_docker/07_deploy.sh` (build +
  re-start + status), never a raw `docker build`/`docker run` — twice,
  once before the first browser check and once more after the
  mid-session bug fixes (voice append bug, NavGroup relabeling, Statuses
  second row), so the final test run genuinely reflected all the changes
  in this report, not a partial/stale set.
- **A moment of miscommunication mid-Story**: the user flagged that my
  visible actions (installing packages, debugging a Chromium executable
  path) looked like I'd misunderstood the ask as "build an automated test
  suite" instead of "produce the Checklist/report the user can manually
  review." Clarified directly: the Checklist/Task-description structure
  was already planned correctly and matched the story standard's own
  precedent (Story 55); the actual cause was a real browser-driving
  tool being mid-setup when the message arrived, not a misunderstanding
  of the deliverable.
- **The Checklist/Report file split itself turned out wrong once
  implemented** — see "Organizational work" above. Corrected the same
  session once the user pointed out the checklist file had no task
  descriptions.

## Ograniczenia / niewykonane

- Actual dictated speech content across a Record→Stop→Record cycle (the
  Task 2 append-bug fix) could not be observed end-to-end — the sandboxed
  browser has no real microphone, only a synthetic silent stream. Verified
  by code review instead; see Propositions below.
- `NavGroup`/history navigation was not extended to pages outside
  `DashboardPageShell`/`EditorPageShell` (settings, dashboard home,
  documents, folders, messages, content-provider, datalib, projects,
  errors, auth) — explicit scope boundary, see Task 6 and Propositions
  below.
- Not every single `DashboardPageShell`-consuming page/branch was
  individually screenshotted in the browser (e.g. `msg-planner`,
  `todo-msg` list, `users`, `beeper` list, Statuses matrix/migration) —
  their `NavGroup` inclusion was verified by code review (the shell
  renders it unconditionally) rather than a per-page click-through, given
  the size of this Story.
- QNAP TEST/PROD were not touched, deployed, or tested — this Story only
  ever ran against the local Docker stack, consistent with prior Stories'
  own scope.

`04_todos.md` is empty — nothing noticed in passing during this Story was
left undecided; every follow-up worth keeping was written up properly
below.

## Propositions

- **Extend `NavGroup`/`DashboardHistoryProvider` to the remaining
  not-yet-shelled pages** (`settings/*`, dashboard home, `documents`,
  `folders`, `messages`, `content-provider`, `datalib`, `projects`,
  `errors`, `auth`). Explicitly out of scope for this Story (see
  `02_plan.md`'s "Scope boundary") — these pages aren't on
  `DashboardPageShell`/`EditorPageShell` at all yet, so adding navigation
  to them is really "migrate them onto the layout standard first," a
  separate, larger pre-existing follow-up already tracked in
  `responsive-layout-standard.md`'s own "Dalsze etapy".
- **Real human-voice testing of the Record→Stop→Record append fix.** The
  sandboxed browser test environment has no real microphone input
  (`--use-fake-device-for-media-stream` produces silence), so the fix in
  `hooks/use-speech-to-text.ts` was verified by code review/reasoning and
  by confirming no crashes/errors through a real Record→Stop→Move cycle,
  not by observing actual dictated text accumulate across two sessions.
  Same limitation Story 55 already recorded for this feature area.
- **`msg-planner` has no `upLevel`/hierarchy-up affordance.** It uses
  `EditorPageShell` with its own hand-built header row and never had a
  Back button before this Story either — left untouched, consistent with
  Story 55's own explicit exclusion of this page. Revisit if `msg-planner`
  ever gains a real "return to X" concept.
- **`DashboardHistoryProvider`'s 5-back/5-forward cap is a simple,
  explicitly-requested constraint**, not a general design principle —
  if a future need arises for a longer history, revisit deliberately
  rather than just bumping the constant, since the cap was a specific
  simplicity ask (RAM-only, no persistence), not an arbitrary limit.
