#!/usr/bin/env bash
# Stops the local Mac stack (mongo + content-provider-api + dashboard).
# Only ever touches the chad-local compose project — never production,
# never QNAP, never unrelated containers. --remove-orphans only, never -v:
# never deletes the mongo/dashboard data volumes.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"

COMPOSE_PROJECT_NAME="chad-local"
COMPOSE_FILE="$REPO_ROOT/docker-compose.local-mac-docker.yml"
ENV_FILE="$REPO_ROOT/.env.local"

require_command docker "install Docker" || exit 1

echo ""
log_info "chad local-mac-docker — end"
echo ""

cd "$REPO_ROOT"
docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" down --remove-orphans

log_ok "chad-local stack stopped. Data volumes preserved."
