#!/usr/bin/env bash
# SSHes into the QNAP and runs bash-scripts/dashboard/05_qnap_prod/03_restart.sh
# there (idempotent — stops+restarts if already running, from whatever
# image tag is currently recorded). Does not pull, does not build — see
# 06_last_from_test.sh for how PROD gets a new version at all. Requires
# typing PROD to confirm. Identical to bash-scripts/dashboard/
# 07_qnap_prod_ssh/03_restart.sh (untouched by Story 70 — kept here too so
# 08_registry_prod is a complete, self-contained PROD-via-GHCR toolkit).
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
load_qnap_ssh_config || exit 1

echo ""
log_warn "You are about to (re)start PRODUCTION (${QNAP_SSH_HOST})."
read -r -p "Type 'PROD' to continue: " confirmation
if [ "$confirmation" != "PROD" ]; then
  log_error "Restart cancelled."
  exit 1
fi

run_remote_script "05_qnap_prod" "03_restart.sh" "Restart QNAP PROD"
