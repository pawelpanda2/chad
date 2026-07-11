#!/usr/bin/env bash
# Builds the full local Mac stack (mongo + content-provider-api + dashboard)
# under docker-compose. Only builds — does not start anything. See
# 02_start.sh (start, idempotent) / 03_end.sh (stop) / 05_status.sh /
# 04_deploy.sh (build + begin, one shot).
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"

COMPOSE_PROJECT_NAME="chad-local"
COMPOSE_FILE="$REPO_ROOT/docker-compose.local-mac-docker.yml"
ENV_FILE="$REPO_ROOT/.env.local"

require_command docker "install Docker" || exit 1
require_file "$ENV_FILE" "cp .env.local.example .env.local and fill in real values (never commit .env.local)" || exit 1

echo ""
log_info "chad local-mac-docker — build"
echo ""

cd "$REPO_ROOT"

# Plain date+time tag (no environment/arch suffix) — environment is already
# distinguished by compose project name, ports, and container names, not by
# the image tag. Every build gets both :latest and this timestamp tag.
IMAGE_TAG="$(date +'%y%m%d_%H%M%S')"
export IMAGE_TAG

docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build --pull

docker tag "chad-dashboard:$IMAGE_TAG" "chad-dashboard:latest"
docker tag "chad-content-provider-api:$IMAGE_TAG" "chad-content-provider-api:latest"

log_ok "Images built and tagged: latest, $IMAGE_TAG"
