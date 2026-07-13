#!/usr/bin/env bash
# Shows container status + health for the QNAP SHARED docker-compose stack
# (mongo + content-provider-api). Never changes state.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
source "$SCRIPT_DIR/01_config.sh"

echo ""
log_info "chad QNAP SHARED — status"
echo ""

cd "$REPO_ROOT"
# `ps` still needs the compose file's `image:` field to interpolate, but
# doesn't need a real tag (never pulls/runs it) — use the recorded tag if
# present, otherwise a harmless placeholder (see image_tag_for_readonly).
export IMAGE_TAG="$(image_tag_for_readonly "$(content_provider_image_tag_file)")"
docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps

echo ""
if docker network inspect chad-shared >/dev/null 2>&1; then
  log_ok "Docker network 'chad-shared' exists."
else
  log_warn "Docker network 'chad-shared' does NOT exist."
fi

echo ""
mongo_state="$(docker inspect -f '{{.State.Health.Status}}' chad-mongodb 2>/dev/null || true)"
if [ "$mongo_state" = "healthy" ]; then
  log_ok "chad-mongodb healthy."
else
  log_warn "chad-mongodb state: ${mongo_state:-not found}."
fi

echo ""
if curl -fsS -m 3 "http://localhost:$CONTENT_PROVIDER_API_PORT/health" 2>/dev/null; then
  echo ""
  log_ok "content-provider-api healthy (port $CONTENT_PROVIDER_API_PORT)."
else
  echo ""
  log_warn "content-provider-api did NOT respond on port $CONTENT_PROVIDER_API_PORT."
fi
