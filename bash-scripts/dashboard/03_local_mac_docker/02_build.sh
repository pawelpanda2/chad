#!/usr/bin/env bash
# Builds the full local Mac stack (mongo + content-provider-api + dashboard)
# under docker-compose. Only builds — never runs containers, never touches
# a running environment, never `docker compose up`, never removes volumes.
# See 04_re-start.sh (start, idempotent) / 05_end.sh (stop) / 06_status.sh /
# 07_deploy.sh (build + re-start, one shot).
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
source "$SCRIPT_DIR/02_config.sh"

require_command docker "install Docker" || exit 1
require_file "$ENV_FILE" "cp .env.local.example .env.local and fill in real values (never commit .env.local)" || exit 1

echo ""
log_info "chad local-mac-docker — build"
echo ""

cd "$REPO_ROOT"

# Plain date+time tag (no environment/arch suffix) — environment is already
# distinguished by compose project name, ports, and container names, not by
# the image tag. Own CHAD images never get a `:latest` tag (see
# documentation/ai-docs/deploy/image-tagging-standard.md) — this is the ONLY
# tag this build produces, for BOTH images (they share one timestamp since
# they're built in the same invocation here).
IMAGE_TAG="$(date +'%y%m%d_%H%M%S')"
export IMAGE_TAG

docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build --pull

# Only reached if `build` succeeded (set -e) — never records a tag for a
# failed build.
write_image_tag "$(dashboard_image_tag_file)" "$IMAGE_TAG"
write_image_tag "$(content_provider_image_tag_file)" "$IMAGE_TAG"

log_ok "Images built: chad-dashboard:$IMAGE_TAG, chad-content-provider-api:$IMAGE_TAG"
