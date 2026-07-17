# Story 66 — 03_knowledge.md

- `bash-scripts/common/lib.sh` — the SSH section (added in Story 63, see
  `backlog/stories/63/`): `SSH_OPTS`, `run_remote`, `run_remote_capture`,
  `run_remote_script`, `git_deploy_preflight`. This Story adds
  `remote_job_start`/`remote_job_status`/`remote_job_tail`/
  `run_remote_job_with_progress` right after `run_remote_script`, in the
  same file (no new library file — matches Story 63's explicit "one shared
  `common/lib.sh`, no `common_ssh/lib.sh`" decision).
- `bash-scripts/dashboard/06_qnap_test_ssh/06_deploy.sh` — the only call
  site that needed rewiring (the only operation that runs a long, silent
  build over SSH). `03_restart.sh`/`04_end.sh`/`05_status.sh` and
  `07_qnap_prod_ssh/*` are all fast operations, not touched.
- `documentation/ai-docs/deploy/dashboard-deployment-scripts.md` — new
  subsection right after "Git preflight" describing this mechanism; kept
  next to the preflight section since both gate the same operation.
- OpenSSH's `ServerAliveInterval`/`ServerAliveCountMax` and its exact
  client-side message on expiry (`Timeout, server <host> not responding.`)
  — confirmed by elimination: grepped the whole repo for that literal
  string first (zero matches — it's not printed by any of our own scripts),
  then confirmed `sshpass` was the actual auth path in use (both `sshpass`
  and `expect` installed on this Mac; `run_remote`'s branch order prefers
  `sshpass`), meaning the message came directly from the `ssh` client
  binary's own keepalive-timeout handling, not from an `expect` wrapper.
- Testing method for the fix: mocked `run_remote_capture` inside a
  throwaway script (source the real `lib.sh`, override just that one
  function to echo instead of connect) to inspect exactly what
  `remote_job_start` would send over SSH, without touching the real,
  currently-unreachable QNAP — caught the nested-single-quote bug this way
  before it could ever reach production. Then verified the generated
  bootstrap script for real, locally (a fake `$QNAP_REPO_DIR` under `/tmp`,
  a fake multi-line job with a deliberate non-zero exit code), confirming
  the log file and exit-code file end up with the right content.
