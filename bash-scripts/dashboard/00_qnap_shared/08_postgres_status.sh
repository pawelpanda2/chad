#!/usr/bin/env bash
# Story 81 — read-only status for chad-postgres only. Never changes state.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
source "$SCRIPT_DIR/01_config.sh"

echo ""
log_info "chad QNAP SHARED — postgres status"
echo ""

cd "$REPO_ROOT"
docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps postgres

echo ""
state="$(docker inspect -f '{{.State.Health.Status}}' chad-postgres 2>/dev/null || true)"
if [ "$state" = "healthy" ]; then
  log_ok "chad-postgres healthy."
else
  log_warn "chad-postgres state: ${state:-not found}."
fi

echo ""
log_info "pg_isready:"
POSTGRES_USER="$(read_env_var "$ENV_FILE" POSTGRES_USER)"
POSTGRES_DB="$(read_env_var "$ENV_FILE" POSTGRES_DB)"
docker exec chad-postgres pg_isready -U "${POSTGRES_USER:-chad}" -d "${POSTGRES_DB:-chad}" || true

echo ""
log_info "Applied migrations (schema_migrations table):"
docker exec chad-postgres psql -U "${POSTGRES_USER:-chad}" -d "${POSTGRES_DB:-chad}" -c \
  "SELECT version, applied_at FROM schema_migrations ORDER BY version;" 2>&1 || log_warn "schema_migrations not queryable yet (migrations not applied?)."
