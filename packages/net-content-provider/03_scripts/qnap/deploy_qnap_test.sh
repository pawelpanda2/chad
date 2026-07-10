#!/usr/bin/env bash
# Main entry point: git clone -> copy .env -> bash this script.
#
# Flow: preflight -> config validation -> repos validation -> build ->
# stop only the previous QNAP-TEST version -> start API -> start Blazor ->
# API health check -> repo-visibility check -> Blazor health check -> report.
#
# Reuses build_qnap_test.sh / end_qnap_test.sh / begin_qnap_test.sh /
# status_qnap_test.sh rather than duplicating their logic. Stops on the
# first failure with a clear message — never silently continues.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/lib.sh"

echo ""
log_info "=========================================="
log_info "Content Provider — QNAP TEST full deploy"
log_info "=========================================="
echo ""

# --- Preflight: tools ---
log_info "Step 1/6: preflight checks"
require_command docker "install Docker" || exit 1
require_command curl "install curl" || exit 1
log_ok "Tools OK."

# --- Config validation ---
echo ""
log_info "Step 2/6: config validation"
ENV_FILE="$REPO_ROOT/.env"
require_file "$ENV_FILE" "cp .env.qnap-test.example .env and fill in real values (never commit .env)" || exit 1
set -a
source "$ENV_FILE"
set +a
: "${QNAP_REPOS_HOST_PATH:?Set QNAP_REPOS_HOST_PATH in .env}"
: "${QNAP_PUBLIC_HOST:?Set QNAP_PUBLIC_HOST in .env}"
if [ "$QNAP_PUBLIC_HOST" = "change_me" ]; then
  log_error "QNAP_PUBLIC_HOST is still 'change_me' in .env."
  exit 1
fi
log_ok "Config OK."

# --- Repos validation (same checks begin_qnap_test.sh does, done here too
# so deploy fails fast before spending time on a build) ---
echo ""
log_info "Step 3/6: repos directory validation ($QNAP_REPOS_HOST_PATH)"
if [ ! -d "$QNAP_REPOS_HOST_PATH" ]; then
  log_error "Repos directory does not exist: $QNAP_REPOS_HOST_PATH"
  exit 1
fi
if [ -z "$(ls -A "$QNAP_REPOS_HOST_PATH" 2>/dev/null)" ]; then
  log_error "Repos directory is empty: $QNAP_REPOS_HOST_PATH — need at least one valid repo (folder with config.yaml)."
  exit 1
fi
if [ ! -r "$QNAP_REPOS_HOST_PATH" ]; then
  log_error "No read permission on: $QNAP_REPOS_HOST_PATH"
  exit 1
fi
log_ok "Repos directory OK."

# --- Build ---
echo ""
log_info "Step 4/6: build"
bash "$SCRIPT_DIR/build_qnap_test.sh"

# --- Stop only the previous TEST version (never prod, never local-mac) ---
echo ""
log_info "Step 5/6: stopping previous QNAP-TEST version (if any)"
bash "$SCRIPT_DIR/end_qnap_test.sh"

# --- Start + health checks (begin_qnap_test.sh already waits for API
# health and checks anyRepoFound; if it fails, it exits non-zero and this
# script stops here too) ---
echo ""
log_info "Step 6/6: starting QNAP-TEST and verifying health"
bash "$SCRIPT_DIR/begin_qnap_test.sh"

echo ""
log_info "Waiting for Blazor GUI to respond..."
BLAZOR_PORT="${BLAZOR_PORT:-12020}"
GUI_OK=false
for _ in $(seq 1 20); do
  if curl -fsS -o /dev/null -m 3 -w '%{http_code}' "http://localhost:$BLAZOR_PORT" 2>/dev/null | grep -qE '^[23]'; then
    GUI_OK=true
    break
  fi
  sleep 2
done

if [ "$GUI_OK" != true ]; then
  log_error "Blazor GUI did not respond in time on port $BLAZOR_PORT."
  log_error "  Check: docker logs $CP_TEST_BLAZOR_CONTAINER"
  exit 1
fi
log_ok "Blazor GUI responds."

echo ""
log_info "=========================================="
log_ok "DEPLOY COMPLETE"
log_info "=========================================="
bash "$SCRIPT_DIR/status_qnap_test.sh"
