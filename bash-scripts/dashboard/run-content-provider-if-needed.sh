#!/usr/bin/env bash
# Ensures Content Provider API is reachable. Uses the REAL, existing local
# startup script from the content-provider repo
# (03_scripts/03_local-mac_docker/02_run_api_charp.sh) — does not invent an
# alternative way to start it. Tracks ownership (.tmp/dashboard/content-provider.owned)
# so end.sh only ever stops a Content Provider instance THIS session started,
# never one that was already running.
#
# Modes:
#   (default)    — check, conditionally start + wait for health, then stay in
#                  the foreground tailing container logs. Used as the
#                  tmuxinator "content-provider" pane command.
#   --wait-only  — check, conditionally start + wait for health, then exit.
#                  Used by begin.sh to block until CP is ready (or has failed)
#                  before begin.sh declares its own start complete. Safe to
#                  call after the pane already did this — health check makes
#                  it a no-op the second time.
#
# Path to the content-provider repo: content-provider is not (yet) part of
# this monorepo, so its location is resolved via env var
# CONTENT_PROVIDER_REPO_PATH if set, else assumed to be the sibling directory
# "../content-provider" next to this monorepo's own root — matching how it
# actually sits in this workspace. Never hardcoded to a specific user's home
# directory.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"

WAIT_ONLY=false
[ "${1:-}" = "--wait-only" ] && WAIT_ONLY=true

OWNERSHIP_DIR="$REPO_ROOT/.tmp/dashboard"
OWNERSHIP_FILE="$OWNERSHIP_DIR/content-provider.owned"
mkdir -p "$OWNERSHIP_DIR"

CP_API_URL="$(grep -E '^CONTENT_PROVIDER_API_URL=' "$REPO_ROOT/packages/dashboard/.env" 2>/dev/null | cut -d= -f2- | tr -d '[:space:]')"
CP_API_URL="${CP_API_URL:-http://localhost:12024}"

check_health() {
  curl -fsS -m 3 "$CP_API_URL/health" >/dev/null 2>&1
}

if check_health; then
  log_ok "Content Provider API already running at $CP_API_URL — not starting a duplicate."
  if [ "$WAIT_ONLY" = true ]; then
    exit 0
  fi
  log_info "This session did not start it, so 'end.sh' will not stop it."
  exec tail -f /dev/null
fi

log_info "Content Provider API not reachable at $CP_API_URL — starting it via the existing local script..."

CP_REPO_PATH="${CONTENT_PROVIDER_REPO_PATH:-$(dirname "$REPO_ROOT")/content-provider}"
if [ ! -d "$CP_REPO_PATH" ]; then
  log_error "content-provider repo not found at: $CP_REPO_PATH"
  log_error "  Fix: export CONTENT_PROVIDER_REPO_PATH=/correct/path/to/content-provider"
  exit 1
fi

RUN_SCRIPT="$CP_REPO_PATH/03_scripts/03_local-mac_docker/02_run_api_charp.sh"
if [ ! -f "$RUN_SCRIPT" ]; then
  log_error "content-provider's own docker run script is missing: $RUN_SCRIPT"
  log_error "  This repo's layout may have changed — re-check where it now lives."
  exit 1
fi

bash "$RUN_SCRIPT"

CONTAINER_NAME="$(grep -E '^CONTENT_PROVIDER_API_CONTAINER_NAME=' "$CP_REPO_PATH/.env" 2>/dev/null | cut -d= -f2)"
CONTAINER_NAME="${CONTAINER_NAME:-cp_api_csharp}"
echo "$CONTAINER_NAME" > "$OWNERSHIP_FILE"
log_ok "Started container '$CONTAINER_NAME' — ownership recorded at $OWNERSHIP_FILE (end.sh will stop it)."

log_info "Waiting for Content Provider API to become healthy..."
HEALTHY=false
for _ in $(seq 1 30); do
  if check_health; then
    HEALTHY=true
    break
  fi
  sleep 2
done

if [ "$HEALTHY" != true ]; then
  log_error "Content Provider API did not become healthy in time."
  log_error "  Check: docker logs $CONTAINER_NAME"
  exit 1
fi

log_ok "Content Provider API is healthy at $CP_API_URL."

if [ "$WAIT_ONLY" = true ]; then
  exit 0
fi

exec docker logs -f "$CONTAINER_NAME"
