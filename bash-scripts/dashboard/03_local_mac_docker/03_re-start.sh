#!/usr/bin/env bash
# Starts the local Mac stack (mongo + dashboard) under docker-compose.
# Never builds. Idempotent: checks whether the stack is already running; if
# so, calls 04_end.sh (docker compose down --remove-orphans, never -v) then
# starts fresh. Use 06_deploy.sh for build+restart.
#
# Story 118: ensure/repair host cp_1 as early as possible after config/tool
# validation. Fail hard if repair fails (no Compose decoy under /Volumes/cp_1).
# After up, verify binds from inside the dashboard container.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
source "$SCRIPT_DIR/01_config.sh"

require_command docker "install Docker" || exit 1
require_file "$ENV_FILE" "cp .env.local.example .env.local and fill in real values" || exit 1

echo ""
log_info "chad local-mac-docker — restart"
echo ""

cd "$REPO_ROOT"

# No `:latest` fallback — refuses to start without a recorded release tag.
require_image_tag "$(dashboard_image_tag_file)" "chad-dashboard" || exit 1

# Story 118/123 — host cp_1 preflight BEFORE port kill / compose up so a dead
# SMB share never becomes a local decoy directory via create_host_path.
log_info "Preflight: ensure/repair QNAP SMB cp_1 on host (/Volumes/cp_1)..."
bash "$SCRIPT_DIR/91_ensure-cp1-mounted.sh" || exit 1

CP1_MODE_FILE="$REPO_ROOT/.runtime/cp1-repair/mode"
CP1_MODE="healthy"
if [ -f "$CP1_MODE_FILE" ]; then
  CP1_MODE="$(tr -d '[:space:]' <"$CP1_MODE_FILE" || true)"
fi
# Compat: explicit allow without a mode file still means degraded.
if [ "${CHAD_ALLOW_WITHOUT_CP1:-}" = "1" ] && [ "$CP1_MODE" != "healthy" ]; then
  CP1_MODE="degraded"
fi

CP1_DEGRADED=0
if [ "$CP1_MODE" = "degraded" ]; then
  CP1_DEGRADED=1
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/97_prepare-cp1-degraded-binds.sh"
  log_warn "cp_1 DEGRADED — skipping host/container healthy-mount checks."
else
  if ! /usr/bin/perl -e '
    use strict; use warnings;
    my ($path, $timeout) = @ARGV;
    eval {
      local $SIG{ALRM} = sub { die "timeout\n" };
      alarm $timeout;
      opendir(my $dh, $path) or die $!;
      readdir($dh); closedir($dh);
      alarm 0;
    };
    exit($@ ? 1 : 0);
  ' "/Volumes/cp_1/chad-data/02_files_refrenced" "${CP1_FS_TIMEOUT_SEC:-5}"; then
    log_error "Host read of /Volumes/cp_1/chad-data/02_files_refrenced failed after ensure."
    exit 1
  fi
  log_ok "Host cp_1 read verified."
  # Ensure compose uses real share paths (clear any stale degraded exports).
  unset CHAD_CONTACT_PHOTOS_HOST_PATH CHAD_AUDIO_RECORDINGS_HOST_PATH CHAD_CP1_MODE || true
  printf '%s\n' "healthy" >"$CP1_MODE_FILE" 2>/dev/null || true
fi

if docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps --format json 2>/dev/null | grep -q '"State":"running"'; then
  log_warn "chad-local stack is already running — stopping it first, then starting fresh."
  bash "$SCRIPT_DIR/04_end.sh"
fi

# Preflight: free up all ports this stack needs — Docker container (from
# another compose project, or a manual `docker run`) OR plain process (e.g.
# a stray `next dev`/`pnpm` from the 02_local_mac_tmux flow). Ports come
# from 01_config.sh, never hardcoded here, so there's one place to change
# them. 90_port-kill.sh (not ensure_port_available directly) does the actual
# freeing — it's the same "official script" other flows call too, see that
# file for exactly how it decides Docker-stop-and-remove vs
# SIGTERM-then-SIGKILL. Once every port is confirmed free, only THEN is the
# stack started.
REQUIRED_PORTS=("$DASHBOARD_PORT" "$MONGODB_PORT" "${POSTGRES_PORT:-5433}")

log_info "Freeing required ports before starting: ${REQUIRED_PORTS[*]}"
for port in "${REQUIRED_PORTS[@]}"; do
  bash "$SCRIPT_DIR/90_port-kill.sh" "$port" || exit 1
done

