#!/usr/bin/env bash
# Restore a pg_dump -Fc file into chad_offline_readonly_backup and re-apply read-only role.
set -euo pipefail
source "$(dirname "$0")/_lib.sh"

DUMP="${1:-}"
if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  echo "Usage: $0 <path-to-dump.fc>" >&2
  exit 1
fi

if [ -z "$OFFLINE_READONLY_BACKUP_ADMIN_PASSWORD" ] || [ -z "$OFFLINE_READONLY_BACKUP_READER_PASSWORD" ]; then
  echo "ERROR: admin and reader passwords required in .env" >&2
  exit 1
fi

ensure_dirs
"$(dirname "$0")/start.sh"

ADMIN_URI="$(admin_uri)"
LOG="$CHAD_OFFLINE_READONLY_BACKUP_ROOT/restore-logs/restore-$(date -u +%Y%m%dT%H%M%SZ).log"
RESTORE_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

{
  echo "restore-from-dump: $DUMP"
  psql "$ADMIN_URI" -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" || true
  dropdb --if-exists -h 127.0.0.1 -p "$OFFLINE_READONLY_BACKUP_POSTGRES_PORT" -U "$OFFLINE_READONLY_BACKUP_ADMIN_USER" "$DB_NAME" || true
  createdb -h 127.0.0.1 -p "$OFFLINE_READONLY_BACKUP_POSTGRES_PORT" -U "$OFFLINE_READONLY_BACKUP_ADMIN_USER" "$DB_NAME"
  pg_restore --no-owner --no-acl -h 127.0.0.1 -p "$OFFLINE_READONLY_BACKUP_POSTGRES_PORT" -U "$OFFLINE_READONLY_BACKUP_ADMIN_USER" -d "$DB_NAME" "$DUMP"
  apply_readonly_role "$ADMIN_URI"
} >"$LOG" 2>&1

VERIFY_RESULT="unknown"
if "$(dirname "$0")/verify-readonly.sh" >>"$LOG" 2>&1; then
  VERIFY_RESULT="PASS"
else
  VERIFY_RESULT="FAIL"
fi

CP_ITEMS=$(psql "$ADMIN_URI" -At -c "SELECT count(*) FROM cp_items" 2>/dev/null || echo "0")
CP_HISTORY=$(psql "$ADMIN_URI" -At -c "SELECT count(*) FROM cp_history" 2>/dev/null || echo "0")

cat >"$CHAD_OFFLINE_READONLY_BACKUP_ROOT/metadata/latest.json" <<EOF
{
  "sourceHost": "dump",
  "sourceDatabase": "unknown",
  "dumpTimestamp": "$(basename "$DUMP")",
  "restoreTimestamp": "$RESTORE_AT",
  "cpItemsCount": $CP_ITEMS,
  "cpHistoryCount": $CP_HISTORY,
  "verificationResult": "$VERIFY_RESULT"
}
EOF

echo "restore complete — cp_items=$CP_ITEMS cp_history=$CP_HISTORY verify=$VERIFY_RESULT"
echo "log: $LOG"
[ "$VERIFY_RESULT" = "PASS" ] || exit 1
