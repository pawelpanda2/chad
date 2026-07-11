#!/usr/bin/env bash
# SSHes into the QNAP and runs bash-scripts/dashboard/04_qnap_test/03_begin.sh
# there (idempotent — stops+restarts if already running). Does not build.
# Refuses to start unless shared services (mongo + content-provider-api)
# are already up and healthy — see bash-scripts/dashboard/06_qnap_ssh/
# begin_shared.sh.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"
run_remote_script "04_qnap_test" "03_begin.sh" "Begin QNAP TEST"
