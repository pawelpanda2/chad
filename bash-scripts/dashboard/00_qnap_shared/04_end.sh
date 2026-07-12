#!/usr/bin/env bash
# Stops the QNAP SHARED stack (mongo + content-provider-api).
# --remove-orphans only, never -v: never deletes the mongo data bind mount.
# Never removes images.
#
# WARNING: this stack is shared by BOTH chad-dashboard-test and
# chad-dashboard-prod. Stopping it takes down the backend for BOTH
# dashboards, even though their containers keep running.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
source "$SCRIPT_DIR/01_config.sh"

require_command docker "install Docker" || exit 1

echo ""
log_warn "chad QNAP SHARED — end (this stops MongoDB + Content Provider API used by BOTH TEST and PROD dashboards)"
echo ""

cd "$REPO_ROOT"
# `down` still needs the compose file's `image:` field to interpolate, but
# doesn't need a real tag (never pulls/runs it) — use the recorded tag if
# present, otherwise a harmless placeholder (see image_tag_for_readonly).
export IMAGE_TAG="$(image_tag_for_readonly "$(content_provider_image_tag_file)")"
docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" down --remove-orphans

log_ok "chad-shared stack stopped. Data (MongoDB bind mount) and images preserved."
