#!/bin/bash
# copy-env.sh - Kopiuje plik env dla wybranego środowiska
# Użycie: ./copy-env.sh local_mac

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Go up: 01_envs -> nodejs -> 03_scripts -> front_nextjs (3 levels up)
FRONTEND_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

ENV_NAME="${1:-local_mac}"

case "$ENV_NAME" in
    local_mac)
        SOURCE_ENV="$FRONTEND_ROOT/.env.02_local_mac"
        ;;
    *)
        echo "Unknown environment: $ENV_NAME"
        echo "Available environments: local_mac"
        exit 1
        ;;
esac

if [ ! -f "$SOURCE_ENV" ]; then
    echo "Source env file not found: $SOURCE_ENV"
    exit 1
fi

TARGET_ENV="$FRONTEND_ROOT/.env"

# Backup existing .env if exists
if [ -f "$TARGET_ENV" ]; then
    cp "$TARGET_ENV" "$TARGET_ENV.backup"
fi

# Copy env file
cp "$SOURCE_ENV" "$TARGET_ENV"

echo "Copied $SOURCE_ENV to $TARGET_ENV"
