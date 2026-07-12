#!/usr/bin/env bash
# Builds the QNAP PROD dashboard image only. Never runs containers, never
# touches a running environment, never builds/touches the shared mongo/
# content-provider-api stack (see bash-scripts/dashboard/00_qnap_shared/).
# PROD deployment requires separate explicit approval — building images
# does not deploy anything by itself. See 03_begin.sh / 04_end.sh /
# 05_status.sh / 06_deploy.sh.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
source "$SCRIPT_DIR/01_config.sh"

require_command docker "install Docker" || exit 1
require_file "$ENV_FILE" "cp .env.qnap.example .env.qnap and fill in real values (never commit .env.qnap)" || exit 1

echo ""
log_info "chad QNAP PROD — build"
echo ""

cd "$REPO_ROOT"

# Plain date+time tag (no environment/arch suffix) — environment is already
# distinguished by compose project name, ports, and container names, not by
# the image tag. Own CHAD images never get a `:latest` tag (see
# documentation/ai-docs/deploy/image-tagging-standard.md) — this is the ONLY
# tag this build produces. 04_qnap_test and 05_qnap_prod build the exact same
# chad-dashboard image (same Dockerfile/context/target — see
# docker-compose.qnap.{test,prod}.yml), so they share ONE canonical tag-record
# file: build once (from either environment), then `begin` in both to deploy
# the identical image without a second build. Normal promotion TEST -> PROD
# does NOT run this script again — it just runs 05_qnap_prod/03_begin.sh,
# which reads the same tag-record file 04_qnap_test/02_build.sh already wrote.
IMAGE_TAG="$(date +'%y%m%d_%H%M%S')"
export IMAGE_TAG

docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build --pull

# Only reached if `build` succeeded (set -e) — never records a tag for a
# failed build.
write_image_tag "$(dashboard_image_tag_file)" "$IMAGE_TAG"

log_ok "Image built: chad-dashboard:$IMAGE_TAG"
