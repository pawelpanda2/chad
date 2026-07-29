#!/usr/bin/env bash
# Restore a pg_dump -Fc backup created by backup.sh, via docker exec, into a
# DISPOSABLE database/container — never the live shared chad-postgres.
# Existence of a backup file is never treated as a passing restore drill;
# this script is what a real drill runs (READY FOR BOSS audit, section 8).
#
# Usage:
#   POSTGRES_CONTAINER_NAME=chad-postgres RESTORE_CONTAINER_NAME=chad-postgres-restore-drill \
#   POSTGRES_PASSWORD=... ./restore.sh chad-2026-07-29T12-00-00Z.dump
#
# Restores into a database named "restore_drill" inside RESTORE_CONTAINER_NAME
# (a throwaway postgres container the caller is responsible for starting and
# tearing down — see restore-drill.sh for the full orchestration).

set -euo pipefail

SOURCE_CONTAINER="${POSTGRES_CONTAINER_NAME:-chad-postgres}"
TARGET_CONTAINER="${RESTORE_CONTAINER_NAME:?RESTORE_CONTAINER_NAME is required — never restore onto the live container}"
BACKUP_NAME="${1:-}"

if [ -z "$BACKUP_NAME" ]; then
  echo "Usage: $0 <backup-file-name>  (e.g. chad-2026-07-29T12-00-00Z.dump)" >&2
  echo "" >&2
  echo "Available backups inside container '$SOURCE_CONTAINER':" >&2
  docker exec "$SOURCE_CONTAINER" sh -c "ls -1 /backups | grep '\.dump$'" 2>/dev/null || echo "  (source container not running or /backups empty)" >&2
  exit 1
fi

if [ -z "${POSTGRES_PASSWORD:-}" ]; then
  echo "Error: POSTGRES_PASSWORD must be set." >&2
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

# Copy the dump from the source container's /backups into the disposable
# target container — both are on the same docker host, so `docker cp` via a
# local tmp file avoids needing network access between containers.
TMP_LOCAL="/tmp/.restore-drill-$$.dump"
docker cp "${SOURCE_CONTAINER}:/backups/${BACKUP_NAME}" "$TMP_LOCAL"
docker cp "$TMP_LOCAL" "${TARGET_CONTAINER}:/tmp/restore.dump"
rm -f "$TMP_LOCAL"

echo "[restore] creating disposable database 'restore_drill' in '$TARGET_CONTAINER'..."
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$TARGET_CONTAINER" \
  psql -U postgres -c "DROP DATABASE IF EXISTS restore_drill;" 2>/dev/null || true
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$TARGET_CONTAINER" \
  psql -U postgres -c "CREATE DATABASE restore_drill;"

echo "[restore] pg_restore into 'restore_drill'..."
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$TARGET_CONTAINER" \
  pg_restore -U postgres -d restore_drill --no-owner --no-privileges /tmp/restore.dump

echo "[restore] DONE — restored into database 'restore_drill' on '$TARGET_CONTAINER'."
