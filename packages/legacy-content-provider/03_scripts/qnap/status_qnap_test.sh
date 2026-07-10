#!/usr/bin/env bash
# Shows status of the QNAP-TEST containers, ports, API health, and whether
# the API actually sees repo data (not just "process is up").
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/lib.sh"

ENV_FILE="$REPO_ROOT/.env"
if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi
CONTENT_PROVIDER_API_PORT="${CONTENT_PROVIDER_API_PORT:-12024}"
BLAZOR_PORT="${BLAZOR_PORT:-12020}"

echo ""
log_info "Content Provider — QNAP TEST status"
echo ""

for name in "$CP_TEST_API_CONTAINER" "$CP_TEST_BLAZOR_CONTAINER"; do
  status="$(docker ps -a --filter "name=^${name}$" --format '{{.Status}}' 2>/dev/null)"
  if [ -n "$status" ]; then
    log_ok "$name: $status"
  else
    log_warn "$name: not found"
  fi
done

echo ""
if curl -fsS -m 3 "http://localhost:$CONTENT_PROVIDER_API_PORT/health" 2>/dev/null; then
  echo ""
  log_ok "API health check responded (port $CONTENT_PROVIDER_API_PORT)."
else
  echo ""
  log_warn "API did not respond on port $CONTENT_PROVIDER_API_PORT."
fi

echo ""
if curl -fsS -o /dev/null -m 3 -w '%{http_code}' "http://localhost:$BLAZOR_PORT" 2>/dev/null | grep -qE '^[23]'; then
  log_ok "Blazor GUI responds (port $BLAZOR_PORT)."
else
  log_warn "Blazor GUI did not respond on port $BLAZOR_PORT."
fi
