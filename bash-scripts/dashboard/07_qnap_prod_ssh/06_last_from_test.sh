#!/usr/bin/env bash
# Promotes the exact image currently running on QNAP TEST to QNAP PROD.
# Never builds. Never creates a new release tag. Reads TEST's currently
# RUNNING image (not just the tag-record file, in case it's drifted since
# TEST was last restarted), shows the user exactly what will be promoted —
# tag, image ID, git commit (org.opencontainers.image.revision label written
# by 04_qnap_test/02_build.sh) — plus PROD's current image, before asking for
# confirmation. Aborts rather than guessing if TEST's image can't be
# unambiguously determined or doesn't exist on the QNAP host.
#
# This is PROD's ONLY deployment operation (05_qnap_prod/{02_build,06_deploy}.sh
# do not exist — PROD never builds or deploys independently, see
# documentation/ai-docs/deploy/dashboard-deployment-scripts.md).
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
load_qnap_ssh_config || exit 1

# Single remote inspection call — read-only, no git pull needed (this
# doesn't deploy new code, only promotes an already-built image).
INSPECT_CMD='
TEST_IMAGE_ID=$(docker inspect -f "{{.Image}}" chad-dashboard-test 2>/dev/null || true)
if [ -z "$TEST_IMAGE_ID" ]; then echo "ERROR=TEST container not running or not found"; exit 1; fi
if ! docker image inspect "$TEST_IMAGE_ID" >/dev/null 2>&1; then echo "ERROR=TEST image $TEST_IMAGE_ID not found locally"; exit 1; fi
TEST_REPOTAG=$(docker image inspect -f "{{if .RepoTags}}{{index .RepoTags 0}}{{end}}" "$TEST_IMAGE_ID" 2>/dev/null || true)
TEST_SHA=$(docker image inspect -f "{{index .Config.Labels \"org.opencontainers.image.revision\"}}" "$TEST_IMAGE_ID" 2>/dev/null || true)
PROD_IMAGE_ID=$(docker inspect -f "{{.Image}}" chad-dashboard-prod 2>/dev/null || true)
echo "TEST_IMAGE_ID=$TEST_IMAGE_ID"
echo "TEST_REPOTAG=$TEST_REPOTAG"
echo "TEST_SHA=${TEST_SHA:-unknown}"
echo "PROD_IMAGE_ID=${PROD_IMAGE_ID:-not running}"
'

echo ""
log_info "Reading current TEST/PROD image state from QNAP..."
INSPECT_OUT="$(run_remote_capture "$INSPECT_CMD")"

if [ -z "$INSPECT_OUT" ] || echo "$INSPECT_OUT" | grep -q '^ERROR='; then
  log_error "Could not determine TEST's current image — aborting rather than guessing."
  [ -n "$INSPECT_OUT" ] && echo "$INSPECT_OUT" | grep '^ERROR=' | sed 's/^ERROR=/  /'
  exit 1
fi

TEST_IMAGE_ID="$(echo "$INSPECT_OUT" | grep '^TEST_IMAGE_ID=' | cut -d= -f2-)"
TEST_REPOTAG="$(echo "$INSPECT_OUT" | grep '^TEST_REPOTAG=' | cut -d= -f2-)"
TEST_SHA="$(echo "$INSPECT_OUT" | grep '^TEST_SHA=' | cut -d= -f2-)"
PROD_IMAGE_ID="$(echo "$INSPECT_OUT" | grep '^PROD_IMAGE_ID=' | cut -d= -f2-)"
TEST_TAG="${TEST_REPOTAG#*:}"

if [ -z "$TEST_IMAGE_ID" ]; then
  log_error "TEST image ID came back empty — aborting rather than guessing."
  exit 1
fi

echo ""
log_info "About to promote TEST's image to PROD:"
log_info "  TEST tag:       ${TEST_REPOTAG:-unknown}"
log_info "  TEST image ID:  $TEST_IMAGE_ID"
log_info "  TEST git SHA:   $TEST_SHA"
log_info "  PROD current:   $PROD_IMAGE_ID"
echo ""

log_warn "You are about to promote this exact image to PRODUCTION (${QNAP_SSH_HOST})."
read -r -p "Type 'PROD' to continue: " confirmation
if [ "$confirmation" != "PROD" ]; then
  log_error "Promotion cancelled."
  exit 1
fi

# Point PROD at TEST's confirmed tag — a write of the existing shared
# tag-record mechanism (bash-scripts/common/lib.sh's write_image_tag),
# reproduced remotely here since that file lives on the QNAP host, not
# locally. Atomic (temp file + mv), matching write_image_tag's own pattern.
WRITE_TAG_CMD="printf 'IMAGE_TAG=%s\n' '$TEST_TAG' > '$QNAP_REPO_DIR/.image-tag.chad-dashboard.env.tmp.\$\$' && mv '$QNAP_REPO_DIR/.image-tag.chad-dashboard.env.tmp.\$\$' '$QNAP_REPO_DIR/.image-tag.chad-dashboard.env'"
run_remote "Recording promoted tag for PROD" "$WRITE_TAG_CMD"

run_remote_script "05_qnap_prod" "03_restart.sh" "Restart QNAP PROD (promoted from TEST)"
run_remote_script "05_qnap_prod" "05_status.sh" "Status QNAP PROD"

echo ""
log_info "Confirming TEST and PROD now point at the same image..."
FINAL_OUT="$(run_remote_capture 'echo "TEST=$(docker inspect -f "{{.Image}}" chad-dashboard-test 2>/dev/null)"; echo "PROD=$(docker inspect -f "{{.Image}}" chad-dashboard-prod 2>/dev/null)"')"
FINAL_TEST="$(echo "$FINAL_OUT" | grep '^TEST=' | cut -d= -f2-)"
FINAL_PROD="$(echo "$FINAL_OUT" | grep '^PROD=' | cut -d= -f2-)"

if [ -n "$FINAL_TEST" ] && [ "$FINAL_TEST" = "$FINAL_PROD" ]; then
  log_ok "Confirmed: chad-dashboard-test and chad-dashboard-prod are running the identical image ($FINAL_TEST)."
else
  log_error "Image mismatch after promotion — TEST=$FINAL_TEST, PROD=$FINAL_PROD. Investigate before trusting this deploy."
  exit 1
fi
