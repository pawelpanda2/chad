#!/usr/bin/env bash
# Dump server PostgreSQL, restore into offline-readonly-backup, verify read-only.
set -euo pipefail
source "$(dirname "$0")/_lib.sh"

SRC_PASS="${OFFLINE_READONLY_BACKUP_SOURCE_PASSWORD:-${POSTGRES_QNAP_PASSWORD:-}}"
if [ -z "$SRC_PASS" ]; then
  echo "ERROR: set OFFLINE_READONLY_BACKUP_SOURCE_PASSWORD or POSTGRES_QNAP_PASSWORD" >&2
  exit 1
fi
if [ -z "$OFFLINE_READONLY_BACKUP_ADMIN_PASSWORD" ] || [ -z "$OFFLINE_READONLY_BACKUP_READER_PASSWORD" ]; then
  echo "ERROR: admin and reader passwords required in .env" >&2
  exit 1
fi

ensure_dirs
"$(dirname "$0")/start.sh"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP="$CHAD_OFFLINE_READONLY_BACKUP_ROOT/backups/chad-offline-readonly-backup-${TS}.dump"
PREV="$(ls -1t "$CHAD_OFFLINE_READONLY_BACKUP_ROOT/backups/"*.dump 2>/dev/null | head -1 || true)"
LOG="$CHAD_OFFLINE_READONLY_BACKUP_ROOT/restore-logs/refresh-${TS}.log"
RESTORE_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

SRC_URI="postgres://${OFFLINE_READONLY_BACKUP_SOURCE_USER}@${OFFLINE_READONLY_BACKUP_SOURCE_HOST}:${OFFLINE_READONLY_BACKUP_SOURCE_PORT}/${OFFLINE_READONLY_BACKUP_SOURCE_DB}"
ADMIN_URI="$(admin_uri)"

{
  echo "refresh-from-server"
  echo "source: ${OFFLINE_READONLY_BACKUP_SOURCE_HOST}:${OFFLINE_READONLY_BACKUP_SOURCE_PORT}/${OFFLINE_READONLY_BACKUP_SOURCE_DB}"
  PGPASSWORD="$SRC_PASS" pg_dump -Fc \
    -h "$OFFLINE_READONLY_BACKUP_SOURCE_HOST" \
    -p "$OFFLINE_READONLY_BACKUP_SOURCE_PORT" \
    -U "$OFFLINE_READONLY_BACKUP_SOURCE_USER" \
    -d "$OFFLINE_READONLY_BACKUP_SOURCE_DB" \
    -f "$DUMP"
  echo "dump: $DUMP"
  [ -n "$PREV" ] && echo "previous dump kept: $PREV"
  "$(dirname "$0")/restore-from-dump.sh" "$DUMP"
} >"$LOG" 2>&1

VERIFY_RESULT="$(node -e "const m=require('fs').readFileSync('$CHAD_OFFLINE_READONLY_BACKUP_ROOT/metadata/latest.json','utf8'); console.log(JSON.parse(m).verificationResult)")"
CP_ITEMS="$(node -e "const m=require('fs').readFileSync('$CHAD_OFFLINE_READONLY_BACKUP_ROOT/metadata/latest.json','utf8'); console.log(JSON.parse(m).cpItemsCount)")"
CP_HISTORY="$(node -e "const m=require('fs').readFileSync('$CHAD_OFFLINE_READONLY_BACKUP_ROOT/metadata/latest.json','utf8'); console.log(JSON.parse(m).cpHistoryCount)")"

node -e "
const fs=require('fs');
const p='$CHAD_OFFLINE_READONLY_BACKUP_ROOT/metadata/latest.json';
const m=JSON.parse(fs.readFileSync(p,'utf8'));
m.sourceHost='$OFFLINE_READONLY_BACKUP_SOURCE_HOST';
m.sourceDatabase='$OFFLINE_READONLY_BACKUP_SOURCE_DB';
m.dumpTimestamp='$TS';
m.restoreTimestamp='$RESTORE_AT';
fs.writeFileSync(p, JSON.stringify(m, null, 2));
"

echo "refresh complete — cp_items=$CP_ITEMS cp_history=$CP_HISTORY verify=$VERIFY_RESULT"
echo "log: $LOG"
[ "$VERIFY_RESULT" = "PASS" ] || exit 1
