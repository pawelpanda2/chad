#!/usr/bin/env bash
# SSHes into the QNAP and runs bash-scripts/dashboard/04_qnap_test/03_restart.sh
# there (idempotent — stops+restarts if already running). Does not build.
# Refuses to start unless shared services (mongo) are already up and
# healthy — see bash-scripts/dashboard/00_qnap_shared/.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
load_qnap_ssh_config || exit 1
run_remote_script "04_qnap_test" "03_restart.sh" "Restart QNAP TEST"
