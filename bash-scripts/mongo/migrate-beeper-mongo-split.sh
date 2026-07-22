#!/usr/bin/env bash
# One-off migration (Story 76, 2026-07-22): dump every beeper_<repoGuid>
# database out of chad-mongodb and restore it into the new, separate
# beeper-mongodb container — see docker-compose.qnap.shared.yml's own
# comment on the beeper-mongodb service for why this split exists.
#
# SAFETY: dry-run by default. Requires --execute to actually touch
# anything — printing the plan (which databases, how many, what commands
# would run) is always safe and is what happens without that flag. This
# script must be run directly on the QNAP host (both containers are only
# reachable there), after `beeper-mongodb` is already up and healthy
# (bash-scripts/dashboard/00_qnap_shared/03_re-start.sh).
#
# Never deletes anything from chad-mongodb — the beeper_* databases stay
# there, untouched, as a rollback safety net (Story 76's own explicit
# requirement: "Nie dopuść do przypadkowego uruchomienia aplikacji na
# pustej bazie" — never let the app accidentally run against an empty
# database). A separate, later cleanup Story can drop them once the split
# has been running successfully for a while.
#
# Usage:
#   # Dry run (default) — lists what would be dumped/restored, touches nothing:
#   MONGO_ROOT_USERNAME=... MONGO_ROOT_PASSWORD=... \
#   BEEPER_MONGO_ROOT_USERNAME=... BEEPER_MONGO_ROOT_PASSWORD=... \
#     bash bash-scripts/mongo/migrate-beeper-mongo-split.sh
#
#   # Real run:
#   MONGO_ROOT_USERNAME=... MONGO_ROOT_PASSWORD=... \
#   BEEPER_MONGO_ROOT_USERNAME=... BEEPER_MONGO_ROOT_PASSWORD=... \
#     bash bash-scripts/mongo/migrate-beeper-mongo-split.sh --execute

set -euo pipefail

EXECUTE=false
for arg in "$@"; do
  if [ "$arg" = "--execute" ]; then
    EXECUTE=true
  fi
done

SOURCE_CONTAINER="chad-mongodb"
TARGET_CONTAINER="beeper-mongodb"
DATE="$(date +%Y-%m-%d_%H-%M-%S)"
DUMP_SUBDIR="beeper-split-migration/$DATE"

for var in MONGO_ROOT_USERNAME MONGO_ROOT_PASSWORD BEEPER_MONGO_ROOT_USERNAME BEEPER_MONGO_ROOT_PASSWORD; do
  if [ -z "${!var:-}" ]; then
    echo "Error: $var must be set (source .env.qnap first)." >&2
    exit 1
  fi
done

for container in "$SOURCE_CONTAINER" "$TARGET_CONTAINER"; do
  if ! docker ps --format '{{.Names}}' | grep -qx "$container"; then
    echo "Error: container '$container' is not running." >&2
    echo "  Start shared services first: bash bash-scripts/dashboard/00_qnap_shared/03_re-start.sh" >&2
    exit 1
  fi
done

echo ""
echo "=== beeper-mongodb split migration ($([ "$EXECUTE" = true ] && echo "EXECUTE" || echo "DRY RUN")) ==="
echo ""

# 1. Enumerate real beeper_* databases from chad-mongodb — never a
#    hardcoded/guessed list of users.
DB_LIST_JSON="$(docker exec "$SOURCE_CONTAINER" mongo --quiet \
  -u "$MONGO_ROOT_USERNAME" -p "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin \
  --eval 'db.adminCommand({listDatabases:1}).databases.map(d => d.name).filter(n => n.startsWith("beeper_")).join("\n")')"

if [ -z "$DB_LIST_JSON" ]; then
  echo "No beeper_* databases found on $SOURCE_CONTAINER — nothing to migrate."
  exit 0
fi

echo "Databases to migrate:"
echo "$DB_LIST_JSON" | sed 's/^/  - /'
echo ""

# 2. Per-database collection counts on the SOURCE, captured now so step 5
#    has something concrete to verify against (never "the command exited
#    0" alone — same discipline as Story 75's real backfill verification).
declare -A SOURCE_COUNTS
while IFS= read -r dbname; do
  [ -z "$dbname" ] && continue
  counts="$(docker exec "$SOURCE_CONTAINER" mongo --quiet "$dbname" \
    -u "$MONGO_ROOT_USERNAME" -p "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin \
    --eval 'db.getCollectionNames().map(c => c + "=" + db.getCollection(c).countDocuments({})).join(",")')"
  SOURCE_COUNTS["$dbname"]="$counts"
  echo "  $dbname source counts: ${counts:-(no collections)}"
done <<< "$DB_LIST_JSON"
echo ""

