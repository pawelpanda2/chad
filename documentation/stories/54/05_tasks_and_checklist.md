# Story 54 — Tasks Checklist

**Retroactive note:** this Story folder was created after the fact, once
the user pointed out no Story existed for this work — see `01_input.md`'s
Input 2 and the resulting "When a Story gets created" section added to
`documentation/ai-docs/knowledge/03_story-standard.md`. The work itself,
the testing, and the results below are exactly what actually happened at
the time — nothing here is invented after the fact, only the Story-folder
packaging is retroactive.

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE      |             | `01_port_kill.sh <port>` frees a port held by a plain process |
| 2 | DONE      |             | `01_port_kill.sh <port>` frees a port held by a Docker container |
| 3 | DONE      |             | `04_begin.sh`/`07_deploy.sh` auto-free required ports instead of hard-failing |
| 4 | DONE      |             | (2026-07-14 correction) All `begin.sh`/`<NN>_begin.sh` scripts repo-wide are renamed to `re-start.sh`/`<NN>_re-start.sh`, and every real invocation of them (root wrapper, `07_deploy.sh`/`06_deploy.sh` chains, `06_qnap_ssh` wrappers) still works |

# Task 1 — `01_port_kill.sh <port>` frees a port held by a plain process

**Requested:** (`01_input.md`, Input 1) — find the PID, show process name +
PID, `kill` first, wait, re-check, escalate to `kill -9` only if still
alive, confirm the port is free. No confirmation prompt (called
automatically by other scripts).

**Done:**
- Added `01_port_kill.sh` in `bash-scripts/dashboard/03_local_mac_docker/` —
  a thin CLI wrapper (`./01_port_kill.sh <port>`) around `lib.sh`'s
  `kill_process_on_port()`, not a reimplementation.
- Extended `kill_process_on_port()` in `bash-scripts/common/lib.sh` to print
  each PID's process name (via `ps -p "$pid" -o comm=`) before killing, per
  the input's literal "wyświetlić nazwę procesu i PID" — it previously only
  logged bare PIDs.
- Confirmed the kill sequence is exactly SIGTERM → 1s wait → re-check port →
  SIGKILL only if still bound → final re-check → `log_ok`/`log_error`.

**Files changed:** `bash-scripts/dashboard/03_local_mac_docker/01_port_kill.sh`
(new), `bash-scripts/common/lib.sh` (`kill_process_on_port` extended).

**Tested (real, local):**
- Free port: `./01_port_kill.sh 19191` → `[ok] Port 19191 is free.`, exit 0.
- Plain process, SIGTERM sufficient: started `python3 -m http.server 19192`,
  ran the script → `[info] Port 19192 is in use by process 'Python' (PID
  40361).` → `[ok] Port 19192 is now free.`, `lsof` confirmed free.
- Process ignoring SIGTERM: started a Python server with
  `signal.signal(signal.SIGTERM, signal.SIG_IGN)` on port 19193, ran the
  script → showed name+PID → `Still running after SIGTERM — sending SIGKILL`
  → confirmed free.
- Missing argument: `./01_port_kill.sh` → `[error] Usage: ./01_port_kill.sh
  <port>`, exit 1.
- Invalid port: tested `abc`, `0`, `99999`, `-5` — all rejected with
  `[error] Invalid port: '...' (must be an integer 1-65535)`, exit 1.

**Status:** DONE.

# Task 2 — `01_port_kill.sh <port>` frees a port held by a Docker container

**Requested:** (`01_input.md`, Input 1) — find the container publishing the
port, show name + ID, stop it, remove it if safe/consistent with the
existing scripts' architecture, confirm the port is free. Never touch
Docker as a whole or unrelated containers.

**Done:**
- `kill_process_on_port()` already checked Docker first via
  `find_docker_container_by_port` (`docker ps --filter publish=<port>` —
  deliberately Docker-first because `lsof` on macOS reports a
  Docker-published port as owned by Docker's own proxy process, not the
  real owner). Enhanced `stop_docker_container_using_port()`'s log lines to
  show both container name **and** ID together (previously name-or-ID as a
  fallback, not both).
- Confirmed this path only ever touches the single container returned by
  `--filter publish=<port>` — `docker stop` + `docker rm` on that one ID,
  nothing broader.

**Files changed:** `bash-scripts/common/lib.sh`
(`stop_docker_container_using_port` log messages).

**Tested (real, local):** started `docker run -d --rm --name
port_kill_test_container -p 19194:80 nginx:alpine`, ran
`./01_port_kill.sh 19194` → `[warn] Port 19194 is in use by Docker container
'port_kill_test_container' (ID: 9dd1bee2a387) — stopping and removing it.`
→ `[ok] Stopped and removed container...` → confirmed via `docker ps -a`
that the container was gone.

