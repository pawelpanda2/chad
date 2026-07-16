# Story 54 — 02_plan.md

**Retroactive note:** no plan was presented for approval before implementation
started — this Story was not created at the time, so there was no `02_plan.md`
step in the moment. `01_input.md`'s Input 1 was already a fully detailed,
prescriptive spec (exact filename, exact two cases to handle, exact
integration points, exact test matrix), which is what made the task feel
like "just implement this" rather than "help me plan this." That distinction
is exactly what `01_story-standard.md`'s new "When a Story gets created"
section now calls out as *not* a valid reason to skip Plan Mode / Story
creation.

What follows is the plan as it was actually executed, reconstructed from the
work itself (not written up-front):

1. Read `documentation/ai-docs/knowledge/02_deployment-rules.md` and
   `documentation/ai-docs/deploy/dashboard-deployment-scripts.md` first, per
   the input's own instruction.
2. Read the six existing `bash-scripts/dashboard/03_local_mac_docker/*.sh`
   files and `bash-scripts/common/lib.sh` in full before changing anything.
3. Confirm the numbering collision (`01_config.sh` already exists) and
   renumber `01_config.sh…06_deploy.sh` → `02_config.sh…07_deploy.sh` via
   `git mv` (descending order to avoid clobbering), freeing `01_` for the
   new script. Fix every internal cross-reference in the same pass.
4. Reuse (not duplicate) the existing `kill_process_on_port()` in `lib.sh` —
   already added in an earlier session for `02_local_mac_tmux/03_end.sh` —
   as the engine behind the new script, extending it to print process
   name+PID and container name+ID (the input's literal requirement).
5. Write `01_port_kill.sh` as a thin CLI wrapper: arg validation, no
   confirmation prompt, delegates to `kill_process_on_port`.
6. Change `04_begin.sh`'s preflight from a single `ensure_port_available`
   loop (hard-fails on a non-Docker process) to: build `REQUIRED_PORTS` from
   `02_config.sh`'s already-exported vars → call `01_port_kill.sh` per port →
   re-verify with `ensure_port_available` → only then `docker compose up`.
7. Leave `07_deploy.sh` structurally unchanged (`build → begin → status`) —
   it inherits the new behavior for free by calling `04_begin.sh`.
8. Fix every external reference to the old numbering repo-wide, deliberately
   leaving three dated historical/incident records untouched (Story 53's own
   report, a dated incident note in `02_deployment-rules.md`, a dated testing
   log in a feature doc) — consistent with this repo's established practice
   of not rewriting frozen history.
9. Add a documented numbering exception to `dashboard-deployment-scripts.md`
   (the authoritative contract doc), mirroring the existing precedent for
   `02_local_mac_tmux`'s own naming exception.
10. Test all required scenarios locally against real processes/containers,
    plus the real `04_begin.sh`/`06_status.sh` against the actually-running
    stack (not just the isolated new script).

## Correction plan (2026-07-14, `01_input.md` Input 3)

The user pointed out that "rename every `begin.sh` script to `re-start.sh`"
was never actually implemented, and was also never tracked in the original
Checklist/report — confirmed by inspection: no `begin.sh`/`re-start.sh`
rename existed anywhere in the repo before this correction, and none of
`01_input.md`/`02_plan.md`/`03_knowledge.md`/`05_report.md` mentioned it.
Asked the user to confirm scope before touching anything, since a literal
"all `begin.sh` in the repo" reading would also touch QNAP TEST/PROD
deployment scripts, which were explicitly out of scope for the rest of
Story 54 — user confirmed: **all** `begin.sh`/`<NN>_begin.sh` files
repo-wide, not just `03_local_mac_docker`.

1. Enumerate every file literally named `begin.sh` or `<NN>_begin.sh`
   (exact match, optional two-digit numeric prefix) via `find`/`grep` —
   found 6: root `begin.sh`; `bash-scripts/beeper/02_begin.sh`;
   `bash-scripts/dashboard/{00_qnap_shared,04_qnap_test,05_qnap_prod}/03_begin.sh`;
   `bash-scripts/dashboard/03_local_mac_docker/04_begin.sh`.
2. Deliberately exclude `06_qnap_ssh/begin_shared.sh`/`begin_test.sh`/
   `begin_prod.sh` (different naming pattern, `begin_*.sh` not `begin.sh`)
   and `packages/net-content-provider/03_scripts/qnap/begin_qnap_test.sh`
   (different, mid-rewrite subsystem) — document this exclusion explicitly
   rather than silently narrowing scope.
3. `git mv` all 6 files to their `re-start.sh`/`<NN>_re-start.sh`
   equivalents.
4. Grep the whole repo for every cross-reference to the old names (other
   scripts, `docker-compose.*.yml`, `.gitignore`, `.env.qnap.example`,
   living deploy docs, `packages/content-provider/core/README.md`) and fix
   each one — including the functional `bash "$SCRIPT_DIR/NN_begin.sh"`
   deploy-chain calls and the `06_qnap_ssh` wrappers' internal
   `run_remote_script ... "03_begin.sh"` calls (wrapper filenames stay,
   their target argument changes).
5. Leave frozen, dated historical records untouched (Story 53/54's own
   past prose, dated incident/testing-log sections in deploy docs) —
   consistent with this repo's established practice from earlier in this
   same Story.
6. Rewrite `dashboard-deployment-scripts.md`'s "Niespójność nazewnictwa"
   section to describe the new three-way naming state honestly (Docker
   family now `re-start`/`end`, `06_qnap_ssh` still `begin_*`/`end_*`,
   `02_local_mac_tmux` still `start`/`end`), instead of just doing a blind
   find-and-replace on a section that specifically discussed why this
   exact rename hadn't been done yet.
7. Syntax-check (`bash -n`) every touched script, then actually run the
   real `04_re-start.sh` (renamed) against the live local-mac-docker stack
   end-to-end (not just a dry check) — QNAP stays untouched per the
   original Story 54 constraint, which this correction does not lift.
8. Update `01_input.md` (this correction as Input 3), `05_report.md`
   (new Task 4 + Checklist row), `03_knowledge.md`, and `04_todos.md`/
   `06_propositions.md` for anything noticed but out of scope.
