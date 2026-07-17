#!/usr/bin/env bash
# Pulls chad-dashboard from GHCR onto the QNAP host and restarts QNAP TEST
# with it. Never builds — run 02_build.sh first (locally, or via GitHub
# Actions) to actually produce a new tag; this script only ever deploys an
# already-pushed one.
#
# Usage:
#   ./03_restart.sh                # deploys whatever 02_build.sh last recorded
#   ./03_restart.sh <tag>          # deploys an explicit tag (e.g. for rollback)
#
# What runs on QNAP (all inside ONE ssh session, streamed live — see
# bash-scripts/common/lib.sh's run_remote): docker login to GHCR (read-only
# token), docker pull, local re-tag to the bare chad-dashboard:<tag> name
# 04_qnap_test/03_restart.sh already expects, record the tag, then the
# existing, UNCHANGED 04_qnap_test/03_restart.sh (which already checks
# shared mongo/content-provider-api health, frees the port, waits for HTTP)
# — reused, not duplicated.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
source "$SCRIPT_DIR/01_config.sh"

TAG="${1:-}"
if [ -z "$TAG" ]; then
  require_image_tag "$(dashboard_image_tag_file)" "chad-dashboard" || exit 1
  TAG="$IMAGE_TAG"
fi

load_qnap_ssh_config || exit 1

echo ""
log_info "Deploying chad-dashboard:$TAG to QNAP TEST via GHCR"
echo ""

REMOTE_SCRIPT=$(cat <<EOF
set -euo pipefail
cd '$QNAP_REPO_DIR'
REPO_ROOT="$QNAP_REPO_DIR"
source bash-scripts/common/lib.sh
source bash-scripts/dashboard/09_registry_test/01_config.sh
set -a
source .env.qnap
set +a
ghcr_docker_login "\$GHCR_REGISTRY" "\$GHCR_READ_USERNAME" "\$GHCR_READ_TOKEN"
ghcr_pull_and_retag '$TAG'
printf 'IMAGE_TAG=%s\n' '$TAG' > .image-tag.chad-dashboard.env.tmp.\$\$
mv .image-tag.chad-dashboard.env.tmp.\$\$ .image-tag.chad-dashboard.env
bash bash-scripts/dashboard/04_qnap_test/03_restart.sh
EOF
)

run_remote "Pull + restart QNAP TEST (chad-dashboard:$TAG)" "$REMOTE_SCRIPT"