if [ "$EXECUTE" != true ]; then
  echo "Dry run only — no dump/restore performed. Re-run with --execute to actually migrate."
  echo "chad-mongodb's beeper_* databases are untouched either way."
  exit 0
fi

# 3. Dump every beeper_* database from chad-mongodb into its own /backups
#    volume (never chad-mongodb's live /data/db — a logical dump, same
#    pattern as backup.sh).
echo "Dumping from $SOURCE_CONTAINER..."
while IFS= read -r dbname; do
  [ -z "$dbname" ] && continue
  docker exec "$SOURCE_CONTAINER" mkdir -p "/backups/$DUMP_SUBDIR"
  docker exec "$SOURCE_CONTAINER" mongodump \
    --username="$MONGO_ROOT_USERNAME" --password="$MONGO_ROOT_PASSWORD" \
    --authenticationDatabase=admin \
    --db="$dbname" \
    --out="/backups/$DUMP_SUBDIR"
  echo "  dumped $dbname"
done <<< "$DB_LIST_JSON"

# 4. Bridge the dump from chad-mongodb's own /backups volume to
#    beeper-mongodb's — both are QNAP host bind mounts
#    ($QNAP_CONTAINER_DATA_PATH/chad-shared/{mongodb,beeper-mongodb}/backups),
#    so a plain host-level copy is enough; no docker cp/volume juggling.
CHAD_BACKUPS_HOST_DIR="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/backups"}}{{.Source}}{{end}}{{end}}' "$SOURCE_CONTAINER")"
BEEPER_BACKUPS_HOST_DIR="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/backups"}}{{.Source}}{{end}}{{end}}' "$TARGET_CONTAINER")"
if [ -z "$CHAD_BACKUPS_HOST_DIR" ] || [ -z "$BEEPER_BACKUPS_HOST_DIR" ]; then
  echo "Error: could not resolve /backups host bind-mount path for one of the containers." >&2
  exit 1
fi
mkdir -p "$BEEPER_BACKUPS_HOST_DIR/$DUMP_SUBDIR"
cp -r "$CHAD_BACKUPS_HOST_DIR/$DUMP_SUBDIR/." "$BEEPER_BACKUPS_HOST_DIR/$DUMP_SUBDIR/"
echo "Copied dump to beeper-mongodb's own backups volume."

# 5. Restore into beeper-mongodb.
echo "Restoring into $TARGET_CONTAINER..."
while IFS= read -r dbname; do
  [ -z "$dbname" ] && continue
  docker exec "$TARGET_CONTAINER" mongorestore \
    --username="$BEEPER_MONGO_ROOT_USERNAME" --password="$BEEPER_MONGO_ROOT_PASSWORD" \
    --authenticationDatabase=admin \
    --db="$dbname" \
    "/backups/$DUMP_SUBDIR/$dbname"
  echo "  restored $dbname"
done <<< "$DB_LIST_JSON"

# 6. Verify — per-collection document counts must match EXACTLY between
#    source (chad-mongodb, still untouched) and target (beeper-mongodb).
#    Never proceed to any cutover based on this script's exit code alone.
echo ""
echo "Verifying..."
ALL_MATCH=true
while IFS= read -r dbname; do
  [ -z "$dbname" ] && continue
  target_counts="$(docker exec "$TARGET_CONTAINER" mongo --quiet "$dbname" \
    -u "$BEEPER_MONGO_ROOT_USERNAME" -p "$BEEPER_MONGO_ROOT_PASSWORD" --authenticationDatabase admin \
    --eval 'db.getCollectionNames().map(c => c + "=" + db.getCollection(c).countDocuments({})).join(",")')"
  if [ "$target_counts" = "${SOURCE_COUNTS[$dbname]}" ]; then
    echo "  ✓ $dbname matches (source: ${SOURCE_COUNTS[$dbname]:-none})"
  else
    echo "  ✗ $dbname MISMATCH — source: ${SOURCE_COUNTS[$dbname]:-none} / target: ${target_counts:-none}"
    ALL_MATCH=false
  fi
done <<< "$DB_LIST_JSON"

echo ""
if [ "$ALL_MATCH" = true ]; then
  echo "All databases verified — counts match exactly."
  echo "chad-mongodb's copies are UNCHANGED (rollback safety net) — do not delete them as part of this Story."
  echo "Next step (manual, separate from this script): update BEEPER_MONGODB_URI in"
  echo "docker-compose.qnap.test.yml/.prod.yml (already done in code, not yet deployed) and redeploy."
else
  echo "MISMATCH DETECTED — do NOT cut over BEEPER_MONGODB_URI. Investigate before proceeding."
  exit 1
fi