**Status:** DONE.

# Task 3 — `04_begin.sh`/`07_deploy.sh` auto-free required ports instead of hard-failing

**Requested:** (`01_input.md`, Input 1) — `begin`/`deploy` must stop hard-
failing with `Not killing it automatically — stop it yourself, then
re-run.` and instead call `01_port_kill.sh` for every port the environment
needs, read from existing config (never hardcoded again), then re-verify
availability before actually starting. `deploy` must not duplicate this —
it must inherit it by calling `begin`.

**Done:**
- `04_begin.sh`'s preflight changed from a bare `ensure_port_available` loop
  to: build `REQUIRED_PORTS=("$DASHBOARD_PORT" "$CONTENT_PROVIDER_API_PORT"
  "$MONGODB_PORT")` (all three already exported by `02_config.sh`, no raw
  port numbers added anywhere) → call `bash "$SCRIPT_DIR/01_port_kill.sh"
  "$port"` for each → re-run `ensure_port_available` per port as the final
  gate → only then `docker compose up -d`.
- `07_deploy.sh` left structurally untouched (`03_build.sh → 04_begin.sh →
  06_status.sh`, three lines) — it gets the new behavior for free through
  `04_begin.sh`, no duplicated port logic.

**Files changed:** `bash-scripts/dashboard/03_local_mac_docker/04_begin.sh`.

**Tested (real, local, against the actually-running stack — not a mock):**
- Ran the real `bash bash-scripts/dashboard/03_local_mac_docker/04_begin.sh`
  against the live `chad-local` stack. Output: `[ok] chad-local stack
  stopped...` → `[info] Freeing required ports before starting: 12020 12024
  27017` → `[ok] Port 12020 is free.` / `12024` / `27017` (each via
  `01_port_kill.sh`) → `[info] Re-checking port availability...` → full
  `docker compose up` → `[ok] content-provider-api healthy:
  {"status":"ok",...,"repoCount":36,"anyRepoFound":true}` → `[ok] chad-local
  stack is up.`
- Followed with the real `bash bash-scripts/dashboard/03_local_mac_docker/
  06_status.sh` → all three containers `Up`, both health checks `[ok]`.
- Did not force a live port conflict against the real running dashboard
  container to test the non-Docker-process branch end-to-end through
  `begin.sh` specifically — the auto-mode safety classifier denied a manual
  `docker stop` of the user's live, in-use `chad-dashboard-local-mac-docker`
  container combined with injecting a substitute process, correctly judging
  it an unnecessary disruption given Task 1/2 already proved the underlying
  mechanism directly. `04_begin.sh`'s new code calls the exact same,
  already-proven `01_port_kill.sh` invocation — verified by code, not
  re-derived from scratch.

**Status:** DONE.

# Task 4 — Rename all `begin.sh` scripts to `re-start.sh` (2026-07-14 correction)

**Requested:** (`01_input.md`, Input 3) — the user pointed out that "rename
every `begin.sh` script to `re-start.sh`" had never actually been done, and
was missing from both the Checklist and the report. Asked to confirm scope
before touching anything (a literal "all `begin.sh` in the repo" reading
would also touch QNAP TEST/PROD scripts, which were out of scope for the
rest of this Story) — user confirmed: all `begin.sh`/`<NN>_begin.sh` files
repo-wide, explicitly including numeric-prefixed ones.

**Done:**
- Renamed 6 files via `git mv`: root `begin.sh` → `re-start.sh`;
  `bash-scripts/beeper/02_begin.sh` → `02_re-start.sh`;
  `bash-scripts/dashboard/00_qnap_shared/03_begin.sh` → `03_re-start.sh`;
  `bash-scripts/dashboard/03_local_mac_docker/04_begin.sh` → `04_re-start.sh`;
  `bash-scripts/dashboard/04_qnap_test/03_begin.sh` → `03_re-start.sh`;
  `bash-scripts/dashboard/05_qnap_prod/03_begin.sh` → `03_re-start.sh`.
- Deliberately did **not** rename `06_qnap_ssh/begin_shared.sh`/
  `begin_test.sh`/`begin_prod.sh` (different naming pattern — `begin_*.sh`,
  not a literal `begin.sh` match) or
  `packages/net-content-provider/03_scripts/qnap/begin_qnap_test.sh`
  (separate, mid-rewrite subsystem) — see `03_knowledge.md` for the full
  reasoning. Their internal *calls* to the renamed target scripts were
  still updated (e.g. `begin_prod.sh` now runs `05_qnap_prod/03_re-start.sh`
  remotely instead of `03_begin.sh`), so they keep working under their own,
  unchanged names.
