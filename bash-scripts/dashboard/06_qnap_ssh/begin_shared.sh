#!/usr/bin/env bash
# SSHes into the QNAP and runs bash-scripts/dashboard/00_qnap_shared/03_begin.sh
# there (idempotent — stops+restarts if already running). Does not build.
#
# WARNING: restarting shared services briefly interrupts BOTH
# chad-dashboard-test and chad-dashboard-prod.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

log_warn "This (re)starts MongoDB + Content Provider API shared by BOTH TEST and PROD dashboards."
read -r -p "Type 'SHARED' to continue: " confirmation
if [ "$confirmation" != "SHARED" ]; then
  log_error "Begin cancelled."
  exit 1
fi

run_remote_script "00_qnap_shared" "03_begin.sh" "Begin QNAP SHARED"
