# Story 66 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | PARTIAL   |             | Establish the real current state of QNAP TEST after the interrupted deployment (build success? new image? container running which image? app responding?) |
| 2 | DONE      |             | Identify the real root cause of the "Timeout, server ... not responding." disconnect |
| 3 | DONE      |             | Fix `06_qnap_test_ssh/06_deploy.sh` so a long build survives a dropped/slow SSH connection instead of leaving the real outcome unknown |
| 4 | NOT DONE  |             | Confirm the fix for real, end-to-end, against the actual QNAP host |
| 5 | DONE      |             | `06_qnap_test_ssh/06_deploy.sh` streams live by default again (Task 3's detached mode moved behind an explicit `--detached` flag) |

# Task 1 — Real current state of QNAP TEST

**Requested:** don't assume the build succeeded, failed, or that TEST is
running the new image — verify.

**Done:** Attempted to establish this via SSH/ping, repeatedly, over several
minutes (see log below).

**Result: could not be determined.** The QNAP host (100.117.139.83) is
currently **completely unreachable** from this Mac — `ping` shows 100%
packet loss (3/3 attempts), and `ssh` fails at the TCP-connect stage
("Operation timed out") on 5 separate attempts across several minutes, with
timeouts ranging 8-15 seconds each. This is a different, more severe
failure than the one in the original incident (that one completed a
connection and lost it later; this one can't connect at all). I cannot
tell from here whether this means:
- the QNAP host itself is down, rebooting, or hung (possibly related to
  the same incident — e.g. resource exhaustion from the build never fully
  recovering), or
- the Tailscale path between this Mac and the QNAP is broken for an
  unrelated reason, or
- a transient, unrelated network issue.

**No destructive or state-changing action was taken** — per the input's
explicit instruction, no deploy was re-run, and nothing was assumed.

**Status:** PARTIAL — the diagnostic was performed honestly and thoroughly,
but its answer is "currently unknown / unreachable," not the concrete
per-item answers (build success, image existence, container state,
port response) the input asked for. **Needs the user to check the QNAP
through a path this session doesn't have** (physical access, QNAP web UI,
or simply retrying once the host is reachable again) before those specific
questions can be answered.

# Task 2 — Real root cause of the timeout

**Requested:** determine whether the timeout happened during the build,
image copy, restart, or was purely an SSH-connection-side issue.

**Done:** `Timeout, server <host> not responding.` is OpenSSH's own
built-in client message, fired when `ServerAliveCountMax` consecutive
`ServerAliveInterval`-spaced keepalive probes go unanswered — confirmed by
(a) a repo-wide grep for that literal string returning zero matches (it's
not printed by any of our own scripts), and (b) confirming `sshpass` (not
`expect`) was the actual auth path `run_remote` would have taken, given
both are installed on this Mac — so the message came directly from the
`ssh` client's own keepalive handling. `bash-scripts/common/lib.sh`'s
`SSH_OPTS` had `ServerAliveInterval=5 -o ServerAliveCountMax=3` (15s
tolerance). The pasted log (Input 2) shows the disconnect landing right
after `next build`'s "Creating an optimized production build ..." line — a
CPU/memory-heavy, often stdout-silent-for-minutes phase — consistent with
the QNAP host becoming too scheduling-starved under that load to answer a
keepalive within 15 seconds.

**Answer to "which phase":** purely an SSH-connection-side issue, on the
client's own keepalive tolerance, triggered by (not necessarily unique to)
the build phase's resource demands — not a Docker-level, image-copy-level,
or restart-level failure per se (those never got a chance to report
anything, since the SSH session carrying the whole `06_deploy.sh` was what
died).

**Status:** DONE.

# Task 3 — Fix so long builds survive a dropped/slow connection

**Requested:** if it's our scripts, fix them; if it's SSH handling, fix it;
if it's timeouts, adjust them; if it's missing keep-alive, add it; add a
keep-alive/heartbeat/progress mechanism so long builds don't end in a false
timeout.

**Done:**
- New `bash-scripts/common/lib.sh` functions: `remote_job_start` (launches
  a remote command detached — `nohup`, `disown`, no controlling terminal,
  output to a log file under `$QNAP_REPO_DIR/.runtime/remote-jobs/` —
  so it keeps running independent of any SSH session's lifetime),
  `remote_job_status`/`remote_job_tail` (poll for completion / new output
  over fresh, short-lived connections), `run_remote_job_with_progress`
  (orchestrates start + poll-until-done, printing progress every 15s by
  default; a poll that itself fails to connect is treated as "still
  running, retry," never as failure — only the remote-recorded exit code
  decides the outcome).
- `bash-scripts/dashboard/06_qnap_test_ssh/06_deploy.sh` rewired to use
  `run_remote_job_with_progress` for the build+restart+status step (the
  git pull stays a normal fast `run_remote` call).
- Base `SSH_OPTS` keepalive tolerance raised from 5s×3 (15s) to 10s×12
  (120s) — defense in depth for every other SSH-driven operation (e.g.
  `03_restart.sh`'s own up-to-60-second healthcheck wait loop was also at
  risk of the same class of false-timeout, just less severely); the
  hardcoded duplicate in the `expect` fallback branch of `run_remote` was
  updated to match.
- **A real bug in the first draft of this fix was caught and corrected
  before shipping**: the initial `remote_job_start` embedded the user
  command inside a nested `bash -c '...'` string, which broke immediately
  given the one real call site's command contains its own single quotes.
  Found by testing against a mocked `run_remote_capture` (echoes instead of
  connecting) — see `06_others_from_report.md` for detail. Fixed by
  base64-encoding the command before splicing it into the remote bootstrap
  script.

**Tested:**
- `bash -n` on both changed files — pass.
- The generated remote bootstrap command inspected directly (mocked
  `run_remote_capture`) — confirmed correct base64 payload and correct
  variable escaping for remote-side evaluation.
- A full local simulation: a fake `$QNAP_REPO_DIR` under `/tmp`, a
  multi-line fake job that echoes two lines and exits 7 — confirmed the
  log file captured both lines and the done-file captured `7` (verifying
  the whole nohup+base64-decode+exit-code-capture pipeline end-to-end,
  just not over a real SSH connection).
- **Not tested against the real QNAP** — see Task 4.

**Status:** DONE (implemented, locally verified by simulation; the one
remaining gap is real-network verification, tracked separately as Task 4).

# Task 4 — Confirm the fix against the real QNAP

**Requested (implicitly, by "napraw problem" and the report's own item 6):**
verify the fix actually works, not just that it's been written.

**Not done.** The QNAP host is currently unreachable (see Task 1) — there
is nothing to SSH into right now to run this verification against. This is
explicitly not being worked around by, e.g., re-running a deploy against a
host that might come back partway through, per the input's own "Nie
uruchamiaj od razu kolejnego deploymentu."

**Status:** NOT DONE — blocked on QNAP reachability, not on missing code.
Retry once the host responds again (see `06_others_from_report.md` for the
concrete next steps).

# Task 5 — Restore live streaming as the default; detached mode becomes `--detached`

**Requested:** (`01_input.md`, Input 4) — Task 3's detached-by-default
change was a real UX regression for daily dev use (deploy now returns
almost immediately after printing a job ID, instead of streaming the whole
build/restart/healthcheck/status live and blocking until the real
success/failure is known). Restore the previous, attached/streamed
behavior as the default; keep the detached mechanism available behind an
explicit `--detached` flag, for the rare case it's actually needed (very
long unattended deploys, future CI). Find the prior implementation in Git
history first, rather than reimplementing streaming from scratch.

**Done:** Checked actual Git history for this file — contrary to this
Story's own earlier assumption that nothing had been committed yet (see
`06_others_from_report.md`'s correction note), it turns out both versions
*were* committed (`55a898e` = the original Story 63 streamed version using
`run_remote_script`; `ce34967` = this Story's detached version, = HEAD).
Restored `55a898e`'s body as the default path (unchanged,
`run_remote_script "04_qnap_test" "06_deploy.sh" ...` — fully attached,
streams live via the same `run_remote` every other fast operation already
uses, blocks until done, propagates the real exit code via `set -euo
pipefail`), and kept Task 3's detached mechanism reachable via a new
`--detached` flag. Argument parsing rewritten as a `for arg in "$@"` loop
so `--non-interactive` and `--detached` combine freely in either order
(the previous single `"${1:-}" = "--non-interactive"` check only handled
one flag in one position).

**Files changed:** `bash-scripts/dashboard/06_qnap_test_ssh/06_deploy.sh`
only — no changes needed in `bash-scripts/common/lib.sh` (both
`run_remote_script` and `run_remote_job_with_progress` already existed;
this task only changes which one `06_deploy.sh` calls by default).

**Tested:** `bash -n` passes. Not run against the real QNAP (still
unreachable, see Task 4) — the default path is a straight revert to
`55a898e`'s exact, previously-working body, so it carries the same
confidence that version already had; the `--detached` path is unchanged
from Task 3's own testing.

**Status:** DONE.
