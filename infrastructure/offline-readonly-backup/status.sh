#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_lib.sh"

ensure_dirs

echo "CHAD offline-readonly-backup status"
echo "  root:      $CHAD_OFFLINE_READONLY_BACKUP_ROOT"
echo "  container: $CONTAINER_NAME"
echo "  database:  $DB_NAME"
echo "  role:      $READER_ROLE"
echo "  port:      $OFFLINE_READONLY_BACKUP_POSTGRES_PORT"

if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  echo "  docker:    running"
else
  echo "  docker:    stopped"
fi

meta="$CHAD_OFFLINE_READONLY_BACKUP_ROOT/metadata/latest.json"
if [ -f "$meta" ]; then
  echo "  metadata:  $meta"
  cat "$meta"
else
  echo "  metadata:  (none — run refresh-from-server.sh)"
fi

if [ -x "$(dirname "$0")/verify-readonly.sh" ]; then
  echo ""
  "$(dirname "$0")/verify-readonly.sh" || true
fi
