#!/usr/bin/env bash
# Stops the QNAP TEST stack (mongo + content-provider-api + dashboard).
# Only ever touches the chad-test compose project — never prod, never
# local-mac. --remove-orphans only, never -v: never deletes the mongo/
# dashboard data volumes.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"

COMPOSE_PROJECT_NAME="chad-test"
ENV_NAME="test"
COMPOSE_FILE="$REPO_ROOT/docker-compose.qnap.yml"
ENV_FILE="$REPO_ROOT/.env.qnap"

require_command docker "install Docker" || exit 1

echo ""
log_info "chad QNAP TEST — end"
echo ""

cd "$REPO_ROOT"
export ENV_NAME
docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" down --remove-orphans

log_ok "chad-test stack stopped. Data volumes preserved."
