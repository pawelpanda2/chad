#!/usr/bin/env bash
# Builds chad-dashboard and pushes it to GHCR. Runs LOCALLY (your Mac) —
# NEVER on QNAP (docker-compose.qnap.test.yml no longer even has a `build:`
# section; bash-scripts/dashboard/04_qnap_test/02_build.sh is disabled —
# see Story 70). GitHub Actions can also build+push
# (.github/workflows/build-dashboard-image.yml) using the exact same
# tagging/build/push logic below (bash-scripts/common/lib.sh's
# ghcr_build_tag_push) — not a second implementation.
#
# Tag format: <timestamp>-<short-git-sha> (e.g. 260717_143022-abc1234) —
# immutable, never "latest" (see documentation/ai-docs/deploy/
# image-tagging-standard.md). Records the git SHA as the standard
# org.opencontainers.image.revision OCI label on the image itself too.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
source "$SCRIPT_DIR/01_config.sh"

require_command docker "install Docker" || exit 1
require_file "$REPO_ROOT/.env.local" "cp .env.local.example .env.local and fill in real values (never commit .env.local)" || exit 1

set -a
# shellcheck source=/dev/null
source "$REPO_ROOT/.env.local"
set +a

echo ""
log_info "chad-dashboard — build + push to GHCR"
echo ""

ghcr_docker_login "$GHCR_REGISTRY" "$GHCR_PUSH_USERNAME" "$GHCR_PUSH_TOKEN" || exit 1

TAG="$(ghcr_build_tag_push)" || exit 1

echo ""
log_ok "Built and pushed: $(ghcr_image_ref "$TAG")"
log_info "Recorded tag for deploy: $TAG (see .image-tag.chad-dashboard.env)"
