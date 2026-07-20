#!/usr/bin/env bash
# Ensures Content Provider API is reachable for local-mac (non-Docker
# tmuxinator) dev. Uses the same chad-content-provider-api image built by
# bash-scripts/dashboard/03_local_mac_docker/02_build.sh (or any other
# environment's 02_build.sh — same image everywhere), run directly via
# `docker run` since this dev mode has no docker-compose stack of its own.
# Tracks ownership (.tmp/dashboard/content-provider.owned) so end.sh only
# ever stops a Content Provider instance THIS session started, never one
# that was already running.
#
# Content Provider has no .env of its own — its config module
# (appsettings.json) is generated from the text embedded in
# bash-scripts/dashboard/02_local_mac_tmux/01_config.sh, same pattern used by
# every other environment (03_local_mac_docker, 04_qnap_test, 05_qnap_prod).
#
# Modes:
#   (default)    — check, conditionally start + wait for health, then stay in
#                  the foreground tailing container logs. Used as the
#                  tmuxinator "content-provider" pane command.
#   --wait-only  — check, conditionally start + wait for health, then exit.
#                  Used by 02_local_mac_tmux/03_re-start.sh to block until CP
#                  is ready (or has failed) before it declares its own start
#                  complete. Safe to call after the pane already did this —
#                  health check makes it a no-op the second time.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
source "$REPO_ROOT/bash-scripts/dashboard/02_local_mac_tmux/01_config.sh"

CONTENT_PROVIDER_API_URL="http://localhost:$CONTENT_PROVIDER_API_PORT"

WAIT_ONLY=false
[ "${1:-}" = "--wait-only" ] && WAIT_ONLY=true

OWNERSHIP_DIR="$REPO_ROOT/.tmp/dashboard"
OWNERSHIP_FILE="$OWNERSHIP_DIR/content-provider.owned"
mkdir -p "$OWNERSHIP_DIR"

check_health() {
  curl -fsS -m 3 "$CONTENT_PROVIDER_API_URL/health" >/dev/null 2>&1
}

if check_health; then
  log_ok "Content Provider API already running at $CONTENT_PROVIDER_API_URL — not starting a duplicate."
  if [ "$WAIT_ONLY" = true ]; then
    exit 0
  fi
  log_info "This session did not start it, so 'end.sh' will not stop it."
  exec tail -f /dev/null
fi

if ! docker image inspect "$CONTENT_PROVIDER_API_IMAGE" >/dev/null 2>&1; then
  log_error "Image $CONTENT_PROVIDER_API_IMAGE not found locally."
  log_error "  Fix: bash bash-scripts/dashboard/03_local_mac_docker/03_build.sh"
  exit 1
fi

log_info "Content Provider API not reachable at $CONTENT_PROVIDER_API_URL — starting it..."

write_content_provider_appsettings
APPSETTINGS_FILE="$REPO_ROOT/.runtime/local-mac/content-provider/appsettings.json"

NAME="$CONTENT_PROVIDER_API_CONTAINER_NAME"
if docker ps -a --format '{{.Names}}' | grep -qx "$NAME"; then
  docker rm -f "$NAME" >/dev/null
fi

docker run -d \
  --name "$NAME" \
  -p "$CONTENT_PROVIDER_API_PORT:$CONTENT_PROVIDER_API_PORT" \
  -v "$APPSETTINGS_FILE:/app/appsettings.json:ro" \
  -v "/Users/pawelfluder/Dropbox:/Users/pawelfluder/Dropbox" \
  -v "/Volumes/Dropbox/kamilgame042:/Volumes/Dropbox/kamilgame042" \
  "$CONTENT_PROVIDER_API_IMAGE" >/dev/null

echo "$NAME" > "$OWNERSHIP_FILE"
log_ok "Started container '$NAME' — ownership recorded at $OWNERSHIP_FILE (end.sh will stop it)."

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
  log_error "  Check: docker logs $NAME"
  exit 1
fi

log_ok "Content Provider API is healthy at $CONTENT_PROVIDER_API_URL."

if [ "$WAIT_ONLY" = true ]; then
  exit 0
fi

exec docker logs -f "$NAME"