- Fixed every real cross-reference to the old names: the functional
  `bash "$SCRIPT_DIR/NN_begin.sh"` calls inside every `NN_deploy.sh`;
  `06_qnap_ssh`'s `run_remote_script ... "03_begin.sh"` calls; `lib.sh`'s
  `require_shared_services_healthy()` fix-hint `log_error` messages (these
  are commands a user actually copy-pastes, not just comments);
  `docker-compose.local.yml`/`docker-compose.qnap.{shared,test,prod}.yml`
  comments; `.gitignore`; `.env.qnap.example`; `packages/content-provider/
  core/README.md`; and the tmux-family files that referenced the root
  wrapper by name (`02_local_mac_tmux/03_end.sh`,
  `tmuxinator.dashboard.yml`).
- Rewrote `documentation/ai-docs/deploy/dashboard-deployment-scripts.md`'s
  "Niespójność nazewnictwa" section — it previously documented that
  `begin`/`start` naming was inconsistent across subsystems and explicitly
  said any unification should be "a separate, deliberate task, not
  incidental to something else." This correction is exactly that task, so
  the section was rewritten (not just find-and-replaced) to describe the
  new three-way state honestly: Docker-family per-environment scripts now
  `re-start`/`end`, `06_qnap_ssh` wrappers still `begin_*`/`end_*`
  (deliberately unrenamed), `02_local_mac_tmux` still `start`/`end`
  (unrelated, older history). Also updated `documentation/ai-docs/deploy/
  dashboard-start-scripts.md` and the global `documentation/ai-docs/
  knowledge/04_deployment-rules.md`/`02_what-and-where.md`.
- Left frozen, dated historical records untouched (consistent with this
  Story's own earlier precedent): `documentation/stories/53/05_report.md`
  (its own path, at the time), this Story's own pre-correction Task 1–3
  prose above, the dated 2026-07-13 incident section in
  `image-tagging-standard.md`, the dated 2026-07-14 session-lesson in
  `02_deployment-rules.md` (now `04_deployment-rules.md`), the dated
  2026-07-10 test log in `dashboard-start-scripts.md`, and the dated
  2026-07-11 verification section in `dashboard-deployment-scripts.md`
  (added a forward-pointer note there instead, since the script names it
  records have since changed). `documentation/ai-docs/deploy/
  bash-scripts-structure.md` was left untouched entirely — it's already
  flagged in its own text as partially outdated and kept only as a
  historical naming-rationale record, the same choice this Story made for
  it the first time around.

**Files changed:** 6 renamed scripts (see above) plus real-content edits in
`bash-scripts/common/lib.sh`, `bash-scripts/dashboard/{00_qnap_shared,
03_local_mac_docker,04_qnap_test,05_qnap_prod}/*.sh`,
`bash-scripts/dashboard/06_qnap_ssh/begin_{shared,test,prod}.sh`,
`bash-scripts/dashboard/02_local_mac_tmux/03_end.sh`,
`bash-scripts/dashboard/02_local_mac_tmux/tmuxinator.dashboard.yml`,
`bash-scripts/beeper/03_end.sh`,
`bash-scripts/content-provider/run-content-provider-if-needed.sh`,
`packages/content-provider/core/README.md`, `docker-compose.local.yml`,
`docker-compose.qnap.{shared,test,prod}.yml`, `.gitignore`,
`.env.qnap.example`, and the deploy/knowledge docs listed above.

**Tested:**
- `bash -n` syntax-checked all 22 touched/renamed shell scripts — all pass.
- Ran the real, renamed `bash bash-scripts/dashboard/03_local_mac_docker/
  04_re-start.sh` against the actually-running local-mac-docker stack (not
  a mock): full idempotent stop → free ports 12020/12024/27017 → re-create →
  wait for `content-provider-api` health (`anyRepoFound:true`, `repoCount:
  36`) → wait for dashboard HTTP → `[ok] chad-local stack is up.` Followed
  with the real `06_status.sh` — all three containers `Up`, both health
  checks `[ok]`. This is the same end-to-end scenario Task 3 originally
  verified, now re-run under the new filename to confirm the rename didn't
  silently break the port-auto-free integration.
- Did not run anything against QNAP TEST/PROD/SHARED — same constraint as
  the rest of this Story. The QNAP-side renamed scripts
  (`00_qnap_shared/03_re-start.sh`, `04_qnap_test/03_re-start.sh`,
  `05_qnap_prod/03_re-start.sh`) and the `06_qnap_ssh` wrappers that call
  them were verified by syntax check and by reading the diff, not by a
  real remote run.

**Status:** DONE.
