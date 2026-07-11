#!/usr/bin/env bash
# Stops the QNAP TEST dashboard ONLY. Never touches the shared mongo/
# content-provider-api stack, prod, or local-mac. --remove-orphans only,
# never -v: never deletes the dashboard's own data volume. Never removes
# images.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
source "$SCRIPT_DIR/01_config.sh"

require_command docker "install Docker" || exit 1

echo ""
log_info "chad QNAP TEST — end"
echo ""

cd "$REPO_ROOT"
docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" down --remove-orphans

log_ok "chad-test dashboard stopped. Data volume and images preserved. Shared services (mongo/content-provider-api) untouched."
