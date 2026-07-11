#!/usr/bin/env bash
# SSHes into the QNAP and runs bash-scripts/dashboard/00_qnap_shared/05_status.sh
# there. Read-only, no confirmation needed.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"
run_remote_script "00_qnap_shared" "05_status.sh" "Status QNAP SHARED"
