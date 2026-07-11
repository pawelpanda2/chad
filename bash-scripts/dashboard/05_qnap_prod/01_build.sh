#!/usr/bin/env bash
# Builds the full QNAP PROD stack (mongo + content-provider-api + dashboard)
# under docker-compose. Only builds — does not start anything. PROD
# deployment requires separate explicit approval — building images does not
# deploy anything by itself. See 02_start.sh / 03_end.sh / 05_status.sh /
# 04_deploy.sh.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"

COMPOSE_PROJECT_NAME="chad-prod"
ENV_NAME="prod"
COMPOSE_FILE="$REPO_ROOT/docker-compose.qnap.yml"
ENV_FILE="$REPO_ROOT/.env.qnap"

require_command docker "install Docker" || exit 1
require_file "$ENV_FILE" "cp .env.qnap.example .env.qnap and fill in real values (never commit .env.qnap)" || exit 1

echo ""
log_info "chad QNAP PROD — build"
echo ""

cd "$REPO_ROOT"
export ENV_NAME

# Plain date+time tag (no environment/arch suffix) — environment is already
# distinguished by compose project name, ports, and container names, not by
# the image tag. Every build gets both :latest and this timestamp tag.
IMAGE_TAG="$(date +'%y%m%d_%H%M%S')"
export IMAGE_TAG

docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build --pull

docker tag "chad-dashboard:$IMAGE_TAG" "chad-dashboard:latest"
docker tag "chad-content-provider-api:$IMAGE_TAG" "chad-content-provider-api:latest"

log_ok "Images built and tagged: latest, $IMAGE_TAG"
