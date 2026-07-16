# Story 63 — Others (decisions, problems, limitations, proposals)

## Organizational work (not on the Checklist — renames/reorg, per the Story standard)

**Full rename/renumber, per the approved plan (`02_plan.md` §5), executed via `git mv`:**
- `00_qnap_shared/03_re-start.sh` → `03_restart.sh`
- `02_local_mac_tmux/{01_build→02_build, 02_start→03_restart, 03_end→04_end, 04_status→05_status, 05_logs→07_logs}.sh`
- `03_local_mac_docker/{02_config→01_config, 03_build→02_build, 04_re-start→03_restart, 05_end→04_end, 06_status→05_status, 07_deploy→06_deploy, 01_port_kill→90_port-kill}.sh`
- `04_qnap_test/03_re-start.sh` → `03_restart.sh`
- `05_qnap_prod/03_re-start.sh` → `03_restart.sh`
- root `re-start.sh` → `restart.sh`

**Deleted:** `05_qnap_prod/02_build.sh`, `05_qnap_prod/06_deploy.sh` (PROD
never builds/deploys independently — Task 4); the entire old
`bash-scripts/dashboard/06_qnap_ssh/` (13 files, including its own
`lib.sh`) — replaced by `06_qnap_test_ssh/`, `07_qnap_prod_ssh/`, and the
SSH/git-preflight functions merged into `bash-scripts/common/lib.sh`.

**New:** `06_qnap_test_ssh/{03_restart,04_end,05_status,06_deploy}.sh`,
`07_qnap_prod_ssh/{03_restart,04_end,05_status,06_last_from_test}.sh`.

**All active cross-references fixed** (verified by a final repo-wide grep,
zero live hits remaining outside deliberately-excluded historical/
out-of-scope files):
`bash-scripts/common/lib.sh`, every renamed script's own internal
`source`/`bash "$SCRIPT_DIR/..."` lines and comments,
`bash-scripts/content-provider/run-content-provider-if-needed.sh`,
`docker-compose.{local,qnap.shared,qnap.test,qnap.prod}.yml`, `.gitignore`,
`.env.qnap.example`, and the deploy docs:
`documentation/ai-docs/deploy/dashboard-deployment-scripts.md` (full
rewrite — numbering table, SSH split, `00_qnap_shared` verdict, promotion
procedure, verb glossary moved to a "Historia zmian" section per Input 1
§9), `shared-qnap-services.md`, `image-tagging-standard.md`,
`qnap-data-path.md`, `dashboard-start-scripts.md` (also fixed two
pre-existing, unrelated doc-drift items already flagged in the real Story
54's own propositions — a stale `01_config.sh`/`02_config.sh` credit and a
documented-but-nonexistent root `restart.sh`/`logs.sh`/`build.sh` table),
`documentation/ai-docs/begin_here/{02_what-and-where,04_deployment-rules}.md`.

**Deliberately left untouched:**
`documentation/ai-docs/deploy/bash-scripts-structure.md` (already flagged,
twice over now, as a historical naming-rationale record, not a living doc);
`packages/net-content-provider/03_scripts/qnap/*` (separate, mid-rewrite
subsystem); `bash-scripts/beeper/*` (separate subsystem, its own naming
decision already made by the real Story 54); `02_local_mac_tmux`'s own
internal file *contents* beyond the rename (per Input 1 §4, no behavior
change intended there); every dated historical incident/test-log paragraph
across these docs (2026-07-10/11/13/14 records) — rewriting them to match
today's names would misrepresent what was actually run at the time, per
this repo's own established precedent (see the real Story 54's own
`06_others_from_report.md` for the same rule applied previously).

## Decisions made without stopping to ask (per Input 5: "podejmij rozsądną decyzję... opisz ją później")

1. **Removed `docker-compose.qnap.prod.yml`'s `build:` section entirely**,
   not just the `05_qnap_prod/02_build.sh` script that used it. Reasoning:
   the input's architecture rule is "PROD nie powinien wykonywać
   niezależnego buildu" — deleting only the script leaves the compose file
   still capable of `docker compose build` if anyone ever ran that command
   by hand. Removing the build context makes the rule structural, matching
   the spirit of "close the gap" from the original audit (§2.4 in the
   first draft of `02_plan.md`).
2. **`06_last_from_test.sh` resolves TEST's image from the *running
   container*** (`docker inspect chad-dashboard-test --format
   '{{.Image}}'`), not just from reading `.image-tag.chad-dashboard.env`.
   Reasoning: the tag file could in principle drift from what's actually
   running (e.g. someone edited it without restarting); asking Docker what
   TEST is *actually* running is the more literal reading of "ustalić, jaki
   dokładnie obraz jest obecnie używany przez TEST."
