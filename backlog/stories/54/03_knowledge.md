# Story 54 — 03_knowledge.md

- `documentation/ai-docs/knowledge/02_deployment-rules.md` — global rule:
  every build/start/stop/deploy operation goes through this repo's own
  scripts, never a hand-typed `docker`/`docker compose` command; confirmed
  the `01_config→06_deploy` naming/verb convention (`build`/`begin`/`end`/
  `status`/`deploy`, never `start_*`/`stop_*`) is the documented,
  cross-environment contract — needed to know this before touching numbering.
- `documentation/ai-docs/deploy/dashboard-deployment-scripts.md` — "the
  actual contract" doc; confirmed `03_local_mac_docker` previously shared the
  exact same 6-file pattern as `00_qnap_shared`/`04_qnap_test`/`05_qnap_prod`,
  which is what made the `01_config.sh` collision real (not just local to
  this one folder) and is why the renumbering needed a documented exception
  rather than a silent one-off deviation.
- `bash-scripts/common/lib.sh` — already had `find_docker_container_by_port`,
  `stop_docker_container_using_port`, `ensure_port_available`, and (from an
  earlier session, this one) `kill_process_on_port`. Needed to read all four
  closely to avoid reimplementing port-detection logic that already existed
  and was already proven — `01_port_kill.sh` is a thin wrapper specifically
  because of this.
- `bash-scripts/dashboard/03_local_mac_docker/{01_config,02_build,03_begin,
  04_end,05_status,06_deploy}.sh` (pre-rename) — read in full before any
  `git mv`, to know exactly which internal `source`/comment references would
  need fixing and confirm `06_deploy.sh` already did `build → begin → status`
  with no port logic of its own to duplicate.
- `bash-scripts/content-provider/run-content-provider-if-needed.sh` — external
  consumer with a hardcoded `03_local_mac_docker/02_build.sh` path in both a
  comment and a `log_error` fix-hint; would have silently pointed users at a
  nonexistent file post-rename if missed.
- `docker-compose.local.yml` — two comments referencing
  `03_local_mac_docker/03_begin.sh` by exact path (explaining why `IMAGE_TAG`
  is guaranteed set before compose interpolates it) — needed updating for the
  same reason.
- `documentation/ai-docs/deploy/image-tagging-standard.md` — living reference
  doc (not a dated session log) describing what `02_build.sh`/`03_begin.sh`
  do for local-mac-docker; distinguished from `documentation/stories/53/
  05_report.md` and the dated 2026-07-14 incident note in
  `02_deployment-rules.md`, both of which describe a specific past session's
  actual commands and were deliberately left unrenamed as frozen history.

## Correction (2026-07-14, `01_input.md` Input 3): `begin.sh` → `re-start.sh`

- Confirmed by direct inspection (not assumed) that the rename had never
  happened anywhere in the repo, and was absent from every one of this
  Story's own files — a genuine gap, not just a documentation omission.
- `documentation/ai-docs/deploy/dashboard-deployment-scripts.md`'s own
  "Niespójność nazewnictwa" section (pre-correction) explicitly documented
  that `begin`/`start` naming was inconsistent across three separate
  subsystems and explicitly said not to unify it "at the occasion of
  something else" — this correction *is* that separate, deliberate task
  the section asked for, so it directly rewrote that section rather than
  leaving it stale.
- Scope boundary that had to be actively decided (asked the user rather
  than guessing): literal filename match `begin.sh`/`<NN>_begin.sh` only —
  excludes `06_qnap_ssh/begin_{shared,test,prod}.sh` (different pattern:
  `begin_*.sh`, describes the *environment*, not a literal filename match)
  and `packages/net-content-provider/03_scripts/qnap/begin_qnap_test.sh`
  (separate, mid-rewrite subsystem — see project memory
  `project_net_content_provider_rewrite`, don't touch without an explicit
  ask specific to that package).
- `bash-scripts/common/lib.sh`'s `require_shared_services_healthy()` prints
  the literal fix-hint path in `log_error` — these are not just comments,
  they're what a user actually copy-pastes when a preflight fails, so they
  needed the same rename as the scripts themselves, not just docs.
- Verified end-to-end against the real, already-running local-mac-docker
  stack (not just `bash -n`): `bash bash-scripts/dashboard/
  03_local_mac_docker/04_re-start.sh` — full stop/re-create/health-wait
  cycle succeeded identically to the pre-rename `04_begin.sh` behavior
  documented in this Story's Task 3, confirming the rename didn't silently
  break the auto-port-freeing integration from Task 3.
