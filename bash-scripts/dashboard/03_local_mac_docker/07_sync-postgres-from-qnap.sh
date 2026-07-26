#!/usr/bin/env bash
# Story 89 — pull QNAP Postgres into the local Mac Docker volume (mirror).
# Prefer this (or Dev Panel → "Sync local Postgres from QNAP") over inventing
# fixture trees under pawel_f. Test mutations stay under test3 only.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
source "$SCRIPT_DIR/01_config.sh"

require_command docker "install Docker" || exit 1
require_file "$ENV_FILE" "cp .env.local.example .env.local" || exit 1

POSTGRES_USER="$(read_env_var "$ENV_FILE" POSTGRES_USER)"
POSTGRES_PASSWORD="$(read_env_var "$ENV_FILE" POSTGRES_PASSWORD)"
POSTGRES_DB="$(read_env_var "$ENV_FILE" POSTGRES_DB)"
POSTGRES_QNAP_PASSWORD="$(read_env_var "$ENV_FILE" POSTGRES_QNAP_PASSWORD)"
POSTGRES_USER="${POSTGRES_USER:-chad}"
POSTGRES_DB="${POSTGRES_DB:-chad}"
POSTGRES_QNAP_PASSWORD="${POSTGRES_QNAP_PASSWORD:-$POSTGRES_PASSWORD}"

if [ -z "$POSTGRES_PASSWORD" ] || [ -z "$POSTGRES_QNAP_PASSWORD" ]; then
  log_error "POSTGRES_PASSWORD and POSTGRES_QNAP_PASSWORD required in $ENV_FILE"
  exit 1
fi

if ! docker exec chad-postgres-local-mac-docker pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
  log_error "Local Postgres container not ready — start the stack first (03_re-start.sh)."
  exit 1
fi

log_info "Syncing QNAP Postgres → local volume (this replaces local cp_items/cp_history)..."
(
  cd "$REPO_ROOT"
  pnpm --filter dba build >/dev/null
  POSTGRES_USER="$POSTGRES_USER" \
  POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  POSTGRES_DB="$POSTGRES_DB" \
  POSTGRES_QNAP_PASSWORD="$POSTGRES_QNAP_PASSWORD" \
  CHAD_ENVIRONMENT=local \
  node packages/dba/scripts/sync-local-postgres-from-qnap.mjs
)

log_ok "Local Postgres now mirrors QNAP. Switch Dev Panel Postgres → Local to use it."
