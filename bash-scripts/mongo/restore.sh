#!/usr/bin/env bash
# Restore a mongodump backup created by mongo-backup.sh, via docker exec
# into the running MongoDB container.
#
# Usage:
#   MONGO_CONTAINER_NAME=chad-mongodb-prod ./mongo-restore.sh 2026-07-10_12-00-00
#
# Requires MONGO_ROOT_USERNAME / MONGO_ROOT_PASSWORD in the shell env.

set -euo pipefail

CONTAINER="${MONGO_CONTAINER_NAME:-chad-mongodb-mac}"
BACKUP_NAME="${1:-}"

if [ -z "$BACKUP_NAME" ]; then
  echo "Usage: $0 <backup-folder-name>  (e.g. 2026-07-10_12-00-00)" >&2
  echo "" >&2
  echo "Available backups inside container '$CONTAINER':" >&2
  docker exec "$CONTAINER" ls /backups 2>/dev/null || echo "  (container not running or /backups empty)" >&2
  exit 1
fi

if [ -z "${MONGO_ROOT_USERNAME:-}" ] || [ -z "${MONGO_ROOT_PASSWORD:-}" ]; then
  echo "Error: MONGO_ROOT_USERNAME / MONGO_ROOT_PASSWORD must be set (source .env first)." >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Error: container '$CONTAINER' is not running." >&2
  exit 1
fi

BACKUP_DIR="/backups/$BACKUP_NAME"

echo "Restoring from $BACKUP_DIR inside container '$CONTAINER'..."
docker exec "$CONTAINER" mongorestore \
  --username="$MONGO_ROOT_USERNAME" \
  --password="$MONGO_ROOT_PASSWORD" \
  --authenticationDatabase=admin \
  "$BACKUP_DIR"

echo "Restore complete."
