#!/usr/bin/env bash
# Starts the local Mac stack (mongo + dashboard) under docker-compose.
# Never builds. Idempotent: checks whether the stack is already running; if
# so, calls 04_end.sh (docker compose down --remove-orphans, never -v) then
# starts fresh. Use 06_deploy.sh for build+restart.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
source "$SCRIPT_DIR/01_config.sh"

require_command docker "install Docker" || exit 1
require_file "$ENV_FILE" "cp .env.local.example .env.local and fill in real values" || exit 1

echo ""
log_info "chad local-mac-docker — restart"
echo ""

cd "$REPO_ROOT"

# No `:latest` fallback — refuses to start without a recorded release tag.
require_image_tag "$(dashboard_image_tag_file)" "chad-dashboard" || exit 1

if docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps --format json 2>/dev/null | grep -q '"State":"running"'; then
  log_warn "chad-local stack is already running — stopping it first, then starting fresh."
  bash "$SCRIPT_DIR/04_end.sh"
fi

# Preflight: free up all ports this stack needs — Docker container (from
# another compose project, or a manual `docker run`) OR plain process (e.g.
# a stray `next dev`/`pnpm` from the 02_local_mac_tmux flow). Ports come
# from 01_config.sh, never hardcoded here, so there's one place to change
# them. 90_port-kill.sh (not ensure_port_available directly) does the actual
# freeing — it's the same "official script" other flows call too, see that
# file for exactly how it decides Docker-stop-and-remove vs
# SIGTERM-then-SIGKILL. Once every port is confirmed free, only THEN is the
# stack started.
REQUIRED_PORTS=("$DASHBOARD_PORT" "$MONGODB_PORT")

log_info "Freeing required ports before starting: ${REQUIRED_PORTS[*]}"
for port in "${REQUIRED_PORTS[@]}"; do
  bash "$SCRIPT_DIR/90_port-kill.sh" "$port" || exit 1
done

log_info "Re-checking port availability before starting the stack..."
for port in "${REQUIRED_PORTS[@]}"; do
  ensure_port_available "$port" || exit 1
done

docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d

log_info "Waiting for dashboard to respond..."
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null -m 3 "http://localhost:$DASHBOARD_PORT" 2>/dev/null; then
    break
  fi
  sleep 2
done

echo ""
log_ok "chad-local stack is up."
log_info "Dashboard: http://localhost:$DASHBOARD_PORT"
