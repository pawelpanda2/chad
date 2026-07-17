# Story 66 — Plan

**Status: diagnosis complete, fix implemented and locally verified against a
simulated remote job, real-QNAP end-to-end verification blocked by the
QNAP host currently being unreachable (see `05_tasks_and_checklist.md`).**

## Diagnosis

1. **Root cause of `Timeout, server 100.117.139.83 not responding.`:** this
   is OpenSSH's own built-in client message, printed when
   `ServerAliveCountMax` consecutive `ServerAliveInterval`-spaced keepalive
   probes go unanswered. `bash-scripts/common/lib.sh`'s `SSH_OPTS` set
   `ServerAliveInterval=5 -o ServerAliveCountMax=3` — a 15-second tolerance.
   Confirmed via the pasted log (`01_input.md`, Input 2) that `sshpass` was
   the actual auth path in use (both `sshpass` and `expect` are installed;
   `run_remote`'s branch order tries `sshpass` first), so the raw `ssh`
   process with our own `SSH_OPTS` was directly responsible — no `expect`
   wrapper involved in this specific failure.
2. **Why 15s wasn't enough:** the log shows the failure landing right after
   `next build`'s "Creating an optimized production build ..." line — a
   CPU/memory-heavy webpack/Next.js production-bundling phase that can be
   silent on stdout for minutes. SSH keepalives are protocol-level
   (independent of the remote command's own stdout), so the most plausible
   mechanism is the QNAP host itself becoming too scheduling-starved under
   that load for `sshd` to answer a keepalive probe within 15 seconds — not
   a genuine network drop (no other evidence of one at the time).
3. **Current, separate finding:** as of this Story, the QNAP host
   (100.117.139.83) is **completely unreachable** — 100% ICMP packet loss,
   SSH TCP connect times out (5 consecutive attempts, up to 15s each, over
   several minutes). This is a different failure mode than the keepalive
   disconnect (that one completed a TCP handshake and lost the session
   later; this one can't complete a handshake at all) and could mean the
   QNAP is down/rebooting/hung, or the Tailscale path to it is broken, for
   reasons unrelated to (or possibly downstream of — e.g. the earlier
   build having pushed the host into a bad state) the original incident.
   **Not determinable from this Mac alone** — flagged honestly in the
   Checklist rather than guessed.

## Fix

Not just a bigger timeout — an architectural fix, since even a very
generous timeout wouldn't survive a real network blip during a
minutes-long build:

1. **`remote_job_start`/`remote_job_status`/`remote_job_tail`/
   `run_remote_job_with_progress`** (new, in `bash-scripts/common/lib.sh`):
   runs a remote command **detached** (`nohup`, `disown`, no controlling
   terminal, output to a log file under
   `$QNAP_REPO_DIR/.runtime/remote-jobs/`) so it keeps running independent
   of any one SSH session's lifetime, then polls over independent,
   short-lived SSH connections to report progress and detect completion. A
   poll that itself fails to connect is treated as "still running, retry,"
   never as the job having failed — only the remote-recorded exit code
   decides success/failure.
2. **`06_qnap_test_ssh/06_deploy.sh`** rewired to use
   `run_remote_job_with_progress` for the actual build+restart+status step
   (the git pull stays a normal, fast `run_remote` call).
3. **Base `SSH_OPTS` keepalive tolerance raised** from 5s×3 (15s) to
   10s×12 (120s), for defense in depth on every other SSH-driven operation
   (e.g. `03_restart.sh`'s own up-to-60-second healthcheck wait loops were
   also at risk of the same false-timeout class of bug, just less
   severely).

## Real bug found and fixed during implementation (not shipped)

The first version of `remote_job_start` embedded the user command inside a
nested `bash -c '...'` string. The one real call site
(`cd '$QNAP_REPO_DIR' && bash .../06_deploy.sh`) contains its own single
quotes, which broke that nesting immediately. Caught by testing the
function against a mocked `run_remote_capture` (never touched the real,
currently-unreachable QNAP) before relying on it — see
`06_others_from_report.md`. Fixed by base64-encoding the user command
before splicing it into the remote bootstrap script, eliminating the
nested-quoting problem entirely regardless of what the command contains.

## Verification plan (what's left)

Real, end-to-end verification against the QNAP (does a real long build
survive a simulated dropped connection, does `06_qnap_test_ssh/06_deploy.sh`
correctly report the real remote exit code) is blocked on the host being
reachable again — see the Checklist for exactly what's confirmed vs. not.
