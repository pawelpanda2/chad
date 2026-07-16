#!/usr/bin/env bash
# Builds the QNAP TEST dashboard image only. Never runs containers, never
# touches a running environment, never builds/touches the shared mongo/
# content-provider-api stack (see bash-scripts/dashboard/00_qnap_shared/).
# Run this ON the QNAP host (or via
# bash-scripts/dashboard/06_qnap_test_ssh/06_deploy.sh from your Mac).
#
# This is now the ONLY place chad-dashboard is ever built (Story 63 removed
# 05_qnap_prod/02_build.sh — PROD never builds independently, it only ever
# promotes this exact image via 07_qnap_prod_ssh/06_last_from_test.sh).
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
source "$SCRIPT_DIR/01_config.sh"

require_command docker "install Docker" || exit 1
require_file "$ENV_FILE" "cp .env.qnap.example .env.qnap and fill in real values (never commit .env.qnap)" || exit 1

echo ""
log_info "chad QNAP TEST — build"
echo ""

cd "$REPO_ROOT"

# Plain date+time tag (no environment/arch suffix) — environment is already
# distinguished by compose project name, ports, and container names, not by
# the image tag. Own CHAD images never get a `:latest` tag (see
# documentation/ai-docs/deploy/image-tagging-standard.md) — this is the ONLY
# tag this build produces. TEST and PROD share ONE canonical tag-record file
# for chad-dashboard: TEST builds it here, PROD only ever promotes this exact
# image via 07_qnap_prod_ssh/06_last_from_test.sh — never a second build.
IMAGE_TAG="$(date +'%y%m%d_%H%M%S')"
export IMAGE_TAG

# Records the exact commit this image was built from, as a standard OCI
# label (see docker-compose.qnap.test.yml's build.labels) — read back by
# 07_qnap_prod_ssh/06_last_from_test.sh before promoting to PROD (Story 63).
GIT_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
export GIT_SHA

docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build --pull

# Only reached if `build` succeeded (set -e) — never records a tag for a
# failed build.
write_image_tag "$(dashboard_image_tag_file)" "$IMAGE_TAG"

log_ok "Image built: chad-dashboard:$IMAGE_TAG (commit $GIT_SHA)"
