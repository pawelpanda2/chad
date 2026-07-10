#!/usr/bin/env bash
# Builds the two QNAP-TEST images (backend API + Blazor GUI). Does NOT
# touch production images/containers, does NOT do broad image cleanup.
#
# Uses docker buildx with the same platform-detection pattern already used
# by 03_scripts/03_local-mac_docker/01_image_api_charp.sh / 03_image_blazor.sh
# (00_common/detect_arch.sh), not a new build mechanism.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/lib.sh"

cd "$REPO_ROOT"

echo ""
log_info "Content Provider — build QNAP TEST images"
echo ""

require_command docker "install Docker" || exit 1

ENV_FILE="$REPO_ROOT/.env"
require_file "$ENV_FILE" "cp .env.qnap-test.example .env and fill in real values (never commit .env)" || exit 1

set -a
source "$ENV_FILE"
set +a

: "${QNAP_PUBLIC_HOST:?Set QNAP_PUBLIC_HOST in .env (the QNAP hostname/IP) before building}"
if [ "$QNAP_PUBLIC_HOST" = "change_me" ]; then
  log_error "QNAP_PUBLIC_HOST is still the placeholder 'change_me' in .env — set it to the real QNAP address."
  exit 1
fi

CONTENT_PROVIDER_API_PORT="${CONTENT_PROVIDER_API_PORT:-12024}"
BLAZOR_API_URL="http://${QNAP_PUBLIC_HOST}:${CONTENT_PROVIDER_API_PORT}"

COMMON_SCRIPTS_DIR="$REPO_ROOT/03_scripts/00_common"
if [ -f "$COMMON_SCRIPTS_DIR/detect_arch.sh" ]; then
  DETECTED_PLATFORM=$("$COMMON_SCRIPTS_DIR/detect_arch.sh")
else
  ARCH=$(uname -m)
  case "$ARCH" in
    arm64|aarch64) DETECTED_PLATFORM="linux/arm64" ;;
    *) DETECTED_PLATFORM="linux/amd64" ;;
  esac
fi
log_info "Detected build platform: $DETECTED_PLATFORM"

TS_TAG="$(build_timestamp_tag)"
API_TS_IMAGE="cp_webapi_test:${TS_TAG}"
BLAZOR_TS_IMAGE="cp_blazor_test:${TS_TAG}"

log_info "Building backend image: $CP_TEST_API_IMAGE (+ $API_TS_IMAGE)"
docker buildx build \
  --platform "$DETECTED_PLATFORM" \
  -f 04_dockerfiles/webapi \
  -t "$CP_TEST_API_IMAGE" \
  -t "$API_TS_IMAGE" \
  --load \
  "$REPO_ROOT"
log_ok "Backend image built."

log_info "Building Blazor image: $CP_TEST_BLAZOR_IMAGE (+ $BLAZOR_TS_IMAGE) (ContentProviderApiUrl=$BLAZOR_API_URL)"
docker buildx build \
  --platform "$DETECTED_PLATFORM" \
  -f 04_dockerfiles/assembly \
  -t "$CP_TEST_BLAZOR_IMAGE" \
  -t "$BLAZOR_TS_IMAGE" \
  --build-arg "CONTENT_PROVIDER_API_URL=$BLAZOR_API_URL" \
  --load \
  "$REPO_ROOT"
log_ok "Blazor image built."

echo ""
log_ok "Build complete:"
log_ok "  $CP_TEST_API_IMAGE  (also tagged $API_TS_IMAGE)"
log_ok "  $CP_TEST_BLAZOR_IMAGE  (also tagged $BLAZOR_TS_IMAGE)"
