#!/usr/bin/env bash
# Stops the background beeper-ws process started by 02_begin.sh. Idempotent
# — a no-op (not an error) if beeper-ws isn't running.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
# shellcheck source=../common/lib.sh
source "$REPO_ROOT/bash-scripts/common/lib.sh"
# shellcheck source=./01_config.sh
source "$SCRIPT_DIR/01_config.sh"

if [ ! -f "$BEEPER_WS_PID_FILE" ]; then
  log_warn "No PID file at $BEEPER_WS_PID_FILE — beeper-ws does not appear to be running."
  exit 0
fi

PID="$(cat "$BEEPER_WS_PID_FILE")"
if kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  log_ok "Stopped beeper-ws (pid $PID)."
else
  log_warn "PID $PID from $BEEPER_WS_PID_FILE is not running (stale PID file)."
fi
rm -f "$BEEPER_WS_PID_FILE"
