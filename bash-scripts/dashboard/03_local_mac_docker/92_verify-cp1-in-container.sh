#!/usr/bin/env bash
# Verifies cp_1 bind mounts from INSIDE the local dashboard container
# (virtiofs can stay stale after a host remount — docker inspect is not enough).
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
source "$SCRIPT_DIR/01_config.sh"

CONTAINER="${CP1_DASHBOARD_CONTAINER:-chad-dashboard-local-mac-docker}"
# Paths inside the container that map to /Volumes/cp_1/... binds.
PROBE_PATHS=(
  "${CP1_CONTAINER_PHOTOS_PROBE:-/app/contact-photos}"
  "${CP1_CONTAINER_AUDIO_PROBE:-/app/audio-recordings}"
)
FS_TIMEOUT_SEC="${CP1_FS_TIMEOUT_SEC:-5}"

if [ "$(uname -s)" != "Darwin" ]; then
  log_warn "92_verify-cp1-in-container.sh is macOS-local only — skipping."
  exit 0
fi

# Story 123 — degraded mode: stub binds are intentional; do not fail verify.
MODE_FILE="$REPO_ROOT/.runtime/cp1-repair/mode"
if [ "${CHAD_CP1_MODE:-}" = "degraded" ] || [ "${CHAD_ALLOW_WITHOUT_CP1:-}" = "1" ] || \
   { [ -f "$MODE_FILE" ] && [ "$(tr -d '[:space:]' <"$MODE_FILE")" = "degraded" ]; }; then
  log_warn "92_verify-cp1-in-container.sh: cp_1 degraded — skipping bind probes."
  exit 0
fi

if ! docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
  log_error "Container $CONTAINER is not running — cannot verify cp_1 bind."
  exit 1
fi

for path in "${PROBE_PATHS[@]}"; do
  log_info "Probing $CONTAINER:$path ..."
  # Node is always present in the dashboard image; perl may not be.
  if ! docker exec "$CONTAINER" node -e '
const fs = require("fs");
const path = process.argv[1];
const ms = Number(process.argv[2]) * 1000;
const timer = setTimeout(() => { console.error("timeout"); process.exit(1); }, ms);
try {
  fs.readdirSync(path);
  clearTimeout(timer);
} catch (e) {
  clearTimeout(timer);
  console.error(e && e.code ? e.code : e);
  process.exit(1);
}
' "$path" "$FS_TIMEOUT_SEC"; then
    log_error "Container bind probe FAILED for $path (stale virtiofs / dead host mount?)."
    exit 1
  fi
  log_ok "Container bind OK: $path"
done

exit 0
