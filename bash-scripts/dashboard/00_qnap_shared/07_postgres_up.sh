#!/usr/bin/env bash
# Story 81 — starts ONLY the `postgres` service from the QNAP SHARED stack,
# via a scoped `docker compose ... up -d postgres`. Deliberately does NOT
# call 03_re-start.sh (that stops+restarts the WHOLE shared stack, briefly
# interrupting chad-mongodb/beeper-mongodb for both TEST and PROD — see
# that script's own warning). A scoped `up -d <service>` only ever creates/
# starts the named service; Docker Compose does not touch other already-
# running containers in the same project unless their own definition
# changed. Idempotent — safe to re-run; a healthy, up-to-date postgres
# container is left alone.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
source "$SCRIPT_DIR/01_config.sh"

require_command docker "install Docker" || exit 1
require_file "$ENV_FILE" "cp .env.qnap.example .env.qnap and fill in real values" || exit 1

echo ""
log_info "chad QNAP SHARED — postgres up (selective, does not touch mongo)"
echo ""

cd "$REPO_ROOT"

# Preflight: same tmpfs-vs-real-volume tripwire as mongo's own start script,
# scoped to ONLY the postgres data directory — never touches
# chad-shared/mongodb or chad-shared/beeper-mongodb.
QNAP_CONTAINER_DATA_PATH="$(read_env_var "$ENV_FILE" QNAP_CONTAINER_DATA_PATH)"
QNAP_CONTAINER_DATA_PATH="${QNAP_CONTAINER_DATA_PATH:-/share/ContainerData}"
require_data_path_writable "$QNAP_CONTAINER_DATA_PATH/chad-shared/postgres" || exit 1
mkdir -p \
  "$QNAP_CONTAINER_DATA_PATH/chad-shared/postgres/db" \
  "$QNAP_CONTAINER_DATA_PATH/chad-shared/postgres/backups"

ensure_docker_network chad-shared

docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d postgres

log_info "Waiting for PostgreSQL health..."
PG_HEALTHY=false
for _ in $(seq 1 30); do
  state="$(docker inspect -f '{{.State.Health.Status}}' chad-postgres 2>/dev/null || true)"
  if [ "$state" = "healthy" ]; then
    PG_HEALTHY=true
    break
  fi
  sleep 2
done

if [ "$PG_HEALTHY" != true ]; then
  log_error "chad-postgres did not become healthy in time."
  log_error "  Check: docker compose -p $COMPOSE_PROJECT_NAME -f $COMPOSE_FILE logs postgres"
  exit 1
fi
log_ok "chad-postgres healthy."

# Confirm the two Mongo containers were NOT touched by this — their start
# time should be unchanged (this script never issues any command against
# them). Purely informational, not a hard failure if they happen to be
# down for an unrelated reason.
mongo_started="$(docker inspect -f '{{.State.StartedAt}}' chad-mongodb 2>/dev/null || echo "not found")"
beeper_started="$(docker inspect -f '{{.State.StartedAt}}' beeper-mongodb 2>/dev/null || echo "not found")"
log_info "chad-mongodb StartedAt (should be unchanged by this script): $mongo_started"
log_info "beeper-mongodb StartedAt (should be unchanged by this script): $beeper_started"

echo ""
log_ok "chad-postgres is up."
log_info "Postgres: chad-postgres:5432 on the chad-shared network, also published on the QNAP host's port 12042 (Tailscale-reachable)"
