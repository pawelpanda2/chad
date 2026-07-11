#!/usr/bin/env bash
# SSHes into the QNAP and runs bash-scripts/dashboard/00_qnap_shared/04_end.sh
# there.
#
# WARNING: stopping shared services takes down the backend for BOTH
# chad-dashboard-test and chad-dashboard-prod.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

log_warn "This stops MongoDB + Content Provider API shared by BOTH TEST and PROD dashboards."
read -r -p "Type 'SHARED' to continue: " confirmation
if [ "$confirmation" != "SHARED" ]; then
  log_error "End cancelled."
  exit 1
fi

run_remote_script "00_qnap_shared" "04_end.sh" "End QNAP SHARED"