3. **`run_remote_capture()` (new helper) doesn't support the `expect`
   password fallback cleanly** — only `sshpass` and key-based (no password)
   auth return real output; the `expect` path returns empty, and callers
   (`remote_repo_head`, `06_last_from_test.sh`'s image lookup) treat empty
   as "couldn't determine" rather than guessing. This machine has both
   `sshpass` and `expect` installed and `.env.qnap` set up such that
   `sshpass` was actually used for every real SSH call made this session,
   so this limitation wasn't exercised — flagged rather than silently
   assumed to be fine.
4. **Story number: 63, not 54/55.** See `01_input.md`'s framing note and
   `03_knowledge.md` — the numbers this work was originally (incorrectly)
   drafted under in this conversation belong to real, unrelated, already-
   completed Stories.

## Problems encountered

- **Mid-session discovery that this conversation's own earlier
  understanding of "Story 54"/"Story 55" was stale/wrong** (see
  `03_knowledge.md`'s dedicated section) — resolved by re-verifying
  against `git log`/`backlog/stories/`/`documentation/ai-docs/begin_here/`
  directly rather than trusting recalled context, and restarting the Story
  under the correct number (63).
- **`HEAD` already contained a partial, differently-worded version of some
  of these renames** when this session's own edits began (confirmed via
  `git show HEAD~1:.../03_restart.sh` — the filename was already
  `03_restart.sh` but internal text still said "re-start" and referenced
  the deleted `06_qnap_ssh`), most likely from another concurrent session
  also touching this repo (two other Claude Code processes were confirmed
  running against the same working tree earlier in this conversation).
  This explains the exact bug the user hit (build succeeded, restart failed
  on a stale `03_re-start.sh` reference) — it was hit during the narrow
  window between the filename already being renamed upstream and this
  session's own content-level fixes landing. No conflict resolution was
  needed beyond finishing the fixes thoroughly and verifying against the
  real running QNAP, which was done.
- **The auto-mode safety classifier was not an obstacle this time** —
  unlike the real Story 54's local-only testing, this Story's plan already
  called for real SSH verification against QNAP TEST, which the user
  explicitly re-authorized after the bug report, so no scope-limited
  workaround was needed for Task 3.

## Not done / left undone

- **`06_last_from_test.sh` has not been run against the real QNAP PROD.**
  Everything up to and including QNAP TEST was verified for real (Task 3);
  promoting to PROD is a separate, higher-stakes real action this Story's
  own plan already flagged as needing explicit go-ahead beyond "implement
  the approved plan" — asked for separately at the end of this turn.
- **The portable compendium document** (Input 1 §11) is written (see
  `documentation/ai-docs/bash-scripts-standard-compendium.md`) but, per the
  input's own instruction, only after the CHAD-side fix is "zweryfikowany"
  — TEST-side verification is real and complete; PROD-side promotion is
  not yet, so the compendium's PROD-promotion section is written from the
  code and the TEST-side verification, not from an end-to-end PROD test.
- **Git preflight's full interactive prompt flow** (commit/push
  y-or-n branches) was reviewed but not exercised end-to-end with a real
  dirty/ahead working tree against the real QNAP (see Task 1) — doing so
  would have required deliberately leaving this session's own work
  uncommitted mid-Story, which conflicts with actually finishing it.
- **Nothing has been committed or pushed.** Everything is staged
  (`git add`) in the working tree, per this repo's own rule of never
  committing without being explicitly asked.

## Proposals

- **Run `06_last_from_test.sh` for real against QNAP PROD** once approved —
  the natural next step to close Task 5 fully.
- **Exercise the Git preflight's interactive branches for real**, e.g. in a
  disposable scratch clone, the way the first draft of this Story's plan
  originally proposed testing it (§ "Testing plan" in the pre-Input-3
  version of `02_plan.md`).
- **Extend the git-SHA OCI label to `00_qnap_shared/02_build.sh`** (the
  Content Provider build) for the same traceability benefit — out of scope
  here since Input 3 §7 only asked for it on the TEST dashboard build,
  which is the one actually promoted TEST→PROD.
- **`04_qnap_test`/`00_qnap_shared` could adopt the same `90_*`-numbered
  manual-tool convention** if a similar technical helper (beyond
  `90_port-kill.sh`) is ever needed there.