log_info "Re-checking port availability before starting the stack..."
for port in "${REQUIRED_PORTS[@]}"; do
  ensure_port_available "$port" || exit 1
done

docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d

# Story 118/123 — virtiofs may keep a stale bind after host remount; probe from
# inside the dashboard container (not only docker inspect). Skip in degraded.
if [ "$CP1_DEGRADED" = "1" ]; then
  log_warn "Skipping 92_verify-cp1-in-container.sh (cp_1 degraded)."
else
  log_info "Verifying cp_1 binds from inside dashboard container..."
  bash "$SCRIPT_DIR/92_verify-cp1-in-container.sh" || exit 1
fi

# Keep the local Postgres volume as a mirror of QNAP (Story 89) so login
# (chad_admin/users-list) and Dev Panel reads use real data.
log_info "Waiting for local Postgres to accept connections..."
ready=0
for _ in $(seq 1 30); do
  if docker exec chad-postgres-local-mac-docker pg_isready -U "${POSTGRES_USER:-chad}" -d "${POSTGRES_DB:-chad}" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [ "$ready" != "1" ]; then
  log_error "Local Postgres did not become ready in time."
  exit 1
fi

if [ -z "${LOCAL_POSTGRES_HOST_URI:-}" ]; then
  _pg_user="$(read_env_var "$ENV_FILE" POSTGRES_USER)"
  _pg_pass="$(read_env_var "$ENV_FILE" POSTGRES_PASSWORD)"
  _pg_db="$(read_env_var "$ENV_FILE" POSTGRES_DB)"
  _pg_port="$(read_env_var "$ENV_FILE" POSTGRES_PORT)"
  LOCAL_POSTGRES_HOST_URI="postgres://${_pg_user:-chad}:${_pg_pass}@127.0.0.1:${_pg_port:-5433}/${_pg_db:-chad}"
fi

log_info "Migrating schema + ensuring local Postgres has login data..."
(
  cd "$REPO_ROOT"
  pnpm --filter dba build >/dev/null
  POSTGRES_URI="$LOCAL_POSTGRES_HOST_URI" node packages/dba/scripts/apply-postgres-migrations.mjs
  LOCAL_ITEMS="$(POSTGRES_URI="$LOCAL_POSTGRES_HOST_URI" node -e "
    import pg from 'pg';
    const c=new pg.Client({connectionString:process.env.POSTGRES_URI});
    await c.connect();
    const r=await c.query('SELECT count(*)::int AS c FROM cp_items');
    console.log(r.rows[0].c);
    await c.end();
  ")"
  if [ "${LOCAL_ITEMS:-0}" -lt 50 ]; then
    log_warn "Local Postgres has only ${LOCAL_ITEMS} cp_items — restoring from QNAP Mongo (not QNAP Postgres; server PG may be mid-migration)."
  MONGO_ROOT_USERNAME="$(read_env_var "$ENV_FILE" MONGO_ROOT_USERNAME)"
  MONGO_ROOT_PASSWORD="$(read_env_var "$ENV_FILE" MONGO_ROOT_PASSWORD)"
  QNAP_TAILSCALE_HOST="100.117.139.83"
  QNAP_MONGO_PORT="12040"
  MONGODB_URI="mongodb://${MONGO_ROOT_USERNAME}:${MONGO_ROOT_PASSWORD}@${QNAP_TAILSCALE_HOST}:${QNAP_MONGO_PORT}/chad?authSource=admin&directConnection=true"
  POSTGRES_URI="$LOCAL_POSTGRES_HOST_URI" MONGODB_URI="$MONGODB_URI" \
    node packages/dba/scripts/migrate-mongo-to-postgres.mjs --all --apply
  else
    log_info "Local Postgres has ${LOCAL_ITEMS} cp_items — skipping QNAP sync (use 07_sync-postgres-from-qnap.sh manually if needed)."
  fi
  POSTGRES_URI="$LOCAL_POSTGRES_HOST_URI" node packages/dba/scripts/seed-local-postgres-login.mjs
) || {
  log_error "Local Postgres migrate/sync/seed failed."
  exit 1
}

log_info "Waiting for dashboard to respond..."
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null -m 3 "http://localhost:$DASHBOARD_PORT" 2>/dev/null; then
    break
  fi
  sleep 2
done

echo ""
log_ok "chad-local stack is up."
log_info "Dashboard: http://localhost:$DASHBOARD_PORT"
log_info "Dev Panel Settings: Server PostgreSQL vs offline-readonly-backup (emergency read-only)."
log_info "Test data / mutations: use user test3 only — never dump fixtures under pawel_f."
