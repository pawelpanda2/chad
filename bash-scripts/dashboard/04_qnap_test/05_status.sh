#!/usr/bin/env bash
# Shows container status + health for the QNAP TEST docker-compose stack.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"

COMPOSE_PROJECT_NAME="chad-test"
ENV_NAME="test"
DASHBOARD_PORT=12025
CONTENT_PROVIDER_API_PORT=12024
MONGODB_PORT=27018
COMPOSE_FILE="$REPO_ROOT/docker-compose.qnap.yml"
ENV_FILE="$REPO_ROOT/.env.qnap"

echo ""
log_info "chad QNAP TEST — status"
echo ""

cd "$REPO_ROOT"
export ENV_NAME DASHBOARD_PORT CONTENT_PROVIDER_API_PORT MONGODB_PORT
docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps

echo ""
if curl -fsS -m 3 "http://localhost:12024/health" 2>/dev/null; then
  echo ""
  log_ok "content-provider-api healthy (port 12024)."
else
  echo ""
  log_warn "content-provider-api did NOT respond on port 12024."
fi

echo ""
if curl -fsS -o /dev/null -m 3 -w '%{http_code}' "http://localhost:$DASHBOARD_PORT" 2>/dev/null | grep -qE '^[23]'; then
  log_ok "dashboard responds (port $DASHBOARD_PORT)."
else
  log_warn "dashboard did NOT respond on port $DASHBOARD_PORT."
fi
