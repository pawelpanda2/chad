#!/usr/bin/env bash
# SSHes into the QNAP and runs bash-scripts/dashboard/04_qnap_test/04_end.sh
# there. Thin passthrough — identical to bash-scripts/dashboard/
# 06_qnap_test_ssh/04_end.sh (that one still works fine and is untouched by
# Story 70; this one exists so 09_registry_test is a complete, self-
# contained TEST-via-GHCR toolkit without needing to jump to a sibling
# directory for stop/status).
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
load_qnap_ssh_config || exit 1
run_remote_script "04_qnap_test" "04_end.sh" "End QNAP TEST"
