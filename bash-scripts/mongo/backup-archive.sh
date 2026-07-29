#!/usr/bin/env bash
# Official logical MongoDB backup, single-archive form (READY FOR BOSS audit,
# section 7 — explicitly requires `mongodump --archive --gzip`, not the
# directory-tree form bash-scripts/mongo/backup.sh already uses elsewhere).
# Added alongside (not replacing) backup.sh/restore.sh — those remain the
# established whole-server directory-dump mechanism referenced by several
# past Stories (69/73/74/76); this script is the newer, single-file-per-run
# form with checksum/manifest/retention/locking, for beeper-mongodb.
#
# Usage:
#   MONGO_CONTAINER_NAME=beeper-mongodb MONGO_ROOT_USERNAME=... MONGO_ROOT_PASSWORD=... \
#     ./backup-archive.sh [--retain-daily=14] [--retain-weekly=8] [--retain-monthly=12]

set -euo pipefail

CONTAINER="${MONGO_CONTAINER_NAME:-beeper-mongodb}"
RETAIN_DAILY=14
RETAIN_WEEKLY=8
RETAIN_MONTHLY=12

for arg in "$@"; do
  case "$arg" in
    --retain-daily=*) RETAIN_DAILY="${arg#*=}" ;;
    --retain-weekly=*) RETAIN_WEEKLY="${arg#*=}" ;;
    --retain-monthly=*) RETAIN_MONTHLY="${arg#*=}" ;;
  esac
done

if [ -z "${MONGO_ROOT_USERNAME:-}" ] || [ -z "${MONGO_ROOT_PASSWORD:-}" ]; then
  echo "Error: MONGO_ROOT_USERNAME / MONGO_ROOT_PASSWORD must be set (source .env.qnap first)." >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Error: container '$CONTAINER' is not running." >&2
  exit 1
fi

LOCK_DIR="/tmp/.chad-${CONTAINER}-backup.lock"
if mkdir "$LOCK_DIR" 2>/dev/null; then
  trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT
else
  lock_age=$(( $(date +%s) - $(stat -c %Y "$LOCK_DIR" 2>/dev/null || echo 0) ))
  if [ "$lock_age" -gt 3600 ]; then
    echo "[backup] stale lock (${lock_age}s old) — clearing and continuing." >&2
    rmdir "$LOCK_DIR" 2>/dev/null || true
    mkdir "$LOCK_DIR"
    trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT
  else
    echo "Error: another backup is already running (lock: $LOCK_DIR, age ${lock_age}s). Aborting." >&2
    exit 1
  fi
fi

TIMESTAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
TMP_NAME=".tmp-beeper-${TIMESTAMP}.archive.gz"
FINAL_NAME="beeper-${TIMESTAMP}.archive.gz"

echo "[backup] mongodump --archive --gzip inside '$CONTAINER' -> /backups/$FINAL_NAME"
if ! docker exec "$CONTAINER" mongodump \
  --username="$MONGO_ROOT_USERNAME" --password="$MONGO_ROOT_PASSWORD" --authenticationDatabase=admin \
  "--archive=/backups/$TMP_NAME" --gzip; then
  echo "[backup] mongodump FAILED — no manifest, no rename." >&2
  docker exec "$CONTAINER" rm -f "/backups/$TMP_NAME" 2>/dev/null || true
  exit 1
fi

docker exec "$CONTAINER" mv "/backups/$TMP_NAME" "/backups/$FINAL_NAME"
CHECKSUM="$(docker exec "$CONTAINER" sha256sum "/backups/$FINAL_NAME" | awk '{print $1}')"
docker exec "$CONTAINER" sh -c "cat > /backups/${FINAL_NAME}.manifest.json" <<EOF
{
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)",
  "file": "${FINAL_NAME}",
  "sha256": "${CHECKSUM}",
  "tool": "mongodump --archive --gzip",
  "container": "${CONTAINER}"
}
EOF
echo "[backup] DONE — /backups/${FINAL_NAME} (sha256=${CHECKSUM})"

echo "[backup] applying retention: ${RETAIN_DAILY} daily / ${RETAIN_WEEKLY} weekly / ${RETAIN_MONTHLY} monthly"
FILES="$(docker exec "$CONTAINER" sh -c "ls -1 /backups | grep '^beeper-.*\.archive\.gz$'" | sort -r)"

day_count=0; week_count=0; month_count=0
prev_day=""; prev_week=""; prev_month=""
for f in $FILES; do
  day_key="$(echo "$f" | sed -E 's/^beeper-([0-9]{4}-[0-9]{2}-[0-9]{2}).*/\1/')"
  week_key="$(date -u -d "$day_key" +%G-W%V 2>/dev/null || echo "$day_key")"
  month_key="$(date -u -d "$day_key" +%Y-%m 2>/dev/null || echo "$day_key")"

  keep=0
  if [ "$day_count" -lt "$RETAIN_DAILY" ]; then
    if [ "$day_key" != "$prev_day" ]; then day_count=$((day_count + 1)); prev_day="$day_key"; fi
    if [ "$day_count" -le "$RETAIN_DAILY" ]; then keep=1; fi
  elif [ "$week_count" -lt "$RETAIN_WEEKLY" ]; then
    if [ "$week_key" != "$prev_week" ]; then week_count=$((week_count + 1)); prev_week="$week_key"; fi
    if [ "$week_count" -le "$RETAIN_WEEKLY" ]; then keep=1; fi
  elif [ "$month_count" -lt "$RETAIN_MONTHLY" ]; then
    if [ "$month_key" != "$prev_month" ]; then month_count=$((month_count + 1)); prev_month="$month_key"; fi
    if [ "$month_count" -le "$RETAIN_MONTHLY" ]; then keep=1; fi
  fi

  if [ "$keep" -eq 0 ]; then
    docker exec "$CONTAINER" rm -f "/backups/$f" "/backups/${f}.manifest.json"
    echo "[backup] pruned old backup: $f"
  fi
done

echo "[backup] retention applied. Current backups:"
docker exec "$CONTAINER" sh -c "ls -1 /backups | grep '\.archive\.gz$' | sort"
