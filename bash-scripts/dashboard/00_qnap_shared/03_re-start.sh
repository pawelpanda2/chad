#!/usr/bin/env bash
# Starts the QNAP SHARED stack (mongo) under docker-compose. Never builds.
# Idempotent: checks whether the stack is already running; if so, calls
# 04_end.sh (docker compose down --remove-orphans, never -v) then starts
# fresh. Use 06_deploy.sh for build+restart. Run this directly on the QNAP
# host over SSH — there is no thin SSH wrapper for the shared stack (Story
# 63 deliberately didn't add one; manage it via SSH + these scripts
# directly, same as before).
#
# IMPORTANT: this stack is shared by BOTH chad-dashboard-test and
# chad-dashboard-prod. Restarting it briefly interrupts BOTH dashboards.
# Never called automatically by 04_qnap_test/*.sh or 05_qnap_prod/*.sh.
#
# Content Provider (content-provider-api) removed from this stack — see
# docker-compose.qnap.shared.yml's header comment for the
# reversible-removal note.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
source "$SCRIPT_DIR/01_config.sh"

require_command docker "install Docker" || exit 1
require_file "$ENV_FILE" "cp .env.qnap.example .env.qnap and fill in real values" || exit 1

echo ""
log_info "chad QNAP SHARED — restart (mongo)"
echo ""

cd "$REPO_ROOT"

# No image build/tag to require anymore — mongodb uses a plain upstream
# image (mongo:4.4), and content-provider-api (the only service here that
# needed a recorded release tag) was removed.

# Preflight: QNAP_CONTAINER_DATA_PATH must point at a real, writable volume
# with enough room — NOT a small tmpfs (see documentation/ai-docs/deploy/
# qnap-data-path.md for the real incident this guards against: chad-mongodb
# crash-looping with "No space left on device" because this path resolved
# onto the 16MB /share tmpfs instead of the data volume). Same default as
# docker-compose.qnap.shared.yml so this checks the exact path Compose will
# mount. Also creates the three bind-mount subdirectories Compose expects —
# no manual `mkdir`/`sed` on the QNAP needed.
QNAP_CONTAINER_DATA_PATH="$(read_env_var "$ENV_FILE" QNAP_CONTAINER_DATA_PATH)"
QNAP_CONTAINER_DATA_PATH="${QNAP_CONTAINER_DATA_PATH:-/share/ContainerData}"
require_data_path_writable "$QNAP_CONTAINER_DATA_PATH/chad-shared/mongodb" || exit 1
mkdir -p \
  "$QNAP_CONTAINER_DATA_PATH/chad-shared/mongodb/db" \
  "$QNAP_CONTAINER_DATA_PATH/chad-shared/mongodb/configdb" \
  "$QNAP_CONTAINER_DATA_PATH/chad-shared/mongodb/backups"

# beeper-mongodb (Story 76, 2026-07-22 physical split) — its own volume,
# same tmpfs-vs-real-volume check, own subdirectories. Deliberately no
# keyfile subdirectory (standalone, no replica set).
require_data_path_writable "$QNAP_CONTAINER_DATA_PATH/chad-shared/beeper-mongodb" || exit 1
mkdir -p \
  "$QNAP_CONTAINER_DATA_PATH/chad-shared/beeper-mongodb/db" \
  "$QNAP_CONTAINER_DATA_PATH/chad-shared/beeper-mongodb/configdb" \
  "$QNAP_CONTAINER_DATA_PATH/chad-shared/beeper-mongodb/backups"

ensure_docker_network chad-shared

if docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps --format json 2>/dev/null | grep -q '"State":"running"'; then
  log_warn "chad-shared stack is already running — stopping it first, then starting fresh."
  log_warn "This briefly interrupts BOTH chad-dashboard-test and chad-dashboard-prod."
  bash "$SCRIPT_DIR/04_end.sh"
fi

docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d

log_info "Waiting for MongoDB health..."
MONGO_HEALTHY=false
for _ in $(seq 1 30); do
  state="$(docker inspect -f '{{.State.Health.Status}}' chad-mongodb 2>/dev/null || true)"
  if [ "$state" = "healthy" ]; then
    MONGO_HEALTHY=true
    break
  fi
  sleep 2
done

if [ "$MONGO_HEALTHY" != true ]; then
  log_error "chad-mongodb did not become healthy in time."
  log_error "  Check: docker compose -p $COMPOSE_PROJECT_NAME -f $COMPOSE_FILE logs mongodb"
  exit 1
fi
log_ok "chad-mongodb healthy."

log_info "Waiting for beeper-mongodb health..."
BEEPER_MONGO_HEALTHY=false
for _ in $(seq 1 30); do
  state="$(docker inspect -f '{{.State.Health.Status}}' beeper-mongodb 2>/dev/null || true)"
  if [ "$state" = "healthy" ]; then
    BEEPER_MONGO_HEALTHY=true
    break
  fi
  sleep 2
done

if [ "$BEEPER_MONGO_HEALTHY" != true ]; then
  log_error "beeper-mongodb did not become healthy in time."
  log_error "  Check: docker compose -p $COMPOSE_PROJECT_NAME -f $COMPOSE_FILE logs beeper-mongodb"
  exit 1
fi
log_ok "beeper-mongodb healthy."

echo ""
log_ok "chad-shared stack is up."
log_info "MongoDB: chad-mongodb:27017 on the chad-shared network, also published on the QNAP host's port 12040 (Tailscale-reachable, e.g. MongoDB Compass)"
log_info "Beeper MongoDB: beeper-mongodb:27017 on the chad-shared network, also published on the QNAP host's port 12041 (Tailscale-reachable, standalone, no replica set)"
