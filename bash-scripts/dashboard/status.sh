#!/usr/bin/env bash
# Shows whether the dashboard dev session is running, which port it's on,
# and whether it's actually responding to HTTP requests (not just "a process
# exists" — a crashed/hung next dev process still holds its tmux pane open).
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"

SESSION="chad-dashboard"

echo ""
log_info "chad dashboard — status"
echo ""

if command_exists tmux && tmux has-session -t "$SESSION" 2>/dev/null; then
  log_ok "tmux session '$SESSION' is running."
  tmux list-panes -t "$SESSION" -F '  pane #{pane_index}: #{pane_title}  (pid #{pane_pid})' 2>/dev/null || true
else
  log_warn "tmux session '$SESSION' is NOT running."
fi

echo ""

FRONTEND_PORT="$(grep -E '^FRONTEND_PORT=' "$REPO_ROOT/packages/dashboard/.env" 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

if port_in_use "$FRONTEND_PORT"; then
  log_ok "Port $FRONTEND_PORT is in use (something is listening)."
  if curl -sS -o /dev/null -m 3 -w '%{http_code}' "http://localhost:$FRONTEND_PORT" 2>/dev/null | grep -qE '^[23]'; then
    log_ok "Dashboard responds at http://localhost:$FRONTEND_PORT"
  else
    log_warn "Port $FRONTEND_PORT is in use but not responding with a 2xx/3xx — it may still be starting up, or something else owns that port."
  fi
else
  log_warn "Port $FRONTEND_PORT is free — dashboard is not running."
fi

echo ""

CP_API_URL="$(grep -E '^CONTENT_PROVIDER_API_URL=' "$REPO_ROOT/packages/dashboard/.env" 2>/dev/null | cut -d= -f2- | tr -d '[:space:]')"
OWNERSHIP_FILE="$REPO_ROOT/.tmp/dashboard/content-provider.owned"
if [ -n "$CP_API_URL" ]; then
  if curl -sS -o /dev/null -m 3 "$CP_API_URL/health" 2>/dev/null || curl -sS -o /dev/null -m 3 "$CP_API_URL" 2>/dev/null; then
    if [ -f "$OWNERSHIP_FILE" ]; then
      log_ok "Content Provider API reachable at $CP_API_URL (container '$(cat "$OWNERSHIP_FILE")', started by this session — end.sh will stop it)."
    else
      log_ok "Content Provider API reachable at $CP_API_URL (running independently — end.sh will not touch it)."
    fi
  else
    log_warn "Content Provider API NOT reachable at $CP_API_URL (CP-dependent views will error)."
  fi
fi
