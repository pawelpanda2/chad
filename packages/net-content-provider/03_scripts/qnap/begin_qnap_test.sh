#!/usr/bin/env bash
# Starts the QNAP-TEST backend API + Blazor GUI containers. Idempotent: if
# QNAP TEST is already running, stops it first (via end_qnap_test.sh) then
# starts fresh — never errors out just because it's already up. Only ever
# touches cp-api-test / cp-blazor-test / cp-test-network — never production
# or local-mac containers, even if they share an image name.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/lib.sh"

cd "$REPO_ROOT"

echo ""
log_info "Content Provider — begin QNAP TEST"
echo ""

require_command docker "install Docker" || exit 1

ENV_FILE="$REPO_ROOT/.env"
require_file "$ENV_FILE" "cp .env.qnap-test.example .env and fill in real values" || exit 1
set -a
source "$ENV_FILE"
set +a

QNAP_REPOS_HOST_PATH="${QNAP_REPOS_HOST_PATH:?Set QNAP_REPOS_HOST_PATH in .env}"
CONTAINER_REPOS_PATH="${CONTAINER_REPOS_PATH:-/data/repos}"
CONTENT_PROVIDER_API_PORT="${CONTENT_PROVIDER_API_PORT:-12024}"
BLAZOR_PORT="${BLAZOR_PORT:-12024}"

# ---------------------------------------------------------------------------
# Validate the repos directory BEFORE starting anything — the backend
# crashes on startup (unhandled exception) if it finds zero repos there
# (confirmed by reading SharpRepoServiceProg/Service/RepoService.cs:
# InitGroupsFromSearchPaths throws if GetReposCount() is not > 0). Fail
# clearly here instead of a confusing container crash-loop.
# ---------------------------------------------------------------------------
if [ ! -d "$QNAP_REPOS_HOST_PATH" ]; then
  log_error "Repos directory does not exist: $QNAP_REPOS_HOST_PATH"
  exit 1
fi

if [ -z "$(ls -A "$QNAP_REPOS_HOST_PATH" 2>/dev/null)" ]; then
  log_error "Repos directory is empty: $QNAP_REPOS_HOST_PATH"
  log_error "  The backend requires at least one valid repo (a folder with a config.yaml) to start at all."
  exit 1
fi

if [ ! -r "$QNAP_REPOS_HOST_PATH" ]; then
  log_error "No read permission on: $QNAP_REPOS_HOST_PATH"
  exit 1
fi

log_ok "Repos directory looks OK: $QNAP_REPOS_HOST_PATH"

for img in "$CP_TEST_API_IMAGE" "$CP_TEST_BLAZOR_IMAGE"; do
  if ! docker image inspect "$img" >/dev/null 2>&1; then
    log_error "Image not found: $img"
    log_error "  Fix: bash 03_scripts/qnap/build_qnap_test.sh"
    exit 1
  fi
done

if docker ps --format '{{.Names}}' | grep -qx "$CP_TEST_API_CONTAINER" || docker ps --format '{{.Names}}' | grep -qx "$CP_TEST_BLAZOR_CONTAINER"; then
  log_warn "QNAP TEST is already running — stopping it first, then starting fresh."
  bash "$SCRIPT_DIR/end_qnap_test.sh"
fi

docker network inspect "$CP_TEST_NETWORK" >/dev/null 2>&1 || docker network create "$CP_TEST_NETWORK" >/dev/null
log_ok "Network ready: $CP_TEST_NETWORK"

# Clean up any stopped-but-not-removed prior test containers (end_qnap_test.sh
# above already removes running ones; this also catches leftovers from a
# previous crashed/interrupted run).
for name in "$CP_TEST_API_CONTAINER" "$CP_TEST_BLAZOR_CONTAINER"; do
  if docker ps -a --format '{{.Names}}' | grep -qx "$name"; then
    docker rm "$name" >/dev/null
  fi
done

# appsettings.json bakes ApiUrls=http://0.0.0.0:12024 into the image
# (SharpContainerApi/appsettings.json), and ConfigurePortFromSettingsIfExists()
# reads that from IConfiguration, which ASP.NET Core lets env vars override.
# Without this override, the container always listens on 12024 internally
# regardless of CONTENT_PROVIDER_API_PORT, so -p would silently map to the
# wrong internal port whenever the configured port differs from 12024
# (confirmed by a real local run: health check timed out until this was added).
log_info "Starting $CP_TEST_API_CONTAINER (port $CONTENT_PROVIDER_API_PORT, repos at $CONTAINER_REPOS_PATH)..."
docker run -d \
  --name "$CP_TEST_API_CONTAINER" \
  --network "$CP_TEST_NETWORK" \
  --restart unless-stopped \
  -p "$CONTENT_PROVIDER_API_PORT:$CONTENT_PROVIDER_API_PORT" \
  -v "$QNAP_REPOS_HOST_PATH:$CONTAINER_REPOS_PATH:rw" \
  -e "PreparerModule__NoSqlRepoSearchPaths__0=$CONTAINER_REPOS_PATH" \
  -e "ApiUrls=http://0.0.0.0:$CONTENT_PROVIDER_API_PORT" \
  "$CP_TEST_API_IMAGE" >/dev/null
log_ok "$CP_TEST_API_CONTAINER started."

log_info "Starting $CP_TEST_BLAZOR_CONTAINER (port $BLAZOR_PORT)..."
docker run -d \
  --name "$CP_TEST_BLAZOR_CONTAINER" \
  --network "$CP_TEST_NETWORK" \
  --restart unless-stopped \
  -p "$BLAZOR_PORT:80" \
  "$CP_TEST_BLAZOR_IMAGE" >/dev/null
log_ok "$CP_TEST_BLAZOR_CONTAINER started."

echo ""
log_info "Waiting for API health..."
HEALTHY=false
for _ in $(seq 1 30); do
  if curl -fsS -m 3 "http://localhost:$CONTENT_PROVIDER_API_PORT/health" >/dev/null 2>&1; then
    HEALTHY=true
    break
  fi
  sleep 2
done

if [ "$HEALTHY" != true ]; then
  log_error "API did not become healthy in time."
  log_error "  Check: docker logs $CP_TEST_API_CONTAINER"
  exit 1
fi

HEALTH_JSON="$(curl -fsS -m 3 "http://localhost:$CONTENT_PROVIDER_API_PORT/health")"
log_ok "API healthy: $HEALTH_JSON"

if ! echo "$HEALTH_JSON" | grep -q '"anyRepoFound":true'; then
  log_error "API is up but reports no repos found. Check $QNAP_REPOS_HOST_PATH contents and PreparerModule__NoSqlRepoSearchPaths__0."
  exit 1
fi

echo ""
log_ok "QNAP TEST environment is up."
log_info "Backend API:  http://<QNAP-IP>:$CONTENT_PROVIDER_API_PORT/health"
log_info "Blazor GUI:   http://<QNAP-IP>:$BLAZOR_PORT"
