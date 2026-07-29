#!/usr/bin/env bash
# Restore a --archive --gzip backup created by backup-archive.sh, via docker
# exec, into a DISPOSABLE container — never the live beeper-mongodb.
# READY FOR BOSS audit, section 8: existence of a backup is never treated as
# a passing restore drill; this script is what a real drill runs.
#
# Usage:
#   MONGO_CONTAINER_NAME=beeper-mongodb RESTORE_CONTAINER_NAME=beeper-mongodb-restore-drill \
#   MONGO_ROOT_USERNAME=... MONGO_ROOT_PASSWORD=... ./restore-archive.sh beeper-2026-07-29T12-00-00Z.archive.gz

set -euo pipefail

SOURCE_CONTAINER="${MONGO_CONTAINER_NAME:-beeper-mongodb}"
TARGET_CONTAINER="${RESTORE_CONTAINER_NAME:?RESTORE_CONTAINER_NAME is required — never restore onto the live container}"
BACKUP_NAME="${1:-}"

if [ -z "$BACKUP_NAME" ]; then
  echo "Usage: $0 <backup-file-name>  (e.g. beeper-2026-07-29T12-00-00Z.archive.gz)" >&2
  echo "" >&2
  echo "Available backups inside container '$SOURCE_CONTAINER':" >&2
  docker exec "$SOURCE_CONTAINER" sh -c "ls -1 /backups | grep '\.archive\.gz$'" 2>/dev/null || echo "  (source container not running or /backups empty)" >&2
  exit 1
fi

if [ "$TARGET_CONTAINER" = "$SOURCE_CONTAINER" ]; then
  echo "Error: RESTORE_CONTAINER_NAME must not be the live source container ('$SOURCE_CONTAINER')." >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$TARGET_CONTAINER"; then
  echo "Error: disposable restore container '$TARGET_CONTAINER' is not running." >&2
  exit 1
fi

TMP_LOCAL="/tmp/.restore-drill-$$.archive.gz"
docker cp "${SOURCE_CONTAINER}:/backups/${BACKUP_NAME}" "$TMP_LOCAL"
docker cp "$TMP_LOCAL" "${TARGET_CONTAINER}:/tmp/restore.archive.gz"
rm -f "$TMP_LOCAL"

echo "[restore] mongorestore --archive --gzip into disposable container '$TARGET_CONTAINER'..."
docker exec "$TARGET_CONTAINER" mongorestore --archive=/tmp/restore.archive.gz --gzip

echo "[restore] DONE — restored into '$TARGET_CONTAINER' (no auth — disposable, unauthenticated standalone)."
