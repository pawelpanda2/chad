#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_lib.sh"

ensure_dirs

if [ -z "$OFFLINE_READONLY_BACKUP_ADMIN_PASSWORD" ]; then
  echo "ERROR: OFFLINE_READONLY_BACKUP_ADMIN_PASSWORD is required (set in .env)" >&2
  exit 1
fi

docker compose -f "$COMPOSE_FILE" --profile offline-readonly-backup up -d

echo "offline-readonly-backup started (container=${CONTAINER_NAME}, port=${OFFLINE_READONLY_BACKUP_POSTGRES_PORT})"
