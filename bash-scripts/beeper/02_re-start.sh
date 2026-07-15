#!/usr/bin/env bash
# Starts beeper-ws (long-lived Beeper Desktop -> MongoDB WS listener) as a
# background process on the Mac. This is Mac-only — beeper-ws needs a local
# Beeper Desktop instance (see documentation/beeper/architecture.md) and is
# never deployed to QNAP.
#
# Usage:
#   ./bash-scripts/beeper/02_re-start.sh
#
# Works from any cwd — resolves the repo root from this script's own
# location via git, not from $PWD.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
# shellcheck source=../common/lib.sh
source "$REPO_ROOT/bash-scripts/common/lib.sh"
# shellcheck source=./01_config.sh
source "$SCRIPT_DIR/01_config.sh"

echo ""
log_info "beeper-ws — start"
echo ""

FAIL=false
require_command pnpm "brew install pnpm  (or: corepack enable)" || FAIL=true
require_file "$REPO_ROOT/.env.mac-beeper" \
  "cp .env.mac-beeper.example .env.mac-beeper and fill in real values" || FAIL=true
require_file "$BEEPER_WS_DIR/package.json" \
  "packages/beeper-ws is missing — this repo's monorepo skeleton is incomplete" || FAIL=true
if [ "$FAIL" = true ]; then
  log_error "Preflight checks failed — fix the issues above and re-run."
  exit 1
fi

mkdir -p "$BEEPER_RUNTIME_DIR"

if [ -f "$BEEPER_WS_PID_FILE" ] && kill -0 "$(cat "$BEEPER_WS_PID_FILE")" 2>/dev/null; then
  log_warn "beeper-ws is already running (pid $(cat "$BEEPER_WS_PID_FILE")) — stopping it first, then starting fresh."
  bash "$SCRIPT_DIR/03_end.sh"
fi

# Health-check MongoDB@QNAP reachability before starting a long-lived process
# that would otherwise crash-loop silently in the background.
set -a
# shellcheck source=/dev/null
source "$REPO_ROOT/.env.mac-beeper"
set +a
if ! bash "$REPO_ROOT/bash-scripts/mongo/health-check-mac.sh"; then
  log_error "MongoDB@QNAP is not reachable — fix connectivity before starting beeper-ws."
  exit 1
fi

log_info "Starting beeper-ws in the background (logs: $BEEPER_WS_LOG_FILE) ..."
cd "$BEEPER_WS_DIR"
nohup pnpm dev >"$BEEPER_WS_LOG_FILE" 2>&1 &
echo $! >"$BEEPER_WS_PID_FILE"

sleep 1
if kill -0 "$(cat "$BEEPER_WS_PID_FILE")" 2>/dev/null; then
  log_ok "beeper-ws started (pid $(cat "$BEEPER_WS_PID_FILE"))."
  log_info "Tail logs with: tail -f $BEEPER_WS_LOG_FILE"
else
  log_error "beeper-ws exited immediately — check $BEEPER_WS_LOG_FILE"
  exit 1
fi
