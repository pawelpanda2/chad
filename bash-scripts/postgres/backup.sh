#!/usr/bin/env bash
# Official logical PostgreSQL backup (READY FOR BOSS audit, section 7).
# Runs `pg_dump -Fc` INSIDE the running container (docker exec, same proven
# pattern as bash-scripts/mongo/backup.sh) writing to /backups — bind-mounted
# to the persistent QNAP host path (chad-shared/postgres/backups). A logical
# dump is safer than copying live PGDATA files directly, and never runs
# against a stopped database.
#
# Usage:
#   POSTGRES_CONTAINER_NAME=chad-postgres POSTGRES_USER=chad POSTGRES_DB=chad \
#     ./backup.sh [--retain-daily=14] [--retain-weekly=8] [--retain-monthly=12]
#
# Requires POSTGRES_PASSWORD in the shell env (source .env.qnap first).
#
# Safety: a lock file (mkdir-based — atomic on every POSIX filesystem, no
# `flock` binary required) refuses a second concurrent run against the same
# container; a crashed prior run's stale lock (older than 1h) is treated as
# abandoned and cleared. Dump goes to a `.tmp-*` name first — only renamed to
# its real `chad-*.dump` name after `pg_dump` exits 0, so a partial/failed
# dump never masquerades as a successful backup. Never logs
# POSTGRES_PASSWORD (docker exec's own argv could show briefly in `docker
# top`, same pre-existing tradeoff bash-scripts/mongo/backup.sh already has
# — not new here).

set -euo pipefail

CONTAINER="${POSTGRES_CONTAINER_NAME:-chad-postgres}"
PGUSER="${POSTGRES_USER:-chad}"
PGDB="${POSTGRES_DB:-chad}"
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

if [ -z "${POSTGRES_PASSWORD:-}" ]; then
  echo "Error: POSTGRES_PASSWORD must be set (source .env.qnap first)." >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Error: container '$CONTAINER' is not running." >&2
  exit 1
fi

LOCK_DIR="/tmp/.chad-postgres-backup.lock"
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
TMP_NAME=".tmp-chad-${TIMESTAMP}.dump"
FINAL_NAME="chad-${TIMESTAMP}.dump"

echo "[backup] pg_dump -Fc inside '$CONTAINER' -> /backups/$FINAL_NAME"
if ! docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$CONTAINER" \
  pg_dump -Fc -U "$PGUSER" -d "$PGDB" -f "/backups/$TMP_NAME"; then
  echo "[backup] pg_dump FAILED — no manifest, no rename." >&2
  docker exec "$CONTAINER" rm -f "/backups/$TMP_NAME" 2>/dev/null || true
  exit 1
fi

# Atomic: only becomes the "real" name once pg_dump exited 0.
docker exec "$CONTAINER" mv "/backups/$TMP_NAME" "/backups/$FINAL_NAME"
CHECKSUM="$(docker exec "$CONTAINER" sha256sum "/backups/$FINAL_NAME" | awk '{print $1}')"
docker exec "$CONTAINER" sh -c "cat > /backups/${FINAL_NAME}.manifest.json" <<EOF
{
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)",
  "file": "${FINAL_NAME}",
  "sha256": "${CHECKSUM}",
  "tool": "pg_dump -Fc",
  "container": "${CONTAINER}",
  "database": "${PGDB}"
}
EOF
echo "[backup] DONE — /backups/${FINAL_NAME} (sha256=${CHECKSUM})"

# GFS retention (daily/weekly/monthly), newest-first so the first file seen
# per bucket key is always the most recent in that bucket. bash 3.2 on QNAP
# has no associative arrays, so this tracks one "previous key" per tier
# instead — correct as long as input is strictly newest-to-oldest.
echo "[backup] applying retention: ${RETAIN_DAILY} daily / ${RETAIN_WEEKLY} weekly / ${RETAIN_MONTHLY} monthly"
FILES="$(docker exec "$CONTAINER" sh -c "ls -1 /backups | grep '^chad-.*\.dump$'" | sort -r)"

day_count=0; week_count=0; month_count=0
prev_day=""; prev_week=""; prev_month=""
for f in $FILES; do
  day_key="$(echo "$f" | sed -E 's/^chad-([0-9]{4}-[0-9]{2}-[0-9]{2}).*/\1/')"
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
docker exec "$CONTAINER" sh -c "ls -1 /backups | grep '\.dump$' | sort"
