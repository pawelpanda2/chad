#!/usr/bin/env bash
# SSHes into the QNAP and runs bash-scripts/dashboard/05_qnap_prod/04_end.sh
# there. No confirmation prompt — stopping is always safe to reverse via
# start_prod.sh, and never deletes data (docker compose down --remove-orphans
# only, no -v).
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"
run_remote_script "05_qnap_prod" "04_end.sh" "End QNAP PROD"
