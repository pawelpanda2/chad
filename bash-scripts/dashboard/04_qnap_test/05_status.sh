#!/usr/bin/env bash
# Shows container status + health for the QNAP TEST dashboard ONLY. For
# shared mongo status, see
# bash-scripts/dashboard/00_qnap_shared/05_status.sh. Never changes state.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
source "$SCRIPT_DIR/01_config.sh"

echo ""
log_info "chad QNAP TEST — status"
echo ""

cd "$REPO_ROOT"
# `ps` still needs the compose file's `image:` field to interpolate, but
# doesn't need a real tag (never pulls/runs it) — use the recorded tag if
# present, otherwise a harmless placeholder (see image_tag_for_readonly).
export IMAGE_TAG="$(image_tag_for_readonly "$(dashboard_image_tag_file)")"
docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps

echo ""
if curl -fsS -o /dev/null -m 3 -w '%{http_code}' "http://localhost:$DASHBOARD_PORT" 2>/dev/null | grep -qE '^[23]'; then
  log_ok "dashboard responds (port $DASHBOARD_PORT)."
else
  log_warn "dashboard did NOT respond on port $DASHBOARD_PORT."
fi

echo ""
log_info "(Shared mongo status: bash bash-scripts/dashboard/00_qnap_shared/05_status.sh)"
