#!/bin/bash
# Starts the local helper for Dashboard Plugin synch (Story 105).
# Default bind 0.0.0.0:12701 so local Mac Docker can reach it via
# host.docker.internal (Bearer token required). Not for QNAP/TEST/PROD.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"

TOKEN_FILE="$REPO_ROOT/.runtime/beeper-synch/helper-token"
if [ -z "${BEEPER_SYNCH_HELPER_TOKEN:-}" ] && [ -f "$TOKEN_FILE" ]; then
  BEEPER_SYNCH_HELPER_TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"
  export BEEPER_SYNCH_HELPER_TOKEN
fi

if [ -z "${BEEPER_SYNCH_HELPER_TOKEN:-}" ]; then
  mkdir -p "$(dirname "$TOKEN_FILE")"
  BEEPER_SYNCH_HELPER_TOKEN="$(openssl rand -hex 24)"
  umask 077
  printf '%s\n' "$BEEPER_SYNCH_HELPER_TOKEN" > "$TOKEN_FILE"
  export BEEPER_SYNCH_HELPER_TOKEN
  echo "Generated $TOKEN_FILE — set the same value in .env.local as BEEPER_SYNCH_HELPER_TOKEN"
fi

export BEEPER_SYNCH_HELPER_HOST="${BEEPER_SYNCH_HELPER_HOST:-0.0.0.0}"
export BEEPER_SYNCH_HELPER_PORT="${BEEPER_SYNCH_HELPER_PORT:-12701}"

exec node "$SCRIPT_DIR/local-helper.mjs"
