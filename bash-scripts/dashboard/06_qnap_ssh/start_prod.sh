#!/usr/bin/env bash
# SSHes into the QNAP and runs bash-scripts/dashboard/05_qnap_prod/03_begin.sh
# there (idempotent — stops+restarts if already running). Does not build.
# Requires typing PROD to confirm.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

echo ""
log_warn "You are about to (re)start PRODUCTION (${QNAP_SSH_HOST})."
read -r -p "Type 'PROD' to continue: " confirmation
if [ "$confirmation" != "PROD" ]; then
  log_error "Start cancelled."
  exit 1
fi

run_remote_script "05_qnap_prod" "03_begin.sh" "Start QNAP PROD"
