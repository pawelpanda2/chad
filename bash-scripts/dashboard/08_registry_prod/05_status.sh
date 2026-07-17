#!/usr/bin/env bash
# SSHes into the QNAP and runs bash-scripts/dashboard/05_qnap_prod/05_status.sh
# there. Read-only, no confirmation needed. Identical to bash-scripts/
# dashboard/07_qnap_prod_ssh/05_status.sh (untouched by Story 70).
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
load_qnap_ssh_config || exit 1
run_remote_script "05_qnap_prod" "05_status.sh" "Status QNAP PROD"
