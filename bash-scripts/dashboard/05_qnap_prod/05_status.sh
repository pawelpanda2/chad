#!/usr/bin/env bash
# Shows container status + health for the QNAP PROD docker-compose stack.
# Never changes state.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
source "$SCRIPT_DIR/01_config.sh"

echo ""
log_info "chad QNAP PROD — status"
echo ""

cd "$REPO_ROOT"
docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps

echo ""
if curl -fsS -m 3 "http://localhost:$CONTENT_PROVIDER_API_PORT/health" 2>/dev/null; then
  echo ""
  log_ok "content-provider-api healthy (port $CONTENT_PROVIDER_API_PORT)."
else
  echo ""
  log_warn "content-provider-api did NOT respond on port $CONTENT_PROVIDER_API_PORT."
fi

echo ""
if curl -fsS -o /dev/null -m 3 -w '%{http_code}' "http://localhost:$DASHBOARD_PORT" 2>/dev/null | grep -qE '^[23]'; then
  log_ok "dashboard responds (port $DASHBOARD_PORT)."
else
  log_warn "dashboard did NOT respond on port $DASHBOARD_PORT."
fi
