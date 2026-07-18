#!/usr/bin/env bash
# SSHes into the QNAP and runs bash-scripts/dashboard/04_qnap_test/06_deploy.sh
# there (build + restart + status on TEST). Does not duplicate deployment
# logic — just connects, pulls latest, and runs the real script.
#
# The one operation in this repo that builds a new chad-dashboard image from
# current source, so it's the only one gated by a git preflight: refuses to
# proceed if there are uncommitted local changes or unpushed commits.
#
# Dirty/untracked files INSIDE Git submodules are intentionally ignored by
# the preflight. A changed submodule pointer (gitlink) in the main CHAD repo
# is still treated as a real main-repository change.
#
# Default mode: attached/streamed — the SSH session stays open for the whole
# build+restart+status, output streams live to this terminal, and the script
# exits with the remote command's real status.
#
# --detached mode: runs the remote job on QNAP and polls its progress through
# short-lived SSH connections.
#
# Usage:
#   ./06_deploy.sh
#   ./06_deploy.sh --detached
#   ./06_deploy.sh --non-interactive
#   ./06_deploy.sh --non-interactive --detached
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"

NON_INTERACTIVE=0
DETACHED=0

for arg in "$@"; do
  case "$arg" in
    --non-interactive)
      NON_INTERACTIVE=1
      ;;
    --detached)
      DETACHED=1
      ;;
    *)
      log_warn "Unknown argument: $arg (ignored)"
      ;;
  esac
done

export NON_INTERACTIVE

load_qnap_ssh_config || exit 1

# Temporary Git configuration for this process and its child commands.
# Ignore dirty/untracked content inside submodules, while still detecting
# a changed submodule commit recorded by the main CHAD repository.
#
# This does not modify `.git/config`.
export GIT_CONFIG_COUNT=1
export GIT_CONFIG_KEY_0="diff.ignoreSubmodules"
export GIT_CONFIG_VALUE_0="dirty"

git_deploy_preflight || exit 1

if [ "$DETACHED" = "1" ]; then
  run_remote \
    "Update repo on QNAP" \
    "cd '$QNAP_REPO_DIR' && git pull --ff-only"

  run_remote_job_with_progress \
    "Deploy QNAP TEST (build + restart + status)" \
    "cd '$QNAP_REPO_DIR' && bash bash-scripts/dashboard/04_qnap_test/06_deploy.sh"
else
  run_remote_script \
    "04_qnap_test" \
    "06_deploy.sh" \
    "Deploy QNAP TEST"
fi