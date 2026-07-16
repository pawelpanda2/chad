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
# Usage:
#   ./06_deploy.sh                  # interactive (asks before committing/pushing)
#   ./06_deploy.sh --non-interactive  # hard-fails instead of asking (for automation)
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"

NON_INTERACTIVE=0
if [ "${1:-}" = "--non-interactive" ]; then
  NON_INTERACTIVE=1
fi
export NON_INTERACTIVE

load_qnap_ssh_config || exit 1
git_deploy_preflight || exit 1

run_remote_script "04_qnap_test" "06_deploy.sh" "Deploy QNAP TEST"
