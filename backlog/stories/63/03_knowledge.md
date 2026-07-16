# Story 63 — 03_knowledge.md

Pointers to documentation/code needed for this Story, with *why* — not a
description of implementation (that belongs in `05_tasks_and_checklist.md`,
once there is one).

## Critical, Story-specific lesson: don't trust this conversation's own earlier turns

While starting this Story, the assistant discovered that its own
in-conversation understanding of "what Story 54 is" and "where
`documentation/stories/` lives" was stale/wrong — `git log`, `ps aux`
(showing two other live Claude Code sessions on this same repo), and the
actual current `backlog/stories/` listing (up to `62`) all disagreed with
what the assistant believed had just happened earlier in this same
conversation. Real ground truth: Story location is `backlog/stories/<N>/`
(not `documentation/stories/<N>/`), the six files are `01_input.md`,
`02_plan.md`, `03_knowledge.md`, `04_todos.md`, `05_tasks_and_checklist.md`
(mandatory), `06_others_from_report.md` (optional) — not `05_report.md`/
`06_propositions.md`. The real Story 54 is unrelated to this one (port-kill
+ the `begin`→`re-start` rename); Story 55 is unrelated too (voice
recording). **Lesson for any future work on this Story:** re-verify
`backlog/stories/` and `documentation/ai-docs/begin_here/` against the live
filesystem/git before assuming anything from a prior turn still holds,
especially after a `/compact` or across a long session.

## Mandatory reading order (per `01_ai_start.md`)

- `documentation/ai-docs/begin_here/01_ai_start.md` — first-read pointer;
  confirms the reading order below.
- `documentation/ai-docs/begin_here/02_what-and-where.md` — the project's
  documentation index (this is the file Input 1 calls `where-and-what`/
  `02_where-and-what.md` — its real current name is `02_what-and-where.md`,
  inside `begin_here/`, not `knowledge/`; the directory itself was renamed
  `knowledge/`→`begin_here/` on 2026-07-16 in Story 62, content/numbering
  unchanged).
- `documentation/ai-docs/begin_here/03_story-standard.md` — the Story
  file-format standard actually in force today (see the lesson above);
  also documents its own three-round correction history and the "create a
  Story proactively, at the very start" rule that this Story is itself
  following.
- `documentation/ai-docs/begin_here/04_deployment-rules.md` — global
  deployment rule ("always use the repo's own scripts, never bare `docker
  compose`"); its own naming-history paragraph is the fastest confirmation
  that the real Story 54 already did the `begin`→`re-start` rename and that
  `06_qnap_ssh`'s `begin_*.sh` wrappers were deliberately left alone at the
  time.
- `documentation/ai-docs/begin_here/05_endpoint-rules.md` — read for
  completeness per the mandatory-order rule; not relevant to this
  particular Story's content (it governs `dba`/API endpoint changes, not
  deploy scripts).

## The authoritative deploy-scripts contract

- `documentation/ai-docs/deploy/dashboard-deployment-scripts.md` — the
  single most-cited doc in this Story's plan; describes exactly what each
  `NN_*.sh` does today, the shared/test/prod split, and (critically) its
  own "Niespójność nazewnictwa" section already documents the real Story
  54's `begin`→`re-start` rename and explicitly names `06_qnap_ssh`'s
  `begin_*.sh` and `02_local_mac_tmux`'s `start`/`end` as deliberately
  un-touched at the time — i.e. this doc itself predicted that a future,
  separate, deliberate task would be needed to finish the unification. This
  Story is that task.
- `documentation/ai-docs/deploy/shared-qnap-services.md` — architecture and
  real QNAP verification results for the one-shared-mongo/one-shared-CP
  design; directly informs the `00_qnap_shared` "keep it" verdict in
  `02_plan.md` §3, and its own §6 ("Procedura promocji obrazu TEST → PROD")
  is the doc that `06_last_from_test.sh` needs to replace/rewrite.
- `documentation/ai-docs/deploy/image-tagging-standard.md` — the
  `IMAGE_TAG`/`.image-tag.<image>.env` mechanism; explains *why*
  `06_last_from_test.sh`'s "point PROD at TEST's image" step is really just
  an explicit, confirmed version of something the shared tag file already
  makes possible today, not a new mechanism.
- `documentation/ai-docs/deploy/qnap-data-path.md` — unrelated to naming
  directly, but references `begin_shared.sh`/`00_qnap_shared`'s re-start
  script, so it's on the reference-update list.

## Real, git-tracked prior Story most relevant to this one

- `backlog/stories/54/` (the **real** Story 54 — port-kill + the
  `begin`→`re-start` rename, not to be confused with anything the assistant
  drafted earlier in this conversation under that number). Its
  `05_tasks_and_checklist.md` Task 4 and `06_others_from_report.md` are the
  direct precedent for almost everything this Story continues: the exact
  list of files that rename touched, the files it deliberately left alone
  and why (`06_qnap_ssh/begin_*.sh`, `02_local_mac_tmux`, frozen historical
  records), and its own "Propositions" section literally proposes exactly
  the two follow-ups this Story now does: (1) extend port-auto-free to the
  QNAP environments, (2) rename `06_qnap_ssh`'s wrappers for full
  consistency. Read this before touching any of the files it already
  touched, to avoid re-discovering reasoning that's already written down.

## Source scripts read in full for this Story's audit (2026-07-16, current state)

`bash-scripts/dashboard/{00_qnap_shared,02_local_mac_tmux,03_local_mac_docker,
04_qnap_test,05_qnap_prod,06_qnap_ssh}/*`, `bash-scripts/common/lib.sh`,
root `restart.sh`(was `re-start.sh`)/`end.sh`/`status.sh`,
`packages/net-content-provider/03_scripts/qnap/*` (confirmed out of scope),
`package.json` (confirmed no relevant references). Full inventory and
per-file findings are in `02_plan.md` §1 — not repeated here.
