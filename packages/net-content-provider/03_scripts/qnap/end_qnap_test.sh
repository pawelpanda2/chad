#!/usr/bin/env bash
# Stops ONLY the QNAP-TEST containers (cp-api-test, cp-blazor-test). Never
# touches production or local-mac containers/images. Never deletes the
# repos data (no volume removal — the bind mount is untouched by
# stopping/removing these containers). No docker system prune, no broad
# pkill/killall.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

echo ""
log_info "Content Provider — end QNAP TEST"
echo ""

require_command docker "install Docker" || exit 1

for name in "$CP_TEST_API_CONTAINER" "$CP_TEST_BLAZOR_CONTAINER"; do
  if docker ps -a --format '{{.Names}}' | grep -qx "$name"; then
    docker stop "$name" >/dev/null 2>&1 || true
    docker rm "$name" >/dev/null 2>&1 || true
    log_ok "Stopped and removed $name."
  else
    log_warn "$name was not running."
  fi
done

log_ok "QNAP TEST containers stopped. Repos data at the host bind-mount path is untouched."
