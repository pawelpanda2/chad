#!/usr/bin/env bash
# SSHes into the QNAP and runs bash-scripts/dashboard/05_qnap_prod/03_re-start.sh
# there (idempotent — stops+restarts if already running). Does not build.
# Refuses to start unless shared services (mongo + content-provider-api)
# are already up and healthy — see bash-scripts/dashboard/06_qnap_ssh/
# begin_shared.sh. Requires typing PROD to confirm.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

echo ""
log_warn "You are about to (re)start PRODUCTION (${QNAP_SSH_HOST})."
read -r -p "Type 'PROD' to continue: " confirmation
if [ "$confirmation" != "PROD" ]; then
  log_error "Re-start cancelled."
  exit 1
fi

run_remote_script "05_qnap_prod" "03_re-start.sh" "Re-start QNAP PROD"
