#!/usr/bin/env bash
# Starts the QNAP PROD dashboard under docker-compose. Never builds. Never
# starts/stops/rebuilds the shared mongo/content-provider-api stack — only
# checks it's already healthy (require_shared_services_healthy) and refuses
# to start otherwise. Idempotent: checks whether the dashboard is already
# running; if so, calls 04_end.sh then starts fresh.
#
# PROD uses the SAME shared MongoDB and Content Provider (and therefore the
# SAME live data) as TEST.
#
# PROD deployment requires separate explicit approval — this script existing
# does not run itself; running it IS the deployment action.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
source "$SCRIPT_DIR/01_config.sh"

require_command docker "install Docker" || exit 1
require_file "$ENV_FILE" "cp .env.qnap.example .env.qnap and fill in real values" || exit 1

echo ""
log_info "chad QNAP PROD — re-start"
echo ""

cd "$REPO_ROOT"

require_shared_services_healthy "$CONTENT_PROVIDER_API_PORT" || {
  log_error "Shared services (mongo + content-provider-api) are not healthy — refusing to start PROD dashboard."
  exit 1
}

# No `:latest` fallback — refuses to start without a recorded release tag.
# Same tag-record file as 04_qnap_test, so this deploys the EXACT same image
# TEST is running, without a second build — that's how a release is promoted.
require_image_tag "$(dashboard_image_tag_file)" "chad-dashboard" || exit 1

if docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps --format json 2>/dev/null | grep -q '"State":"running"'; then
  log_warn "chad-prod stack is already running — stopping it first, then starting fresh."
  bash "$SCRIPT_DIR/04_end.sh"
fi

# Preflight: free up the dashboard port if held by a leftover Docker
# container — never touches a non-Docker process, never a broad docker
# cleanup.
ensure_port_available "$DASHBOARD_PORT" || exit 1

docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d

log_info "Waiting for dashboard to respond..."
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null -m 3 "http://localhost:$DASHBOARD_PORT" 2>/dev/null; then
    break
  fi
  sleep 2
done

echo ""
log_ok "chad-prod dashboard is up."
log_info "Dashboard: http://<QNAP-IP>:$DASHBOARD_PORT"
