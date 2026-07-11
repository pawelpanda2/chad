#!/usr/bin/env bash
# SSHes into the QNAP and runs bash-scripts/dashboard/04_qnap_test/04_deploy.sh
# there. Does not duplicate deployment logic — just connects, pulls latest,
# and runs the real script.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"
run_remote_script "04_qnap_test" "04_deploy.sh" "Deploy QNAP TEST"
