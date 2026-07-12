#!/usr/bin/env bash
# Runs a one-off beeper-sync pass (Mac-only, manual/cron — never a long-lived
# process). Wraps `pnpm sync` in packages/beeper-sync with the same env +
# health-check preflight as beeper-ws.
#
# Usage:
#   ./bash-scripts/beeper/05_sync.sh                 # incremental REST sync
#   ./bash-scripts/beeper/05_sync.sh --force          # force REST sync
#   ./bash-scripts/beeper/05_sync.sh --sqlite         # full SQLite import
#   ./bash-scripts/beeper/05_sync.sh --all            # full pipeline (sync-all.mjs)

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
# shellcheck source=../common/lib.sh
source "$REPO_ROOT/bash-scripts/common/lib.sh"
# shellcheck source=./01_config.sh
source "$SCRIPT_DIR/01_config.sh"

require_command pnpm "brew install pnpm  (or: corepack enable)"
require_file "$REPO_ROOT/.env.mac-beeper" \
  "cp .env.mac-beeper.example .env.mac-beeper and fill in real values"

set -a
# shellcheck source=/dev/null
source "$REPO_ROOT/.env.mac-beeper"
set +a

if ! bash "$REPO_ROOT/bash-scripts/mongo/health-check-mac.sh"; then
  log_error "MongoDB@QNAP is not reachable — fix connectivity before syncing."
  exit 1
fi

cd "$BEEPER_SYNC_DIR"

case "${1:-}" in
  --force)  pnpm run sync:force ;;
  --sqlite) pnpm run sync:sqlite ;;
  --all)    pnpm run sync:all ;;
  "")       pnpm run sync ;;
  *)        log_error "Unknown argument: $1 (expected --force, --sqlite, --all, or nothing)"; exit 1 ;;
esac
