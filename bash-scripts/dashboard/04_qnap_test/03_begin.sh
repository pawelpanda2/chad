#!/usr/bin/env bash
# Starts the full QNAP TEST stack (mongo + content-provider-api + dashboard)
# under docker-compose. Never builds. Idempotent: checks whether the stack
# is already running; if so, calls 04_end.sh (docker compose down
# --remove-orphans, never -v) then starts fresh. Use 06_deploy.sh for
# build+begin. Run this ON the QNAP host (or via
# bash-scripts/dashboard/06_qnap_ssh/begin_test.sh from your Mac).
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
source "$SCRIPT_DIR/01_config.sh"

require_command docker "install Docker" || exit 1
require_file "$ENV_FILE" "cp .env.qnap.example .env.qnap and fill in real values" || exit 1

echo ""
log_info "chad QNAP TEST — begin"
echo ""

cd "$REPO_ROOT"

write_content_provider_appsettings

if docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps --format json 2>/dev/null | grep -q '"State":"running"'; then
  log_warn "chad-test stack is already running — stopping it first, then starting fresh."
  bash "$SCRIPT_DIR/04_end.sh"
fi

docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d

log_info "Waiting for content-provider-api health..."
HEALTHY=false
for _ in $(seq 1 30); do
  if curl -fsS -m 3 "http://localhost:$CONTENT_PROVIDER_API_PORT/health" >/dev/null 2>&1; then
    HEALTHY=true
    break
  fi
  sleep 2
done

if [ "$HEALTHY" != true ]; then
  log_error "content-provider-api did not become healthy in time."
  log_error "  Check: docker compose -p $COMPOSE_PROJECT_NAME -f $COMPOSE_FILE logs content-provider-api"
  exit 1
fi

HEALTH_JSON="$(curl -fsS -m 3 "http://localhost:$CONTENT_PROVIDER_API_PORT/health")"
log_ok "content-provider-api healthy: $HEALTH_JSON"

if ! echo "$HEALTH_JSON" | grep -q '"anyRepoFound":true'; then
  log_error "content-provider-api is up but reports no repos found. Check CP_REPOS_HOST_PATH in .env.qnap."
  exit 1
fi

log_info "Waiting for dashboard to respond..."
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null -m 3 "http://localhost:$DASHBOARD_PORT" 2>/dev/null; then
    break
  fi
  sleep 2
done

echo ""
log_ok "chad-test stack is up."
log_info "Dashboard:            http://<QNAP-IP>:$DASHBOARD_PORT"
log_info "Content Provider API: http://<QNAP-IP>:$CONTENT_PROVIDER_API_PORT/health"
