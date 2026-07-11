#!/usr/bin/env bash
# Builds the QNAP PROD dashboard image only. Never runs containers, never
# touches a running environment, never builds/touches the shared mongo/
# content-provider-api stack (see bash-scripts/dashboard/00_qnap_shared/).
# PROD deployment requires separate explicit approval — building images
# does not deploy anything by itself. See 03_begin.sh / 04_end.sh /
# 05_status.sh / 06_deploy.sh.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
source "$SCRIPT_DIR/01_config.sh"

require_command docker "install Docker" || exit 1
require_file "$ENV_FILE" "cp .env.qnap.example .env.qnap and fill in real values (never commit .env.qnap)" || exit 1

echo ""
log_info "chad QNAP PROD — build"
echo ""

cd "$REPO_ROOT"

# Plain date+time tag (no environment/arch suffix) — environment is already
# distinguished by compose project name, ports, and container names, not by
# the image tag. Every build gets both :latest and this timestamp tag.
IMAGE_TAG="$(date +'%y%m%d_%H%M%S')"
export IMAGE_TAG

docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build --pull

docker tag "chad-dashboard:$IMAGE_TAG" "chad-dashboard:latest"

log_ok "Image built and tagged: latest, $IMAGE_TAG"
