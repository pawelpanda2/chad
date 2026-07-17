#!/usr/bin/env bash
# SSHes into the QNAP and runs bash-scripts/dashboard/04_qnap_test/06_deploy.sh
# there (build + restart + status on TEST). Does not duplicate deployment
# logic — just connects, pulls latest, and runs the real script.
#
# The one operation in this repo that builds a new chad-dashboard image from
# current source, so it's the only one gated by a git preflight: refuses to
# proceed if there are uncommitted local changes or unpushed commits (this
# is the exact bug this Story exists to fix — "bash deploy_test.sh" silently
# deploying stale code because local work was never committed/pushed).
#
# Default mode: attached/streamed, exactly like before Story 66 — the SSH
# session stays open for the whole build+restart+status, output streams
# live to this terminal, and the script only exits once the remote side is
# actually done, with a real, propagated exit code. This is what daily
# development wants: you're watching it anyway, so "detached and immune to
# a dropped connection" isn't worth trading away live visibility for.
#
# --detached mode (Story 66): runs the remote build+restart+status DETACHED
# on the QNAP host (nohup, disowned, survives this SSH session dropping),
# polling over independent short-lived connections for progress instead of
# streaming live. Exists for the one real scenario that motivated it — a
# long `next build` leaving the QNAP too scheduling-starved to answer SSH
# keepalives in time, which once killed the attached session mid-build with
# no way to tell afterward whether the remote side had finished — not the
# default, since that scenario is rare and the UX cost (chunky periodic
# snapshots instead of live output) isn't worth paying every day. Use this
# for a deploy you don't intend to babysit (e.g. a future CI run), or if
# you've actually hit the disconnect bug again.
#
# Usage:
#   ./06_deploy.sh                     # default: attached, live-streamed, blocks until done
#   ./06_deploy.sh --detached          # Story 66 mode: detached + polled
#   ./06_deploy.sh --non-interactive   # hard-fails instead of asking (for automation); combine freely with --detached
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"

NON_INTERACTIVE=0
DETACHED=0
for arg in "$@"; do
  case "$arg" in
    --non-interactive) NON_INTERACTIVE=1 ;;
    --detached) DETACHED=1 ;;
    *) log_warn "Unknown argument: $arg (ignored)" ;;
  esac
done
export NON_INTERACTIVE

load_qnap_ssh_config || exit 1
git_deploy_preflight || exit 1

if [ "$DETACHED" = "1" ]; then
  run_remote "Update repo on QNAP" "cd '$QNAP_REPO_DIR' && git pull --ff-only"
  run_remote_job_with_progress "Deploy QNAP TEST (build + restart + status)" "cd '$QNAP_REPO_DIR' && bash bash-scripts/dashboard/04_qnap_test/06_deploy.sh"
else
  run_remote_script "04_qnap_test" "06_deploy.sh" "Deploy QNAP TEST"
fi
