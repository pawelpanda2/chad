#!/usr/bin/env bash
# Full TEST deployment via GHCR: build+push locally (Mac), then QNAP only
# pulls and restarts — never builds. Analogous to
# bash-scripts/dashboard/06_qnap_test_ssh/06_deploy.sh, except the image is
# produced here instead of on QNAP. Reuses the existing, unmodified
# bash-scripts/dashboard/04_qnap_test/{03_re-start,05_status}.sh for
# everything after the pull (shared-services health check, port handling,
# docker compose up, HTTP wait, status/healthcheck) — not duplicated here.
#
# Flow: git preflight -> build+tag+push to GHCR -> SSH: git pull, docker
# login, docker pull + retag, write tag file, 04_qnap_test/03_re-start.sh,
# 04_qnap_test/05_status.sh.
#
# Usage:
#   ./deploy.sh                    # default: interactive git preflight
#   ./deploy.sh --non-interactive  # hard-fails instead of asking
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
source "$SCRIPT_DIR/config.sh"

NON_INTERACTIVE=0
for arg in "$@"; do
  case "$arg" in
    --non-interactive) NON_INTERACTIVE=1 ;;
    *) log_warn "Unknown argument: $arg (ignored)" ;;
  esac
done
export NON_INTERACTIVE

load_qnap_ssh_config || exit 1
git_deploy_preflight || exit 1

# --- Build + push (local Mac, never QNAP) ---
require_command docker "install Docker" || exit 1
require_file "$REPO_ROOT/.env.local" "cp .env.local.example .env.local and fill in real values (never commit .env.local)" || exit 1
set -a
# shellcheck source=/dev/null
source "$REPO_ROOT/.env.local"
set +a

echo ""
log_info "chad-dashboard — build + push to GHCR"
ghcr_docker_login "$GHCR_REGISTRY" "$GHCR_PUSH_USERNAME" "$GHCR_PUSH_TOKEN" || exit 1
TAG="$(ghcr_build_tag_push)" || exit 1
log_ok "Built and pushed: $(ghcr_image_ref "$TAG")"

# --- Pull + restart + status (QNAP, over SSH) ---
REMOTE_SCRIPT=$(cat <<EOF
set -euo pipefail
cd '$QNAP_REPO_DIR'
REPO_ROOT="$QNAP_REPO_DIR"
source bash-scripts/common/lib.sh
source bash-scripts/dashboard/08_registry_test/config.sh
export DOCKER_CONFIG="\$REPO_ROOT/.runtime/docker-config"
GHCR_READ_USERNAME="\$(read_env_var .env.qnap GHCR_READ_USERNAME)"
GHCR_READ_TOKEN="\$(read_env_var .env.qnap GHCR_READ_TOKEN)"
ghcr_docker_login "\$GHCR_REGISTRY" "\$GHCR_READ_USERNAME" "\$GHCR_READ_TOKEN"
ghcr_pull_and_retag '$TAG'
printf 'IMAGE_TAG=%s\n' '$TAG' > .image-tag.chad-dashboard.env.tmp.\$\$
mv .image-tag.chad-dashboard.env.tmp.\$\$ .image-tag.chad-dashboard.env
bash bash-scripts/dashboard/04_qnap_test/03_re-start.sh
EOF
)

run_remote "Update repo on QNAP" "cd '$QNAP_REPO_DIR' && git pull --ff-only"
run_remote "Pull + restart QNAP TEST (chad-dashboard:$TAG)" "$REMOTE_SCRIPT"
run_remote_script "04_qnap_test" "05_status.sh" "Status QNAP TEST"

echo ""
log_ok "TEST deploy via GHCR complete: chad-dashboard:$TAG"
