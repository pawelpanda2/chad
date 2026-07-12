#!/usr/bin/env bash
# Shows whether beeper-ws is running and tails the last few log lines.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
# shellcheck source=../common/lib.sh
source "$REPO_ROOT/bash-scripts/common/lib.sh"
# shellcheck source=./01_config.sh
source "$SCRIPT_DIR/01_config.sh"

echo ""
log_info "beeper-ws — status"
echo ""

if [ -f "$BEEPER_WS_PID_FILE" ] && kill -0 "$(cat "$BEEPER_WS_PID_FILE")" 2>/dev/null; then
  log_ok "beeper-ws is running (pid $(cat "$BEEPER_WS_PID_FILE"))."
else
  log_warn "beeper-ws is NOT running."
fi

if [ -f "$BEEPER_WS_LOG_FILE" ]; then
  echo ""
  log_info "Last 15 log lines ($BEEPER_WS_LOG_FILE):"
  tail -n 15 "$BEEPER_WS_LOG_FILE"
fi
