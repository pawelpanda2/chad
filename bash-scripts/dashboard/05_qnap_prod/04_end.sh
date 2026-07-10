#!/usr/bin/env bash
# Stops the QNAP PROD stack (mongo + content-provider-api + dashboard).
# Only ever touches the chad-prod compose project — never test, never
# local-mac. --remove-orphans only, never -v: never deletes the mongo/
# dashboard data volumes. Never removes images.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
source "$SCRIPT_DIR/01_config.sh"

require_command docker "install Docker" || exit 1

echo ""
log_info "chad QNAP PROD — end"
echo ""

cd "$REPO_ROOT"
docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" down --remove-orphans

log_ok "chad-prod stack stopped. Data volumes and images preserved."
