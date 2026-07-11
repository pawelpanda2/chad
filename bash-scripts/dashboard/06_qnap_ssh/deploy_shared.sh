#!/usr/bin/env bash
# SSHes into the QNAP and runs bash-scripts/dashboard/00_qnap_shared/06_deploy.sh
# there (build + begin + status).
#
# WARNING: this rebuilds/restarts MongoDB + Content Provider API shared by
# BOTH TEST and PROD dashboards.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

log_warn "This rebuilds/restarts MongoDB + Content Provider API shared by BOTH TEST and PROD dashboards."
read -r -p "Type 'SHARED' to continue: " confirmation
if [ "$confirmation" != "SHARED" ]; then
  log_error "Deploy cancelled."
  exit 1
fi

run_remote_script "00_qnap_shared" "06_deploy.sh" "Deploy QNAP SHARED"
