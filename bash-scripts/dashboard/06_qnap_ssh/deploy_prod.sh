#!/usr/bin/env bash
# SSHes into the QNAP and runs bash-scripts/dashboard/05_qnap_prod/04_deploy.sh
# there. Requires typing PROD to confirm — this is a real production
# deployment, not a drill.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

echo ""
log_warn "You are about to deploy to PRODUCTION (${QNAP_SSH_HOST})."
read -r -p "Type 'PROD' to continue: " confirmation
if [ "$confirmation" != "PROD" ]; then
  log_error "Deploy cancelled."
  exit 1
fi

run_remote_script "05_qnap_prod" "04_deploy.sh" "Deploy QNAP PROD"
