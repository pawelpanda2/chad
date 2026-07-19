#!/usr/bin/env bash
# SSHes into the QNAP and runs bash-scripts/dashboard/04_qnap_test/04_end.sh
# there. No confirmation prompt — TEST, though it shares data with PROD, is
# always safe to stop (never touches the shared mongo stack, never deletes
# data).
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
load_qnap_ssh_config || exit 1
run_remote_script "04_qnap_test" "04_end.sh" "End QNAP TEST"
