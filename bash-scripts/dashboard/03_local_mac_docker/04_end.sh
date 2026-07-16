#!/usr/bin/env bash
# Stops the local Mac stack (mongo + content-provider-api + dashboard).
# Only ever touches the chad-local compose project — never QNAP.
# --remove-orphans only, never -v: never deletes the mongo/dashboard data
# volumes. Never removes images.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
source "$SCRIPT_DIR/02_config.sh"

require_command docker "install Docker" || exit 1

echo ""
log_info "chad local-mac-docker — end"
echo ""

cd "$REPO_ROOT"
# `down` still needs the compose file's `image:` fields to interpolate, but
# doesn't need real tags (never pulls/runs them) — use the recorded tag if
# present, otherwise a harmless placeholder (see image_tag_for_readonly).
export IMAGE_TAG="$(image_tag_for_readonly "$(dashboard_image_tag_file)")"
docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" down --remove-orphans

log_ok "chad-local stack stopped. Data volumes and images preserved."
