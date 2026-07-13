#!/usr/bin/env bash
# Builds the shared content-provider-api image (the only buildable service
# in docker-compose.qnap.shared.yml — mongodb uses a plain upstream image).
# Only builds — never runs containers, never touches a running environment.
# Run this ON the QNAP host (or via
# bash-scripts/dashboard/06_qnap_ssh/deploy_shared.sh from your Mac).
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
source "$SCRIPT_DIR/01_config.sh"

require_command docker "install Docker" || exit 1
require_file "$ENV_FILE" "cp .env.qnap.example .env.qnap and fill in real values (never commit .env.qnap)" || exit 1

echo ""
log_info "chad QNAP SHARED — build"
echo ""

cd "$REPO_ROOT"

# Plain date+time tag, same convention as 04_qnap_test/05_qnap_prod. Own CHAD
# images never get a `:latest` tag (see
# documentation/ai-docs/deploy/image-tagging-standard.md) — this is the ONLY
# tag this build produces.
IMAGE_TAG="$(date +'%y%m%d_%H%M%S')"
export IMAGE_TAG

docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build --pull

# Only reached if `build` succeeded (set -e) — never records a tag for a
# failed build.
write_image_tag "$(content_provider_image_tag_file)" "$IMAGE_TAG"

log_ok "Image built: chad-content-provider-api:$IMAGE_TAG"
