#!/usr/bin/env bash
# Stops what begin.sh started: the tmux session "chad-dashboard" (dba +
# dashboard + content-provider panes), and — ONLY if this session started it
# — the Content Provider API container.
#
# Ownership is tracked explicitly via a marker file
# (.tmp/dashboard/content-provider.owned, written by
# run-content-provider-if-needed.sh only when IT started the container), not
# guessed from the port or process name. If Content Provider API was already
# running before begin.sh ran, that marker is never created, and this script
# will not touch it.
#
# Never uses killall / broad pkill / kill-by-process-name.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
source "$SCRIPT_DIR/lib.sh"

SESSION="chad-dashboard"
OWNERSHIP_FILE="$REPO_ROOT/.tmp/dashboard/content-provider.owned"

echo ""
log_info "chad dashboard — stopping"
echo ""

if command_exists tmux && tmux has-session -t "$SESSION" 2>/dev/null; then
  tmux kill-session -t "$SESSION"
  log_ok "Stopped tmux session '$SESSION' (dba + dashboard + content-provider panes)."
else
  log_warn "No running '$SESSION' session found."
fi

if [ -f "$OWNERSHIP_FILE" ]; then
  CONTAINER_NAME="$(cat "$OWNERSHIP_FILE")"
  if [ -n "$CONTAINER_NAME" ] && docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$CONTAINER_NAME"; then
    log_info "Stopping Content Provider API container '$CONTAINER_NAME' (started by this session)..."
    docker stop "$CONTAINER_NAME" >/dev/null
    docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true
    log_ok "Stopped and removed container '$CONTAINER_NAME'."
  else
    log_warn "Ownership marker found for '$CONTAINER_NAME' but it's not running — nothing to stop."
  fi
  rm -f "$OWNERSHIP_FILE"
else
  log_info "Content Provider API was not started by this session (no ownership marker) — leaving it untouched."
fi

echo ""
if port_in_use "$FRONTEND_PORT"; then
  log_warn "Port $FRONTEND_PORT is still in use by something (not necessarily an error if you have other services)."
else
  log_ok "Port $FRONTEND_PORT is free."
fi
