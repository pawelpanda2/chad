#!/usr/bin/env bash
# Starts the full local Mac stack (mongo + content-provider-api + dashboard)
# under docker-compose. Idempotent: if already running, stops it first (via
# 03_end.sh) then starts fresh — matches the same convention already proven
# in packages/net-content-provider/03_scripts/qnap/begin_qnap_test.sh. Does
# NOT build — run 01_build.sh first, or use 04_deploy.sh for build+begin.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"

COMPOSE_PROJECT_NAME="chad-local"
DASHBOARD_PORT=12020
COMPOSE_FILE="$REPO_ROOT/docker-compose.local-mac-docker.yml"
ENV_FILE="$REPO_ROOT/.env.local"

require_command docker "install Docker" || exit 1
require_file "$ENV_FILE" "cp .env.local.example .env.local and fill in real values" || exit 1

echo ""
log_info "chad local-mac-docker — begin"
echo ""

cd "$REPO_ROOT"
export DASHBOARD_PORT

if docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps --format json 2>/dev/null | grep -q '"Running":true'; then
  log_warn "chad-local stack is already running — stopping it first, then starting fresh."
  bash "$SCRIPT_DIR/03_end.sh"
fi

docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d

log_info "Waiting for content-provider-api health..."
HEALTHY=false
for _ in $(seq 1 30); do
  if curl -fsS -m 3 "http://localhost:12024/health" >/dev/null 2>&1; then
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

HEALTH_JSON="$(curl -fsS -m 3 "http://localhost:12024/health")"
log_ok "content-provider-api healthy: $HEALTH_JSON"

if ! echo "$HEALTH_JSON" | grep -q '"anyRepoFound":true'; then
  log_error "content-provider-api is up but reports no repos found. Check CP_REPOS_HOST_PATH in .env.local."
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
log_ok "chad-local stack is up."
log_info "Dashboard:            http://localhost:$DASHBOARD_PORT"
log_info "Content Provider API: http://localhost:12024/health"
