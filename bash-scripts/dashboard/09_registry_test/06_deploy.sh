#!/usr/bin/env bash
# Full TEST deployment via GHCR (Story 70).
#
# This is an additional registry-based deployment path. It runs in parallel
# with the existing QNAP TEST deployment scripts and does not disable,
# replace, or redirect them.
#
# Flow:
#   git preflight (local)
#   → build + push to GHCR (local, 02_build.sh)
#   → pull + restart on QNAP over SSH (03_restart.sh)
#   → status (05_status.sh)
#
# The preflight checks only the main CHAD repository. Dirty or untracked
# files inside Git submodules are intentionally ignored. A changed submodule
# pointer recorded by the main CHAD repository is still treated as a real
# main-repository change.
#
# Usage:
#   ./06_deploy.sh
#   ./06_deploy.sh --non-interactive
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"

NON_INTERACTIVE=0

for arg in "$@"; do
  case "$arg" in
    --non-interactive)
      NON_INTERACTIVE=1
      ;;
    *)
      log_warn "Unknown argument: $arg (ignored)"
      ;;
  esac
done

export NON_INTERACTIVE

load_qnap_ssh_config || exit 1

# Temporary Git configuration for this process and all child commands.
# Ignore dirty/untracked content inside submodules while preserving detection
# of changed submodule commits (gitlinks) in the main CHAD repository.
#
# This does not modify `.git/config`.
export GIT_CONFIG_COUNT=1
export GIT_CONFIG_KEY_0="diff.ignoreSubmodules"
export GIT_CONFIG_VALUE_0="dirty"

git_deploy_preflight || exit 1

bash "$SCRIPT_DIR/02_build.sh"
bash "$SCRIPT_DIR/03_restart.sh"
bash "$SCRIPT_DIR/05_status.sh"