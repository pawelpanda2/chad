#!/usr/bin/env bash
# Starts the QNAP TEST dashboard under docker-compose. Never builds. Never
# starts/stops/rebuilds the shared mongo stack — only checks it's already
# healthy (require_shared_services_healthy) and refuses to start otherwise.
# Idempotent: checks whether the dashboard is already running; if so, calls
# 04_end.sh then starts fresh. Use 06_deploy.sh for build+restart. Run this
# ON the QNAP host (or via
# bash-scripts/dashboard/06_qnap_test_ssh/03_restart.sh from your Mac).
#
# TEST uses the SAME shared MongoDB (and therefore the SAME live data) as
# PROD — it is an alternative UI, not an isolated data environment.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
source "$SCRIPT_DIR/01_config.sh"

require_command docker "install Docker" || exit 1
require_file "$ENV_FILE" "cp .env.qnap.example .env.qnap and fill in real values" || exit 1

echo ""
log_info "chad QNAP TEST — restart"
echo ""

cd "$REPO_ROOT"

require_shared_services_healthy || {
  log_error "Shared services (mongo) are not healthy — refusing to start TEST dashboard."
  exit 1
}

# No `:latest` fallback — refuses to start without a recorded release tag.
# Same tag-record file as 05_qnap_prod, so TEST and PROD deploy the exact
# same image once it's been built (see 02_build.sh).
require_image_tag "$(dashboard_image_tag_file)" "chad-dashboard" || exit 1

if docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps --format json 2>/dev/null | grep -q '"State":"running"'; then
  log_warn "chad-test stack is already running — stopping it first, then starting fresh."
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
log_ok "chad-test dashboard is up."
log_info "Dashboard: http://<QNAP-IP>:$DASHBOARD_PORT"
