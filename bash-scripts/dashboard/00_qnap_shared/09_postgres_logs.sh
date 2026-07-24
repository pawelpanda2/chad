#!/usr/bin/env bash
# Story 81 — tails chad-postgres logs only. Read-only.
# Usage: 09_postgres_logs.sh [N]   (default: last 200 lines)
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
source "$SCRIPT_DIR/01_config.sh"

LINES="${1:-200}"

cd "$REPO_ROOT"
docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" logs --tail "$LINES" postgres
