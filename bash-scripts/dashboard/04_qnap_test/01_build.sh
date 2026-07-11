#!/usr/bin/env bash
# Builds the full QNAP TEST stack (mongo + content-provider-api + dashboard)
# under docker-compose. Only builds — does not start anything. See
# 02_start.sh (start, idempotent) / 03_end.sh (stop) / 05_status.sh /
# 04_deploy.sh (build + start, one shot). Run this ON the QNAP host (or via
# bash-scripts/dashboard/06_qnap_ssh/deploy_test.sh from your Mac).
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"

COMPOSE_PROJECT_NAME="chad-test"
COMPOSE_FILE="$REPO_ROOT/docker-compose.qnap-test.yml"
ENV_FILE="$REPO_ROOT/.env.qnap"

require_command docker "install Docker" || exit 1
require_file "$ENV_FILE" "cp .env.qnap.example .env.qnap and fill in real values (never commit .env.qnap)" || exit 1

echo ""
log_info "chad QNAP TEST — build"
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
