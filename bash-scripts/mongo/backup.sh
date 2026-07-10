#!/usr/bin/env bash
# Logical MongoDB backup via mongodump, run INSIDE the running container
# (docker exec), writing to /backups — which is bind-mounted to a persistent
# host path (QNAP: /share/ContainerData/chad[-test]/mongodb/backups; Mac: a
# local named-volume-backed ./bash-scripts/mongo/backups). A logical dump is
# safer than copying live database files directly.
#
# Usage:
#   MONGO_CONTAINER_NAME=chad-mongodb-prod ./mongo-backup.sh
#
# Requires MONGO_ROOT_USERNAME / MONGO_ROOT_PASSWORD to be set in the shell
# env (source your .env first: set -a; source .env; set +a).

set -euo pipefail

CONTAINER="${MONGO_CONTAINER_NAME:-chad-mongodb-mac}"

if [ -z "${MONGO_ROOT_USERNAME:-}" ] || [ -z "${MONGO_ROOT_PASSWORD:-}" ]; then
  echo "Error: MONGO_ROOT_USERNAME / MONGO_ROOT_PASSWORD must be set (source .env first)." >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Error: container '$CONTAINER' is not running. Start it first (pnpm mongo:up or docker compose up -d mongodb)." >&2
  exit 1
fi

DATE="$(date +%Y-%m-%d_%H-%M-%S)"
BACKUP_DIR="/backups/$DATE"

docker exec "$CONTAINER" mkdir -p "$BACKUP_DIR"
docker exec "$CONTAINER" mongodump \
  --username="$MONGO_ROOT_USERNAME" \
  --password="$MONGO_ROOT_PASSWORD" \
  --authenticationDatabase=admin \
  --out="$BACKUP_DIR"

echo "MongoDB backup created inside container '$CONTAINER' at: $BACKUP_DIR"
echo "(this path is on the persistent bind mount / volume, so it survives 'docker rm')"
