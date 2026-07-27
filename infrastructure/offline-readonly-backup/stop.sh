#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_lib.sh"

docker compose -f "$COMPOSE_FILE" --profile offline-readonly-backup down
echo "offline-readonly-backup stopped"
