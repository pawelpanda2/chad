#!/usr/bin/env bash
# Full TEST deployment via GHCR (Story 70) — the new primary entry point,
# replacing bash-scripts/dashboard/06_qnap_test_ssh/06_deploy.sh's old role
# (that script is now disabled; QNAP no longer builds anything, see
# docker-compose.qnap.test.yml).
#
# Flow: git preflight (local) → build + push to GHCR (local, 02_build.sh)
# → pull + restart on QNAP over SSH (03_restart.sh, which reuses the
# existing, unchanged 04_qnap_test/03_restart.sh for the actual restart +
# shared-services healthcheck + HTTP wait) → status (05_status.sh).
#
# Same git preflight as before (uncommitted changes / unpushed commits
# warning) — arguably even more relevant now, since the image is built
# directly from whatever is on this Mac's disk.
#
# Usage:
#   ./06_deploy.sh                   # interactive (asks before committing/pushing)
#   ./06_deploy.sh --non-interactive   # hard-fails instead of asking (for automation)
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"

NON_INTERACTIVE=0
if [ "${1:-}" = "--non-interactive" ]; then
  NON_INTERACTIVE=1
fi
export NON_INTERACTIVE

load_qnap_ssh_config || exit 1
git_deploy_preflight || exit 1

bash "$SCRIPT_DIR/02_build.sh"
bash "$SCRIPT_DIR/03_restart.sh"
bash "$SCRIPT_DIR/05_status.sh"
