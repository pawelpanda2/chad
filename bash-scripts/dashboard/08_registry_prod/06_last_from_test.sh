#!/usr/bin/env bash
# Promotes the exact image currently running on QNAP TEST to QNAP PROD via
# GHCR (Story 70) — pulls it onto the QNAP host BY DIGEST (not just trusting
# the shared local Docker image cache TEST's own pull already populated),
# so the promotion is verifiable against the registry, not just "whatever
# happens to be on disk."
#
# Never builds. Never creates a new release tag. Reads TEST's currently
# RUNNING image (not just a recorded tag file, in case of drift), shows the
# user exactly what will be promoted — tag, digest, git SHA — plus PROD's
# current image, before asking for confirmation. Aborts rather than
# guessing if TEST's image can't be unambiguously determined, has no
# recorded registry digest, or doesn't exist.
#
# This is PROD's ONLY deployment operation — bash-scripts/dashboard/
# 05_qnap_prod/{02_build,06_deploy}.sh do not exist (Story 63); PROD never
# builds or deploys independently.
#
# Related, untouched by Story 70: bash-scripts/dashboard/07_qnap_prod_ssh/
# 06_last_from_test.sh (Story 63's original) still works too — it relies on
# TEST and PROD sharing one Docker host's local image cache rather than an
# explicit registry pull. This script is the more rigorous, GHCR-native
# successor; both are safe to keep.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
source "$SCRIPT_DIR/01_config.sh"
load_qnap_ssh_config || exit 1

# Single remote inspection call — read-only, pure `docker inspect`, no repo
# checkout dependency at all.
INSPECT_CMD='
TEST_IMAGE_ID=$(docker inspect -f "{{.Image}}" chad-dashboard-test 2>/dev/null || true)
if [ -z "$TEST_IMAGE_ID" ]; then echo "ERROR=TEST container not running or not found"; exit 1; fi
TEST_DIGEST=$(docker image inspect -f "{{if .RepoDigests}}{{index .RepoDigests 0}}{{end}}" "$TEST_IMAGE_ID" 2>/dev/null | sed "s/.*@//")
if [ -z "$TEST_DIGEST" ]; then echo "ERROR=TEST image has no recorded registry digest (RepoDigests empty) - was it ever pulled from GHCR?"; exit 1; fi
TEST_REPOTAG=$(docker image inspect -f "{{if .RepoTags}}{{index .RepoTags 0}}{{end}}" "$TEST_IMAGE_ID" 2>/dev/null)
TEST_SHA=$(docker image inspect -f "{{index .Config.Labels \"org.opencontainers.image.revision\"}}" "$TEST_IMAGE_ID" 2>/dev/null || true)
PROD_IMAGE_ID=$(docker inspect -f "{{.Image}}" chad-dashboard-prod 2>/dev/null || true)
echo "TEST_IMAGE_ID=$TEST_IMAGE_ID"
echo "TEST_DIGEST=$TEST_DIGEST"
echo "TEST_REPOTAG=$TEST_REPOTAG"
echo "TEST_SHA=${TEST_SHA:-unknown}"
echo "PROD_IMAGE_ID=${PROD_IMAGE_ID:-not running}"
'

echo ""
log_info "Reading current TEST/PROD image state from QNAP..."
INSPECT_OUT="$(run_remote_capture "$INSPECT_CMD")"

if [ -z "$INSPECT_OUT" ] || echo "$INSPECT_OUT" | grep -q '^ERROR='; then
  log_error "Could not determine TEST's current image/digest — aborting rather than guessing."
  [ -n "$INSPECT_OUT" ] && echo "$INSPECT_OUT" | grep '^ERROR=' | sed 's/^ERROR=/  /'
  exit 1
fi

TEST_IMAGE_ID="$(echo "$INSPECT_OUT" | grep '^TEST_IMAGE_ID=' | cut -d= -f2-)"
TEST_DIGEST="$(echo "$INSPECT_OUT" | grep '^TEST_DIGEST=' | cut -d= -f2-)"
TEST_REPOTAG="$(echo "$INSPECT_OUT" | grep '^TEST_REPOTAG=' | cut -d= -f2-)"
TEST_SHA="$(echo "$INSPECT_OUT" | grep '^TEST_SHA=' | cut -d= -f2-)"
PROD_IMAGE_ID="$(echo "$INSPECT_OUT" | grep '^PROD_IMAGE_ID=' | cut -d= -f2-)"
TEST_TAG="${TEST_REPOTAG#*:}"

if [ -z "$TEST_IMAGE_ID" ] || [ -z "$TEST_DIGEST" ] || [ -z "$TEST_TAG" ]; then
  log_error "Incomplete image info from TEST — aborting rather than guessing."
  exit 1
fi

echo ""
log_info "About to promote TEST's image to PROD (pulled from GHCR by digest):"
log_info "  TEST tag:       $TEST_TAG"
log_info "  TEST image ID:  $TEST_IMAGE_ID"
log_info "  TEST digest:    sha256:$TEST_DIGEST"
log_info "  TEST git SHA:   ${TEST_SHA:-unknown}"
log_info "  PROD current:   ${PROD_IMAGE_ID:-not running}"
echo ""

log_warn "You are about to promote this exact image to PRODUCTION (${QNAP_SSH_HOST})."
read -r -p "Type 'PROD' to continue: " confirmation
if [ "$confirmation" != "PROD" ]; then
  log_error "Promotion cancelled."
  exit 1
fi

PROMOTE_CMD=$(cat <<EOF
set -euo pipefail
cd '$QNAP_REPO_DIR'
REPO_ROOT="$QNAP_REPO_DIR"
source bash-scripts/common/lib.sh
source bash-scripts/dashboard/08_registry_prod/01_config.sh
set -a
source .env.qnap
set +a
ghcr_docker_login "\$GHCR_REGISTRY" "\$GHCR_READ_USERNAME" "\$GHCR_READ_TOKEN"
ghcr_pull_and_retag 'sha256:$TEST_DIGEST'
docker tag "\$(ghcr_image_ref 'sha256:$TEST_DIGEST')" 'chad-dashboard:$TEST_TAG'
printf 'IMAGE_TAG=%s\n' '$TEST_TAG' > .image-tag.chad-dashboard.env.tmp.\$\$
mv .image-tag.chad-dashboard.env.tmp.\$\$ .image-tag.chad-dashboard.env
EOF
)
run_remote "Pulling TEST's exact image onto QNAP by digest (for PROD)" "$PROMOTE_CMD"

run_remote_script "05_qnap_prod" "03_restart.sh" "Restart QNAP PROD (promoted from TEST)"
run_remote_script "05_qnap_prod" "05_status.sh" "Status QNAP PROD"

echo ""
log_info "Verifying shared services and TEST are still healthy..."
run_remote_script "00_qnap_shared" "05_status.sh" "Status QNAP SHARED (mongo + content-provider-api)"
run_remote_script "04_qnap_test" "05_status.sh" "Status QNAP TEST (confirming it's still up)"

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
