#!/usr/bin/env bash
# Shared helpers for bash-scripts/*. Source this, don't execute it directly:
#   source "$REPO_ROOT/bash-scripts/common/lib.sh"
#
# Every caller is expected to have already computed REPO_ROOT itself via the
# standard pattern (see any script in bash-scripts/dashboard/ for the
# canonical form) — this file only provides utility functions, not path
# resolution, since resolving REPO_ROOT is what lets a script find this file
# in the first place.

# Colors (no-op if not a tty, so logs stay clean when piped/redirected)
if [ -t 1 ]; then
  C_RED='\033[0;31m'
  C_GREEN='\033[0;32m'
  C_YELLOW='\033[0;33m'
  C_BLUE='\033[0;34m'
  C_RESET='\033[0m'
else
  C_RED=''; C_GREEN=''; C_YELLOW=''; C_BLUE=''; C_RESET=''
fi

log_info()  { printf "${C_BLUE}[info]${C_RESET} %s\n" "$*"; }
log_ok()    { printf "${C_GREEN}[ok]${C_RESET} %s\n" "$*"; }
log_warn()  { printf "${C_YELLOW}[warn]${C_RESET} %s\n" "$*" >&2; }
log_error() { printf "${C_RED}[error]${C_RESET} %s\n" "$*" >&2; }

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Usage: port_in_use 12080  -> exit 0 (in use) or 1 (free)
port_in_use() {
  local port="$1"
  lsof -i ":$port" -sTCP:LISTEN >/dev/null 2>&1
}

# Usage: require_command tmux "brew install tmux"
require_command() {
  local cmd="$1" hint="$2"
  if ! command_exists "$cmd"; then
    log_error "Required command not found: $cmd"
    log_error "  Fix: $hint"
    return 1
  fi
  return 0
}

# Usage: require_file /path/to/.env "cp .env.example .env and fill it in"
require_file() {
  local path="$1" hint="$2"
  if [ ! -f "$path" ]; then
    log_error "Required file missing: $path"
    log_error "  Fix: $hint"
    return 1
  fi
  return 0
}

# Usage: find_docker_container_by_port 12020  -> prints container ID (empty if none)
# Matches only containers that PUBLISH this exact host port — never a broad
# scan of all containers.
find_docker_container_by_port() {
  local port="$1"
  docker ps --filter "publish=$port" --format '{{.ID}}' 2>/dev/null | head -n1
}

# Usage: stop_docker_container_using_port 12020
# Stops and removes ONLY the single container publishing this exact port
# (never docker rm -f $(docker ps -aq), never docker system prune). Safe to
# call when nothing is using the port — it's then a no-op.
stop_docker_container_using_port() {
  local port="$1"
  local container_id
  container_id="$(find_docker_container_by_port "$port")"
  if [ -z "$container_id" ]; then
    return 0
  fi
  local container_name
  container_name="$(docker inspect -f '{{.Name}}' "$container_id" 2>/dev/null | sed 's#^/##')"
  log_warn "Port $port is in use by Docker container '${container_name:-unknown}' (ID: $container_id) — stopping and removing it."
  docker stop "$container_id" >/dev/null
  docker rm "$container_id" >/dev/null 2>&1 || true
  log_ok "Stopped and removed container '${container_name:-unknown}' (ID: $container_id) (was using port $port)."
}

# Usage: ensure_port_available 12020 || exit 1
# If a Docker container publishes the port, stops+removes ONLY that
# container and returns 0. Otherwise falls back to lsof to check for a
# non-Docker process; if found, prints its PID/name and returns 1 — never
# kills an arbitrary system process automatically. If neither finds
# anything, the port is free — returns 0.
#
# Docker is checked FIRST, before lsof, deliberately: `docker ps --filter
# publish=<port>` is authoritative regardless of platform, but `lsof -i`
# is NOT — confirmed on QNAP (Linux) that lsof reports a Docker-published
# port as free even while `docker ps --filter publish=` correctly finds
# the container holding it (real failure during the first QNAP TEST
# deploy: the old lsof-first check silently reported every port free,
# skipping cleanup, and `docker compose up` then failed with "port is
# already allocated"). Checking Docker first works on both platforms.
# Usage: ensure_docker_network chad-shared
# Creates the named Docker network only if it doesn't already exist
# (idempotent). Never recreates/touches an existing network.
ensure_docker_network() {
  local network="$1"
  if docker network inspect "$network" >/dev/null 2>&1; then
    return 0
  fi
  log_info "Creating Docker network '$network' (doesn't exist yet)."
  docker network create "$network" >/dev/null
  log_ok "Created Docker network '$network'."
}

# Usage: require_shared_services_healthy 12024
# Preflight for TEST/PROD dashboard begin scripts: refuses to proceed
# unless the shared chad-mongodb + chad-content-provider-api stack (started
# separately by bash-scripts/dashboard/00_qnap_shared/03_begin.sh) is
# already up and healthy. Never starts/restarts shared services itself —
# only reads state.
require_shared_services_healthy() {
  local cp_port="$1"

  if ! docker network inspect chad-shared >/dev/null 2>&1; then
    log_error "Docker network 'chad-shared' does not exist."
    log_error "  Fix: bash bash-scripts/dashboard/00_qnap_shared/03_begin.sh (start shared services first)."
    return 1
  fi

  local mongo_state
  mongo_state="$(docker inspect -f '{{.State.Health.Status}}' chad-mongodb 2>/dev/null || true)"
  if [ "$mongo_state" != "healthy" ]; then
    log_error "Shared chad-mongodb container is not running/healthy (state: ${mongo_state:-not found})."
    log_error "  Fix: bash bash-scripts/dashboard/00_qnap_shared/03_begin.sh"
    return 1
  fi

  if ! docker ps --filter "name=^chad-content-provider-api$" --filter "status=running" --format '{{.Names}}' | grep -qx "chad-content-provider-api"; then
    log_error "Shared chad-content-provider-api container is not running."
    log_error "  Fix: bash bash-scripts/dashboard/00_qnap_shared/03_begin.sh"
    return 1
  fi

  if ! curl -fsS -m 3 "http://localhost:$cp_port/health" >/dev/null 2>&1; then
    log_error "Shared content-provider-api did not respond on port $cp_port."
    log_error "  Fix: bash bash-scripts/dashboard/00_qnap_shared/05_status.sh (diagnose shared stack)."
    return 1
  fi

  return 0
}

# Usage: kill_process_on_port 12080
# For "end"/cleanup scripts (and 03_local_mac_docker/01_port_kill.sh, the CLI
# wrapper around this one function — see that file, don't reimplement this
# logic there) — where, unlike ensure_port_available's startup preflight,
# the caller genuinely wants the port free, not just a report. Docker-first
# (same reasoning as ensure_port_available: authoritative on both
# platforms): if a container publishes this port, stops+removes ONLY that
# container. Otherwise sends SIGTERM to the PID(s) found by `lsof -ti :port`
# (targeted by port, never a broad pkill/killall/kill-by-name), waits, then
# SIGKILL if still alive. No-op if the port is already free.
kill_process_on_port() {
  local port="$1"
  local container_id
  container_id="$(find_docker_container_by_port "$port")"
  if [ -n "$container_id" ]; then
    stop_docker_container_using_port "$port"
    return 0
  fi

  if ! port_in_use "$port"; then
    log_ok "Port $port is free."
    return 0
  fi

  local pids
  pids="$(lsof -ti ":$port" 2>/dev/null)"
  if [ -z "$pids" ]; then
    return 0
  fi

  local pid pname
  for pid in $pids; do
    pname="$(ps -p "$pid" -o comm= 2>/dev/null | sed 's#.*/##')"
    log_info "Port $port is in use by process '${pname:-unknown}' (PID $pid)."
  done

  log_warn "Sending SIGTERM to PID(s): $pids"
  kill $pids 2>/dev/null || true
  sleep 1

  if port_in_use "$port"; then
    log_warn "Still running after SIGTERM — sending SIGKILL to PID(s): $pids"
    kill -9 $pids 2>/dev/null || true
    sleep 1
  fi

  if port_in_use "$port"; then
    log_error "Port $port is still in use after kill attempt."
    return 1
  fi
  log_ok "Port $port is now free."
}

ensure_port_available() {
  local port="$1"
  local container_id
  container_id="$(find_docker_container_by_port "$port")"
  if [ -n "$container_id" ]; then
    stop_docker_container_using_port "$port"
    if [ -n "$(find_docker_container_by_port "$port")" ]; then
      log_error "Port $port is still published by a Docker container after attempting cleanup."
      return 1
    fi
    return 0
  fi

  if ! port_in_use "$port"; then
    return 0
  fi

  local proc_line
  proc_line="$(lsof -i ":$port" -sTCP:LISTEN -n -P 2>/dev/null | awk 'NR==2 {print $1, $2}')"
  log_error "Port $port is in use by a non-Docker process: ${proc_line:-unknown}"
  log_error "  Not killing it automatically — stop it yourself, then re-run."
  return 1
}

# ============================================================================
# Release-tag mechanism for CHAD's own images (chad-dashboard,
# chad-content-provider-api). Own images never use `:latest` — every build
# writes ONE canonical, gitignored tag-record file; every begin/deploy script
# reads that same file and fails loudly if it's missing, instead of silently
# defaulting to `:latest`. Full standard:
# documentation/ai-docs/deploy/image-tagging-standard.md
# ============================================================================

# Canonical per-image tag-record file paths. Callers must have REPO_ROOT set
# (same requirement as the rest of this file).
dashboard_image_tag_file() { echo "$REPO_ROOT/.image-tag.chad-dashboard.env"; }
content_provider_image_tag_file() { echo "$REPO_ROOT/.image-tag.chad-content-provider-api.env"; }

# Usage: write_image_tag "$(dashboard_image_tag_file)" "$IMAGE_TAG"
# Persists a release tag to disk. Call this as the LAST step of a build
# script, after `docker compose build` has already returned 0 (under
# `set -e`, a failed build never reaches this line) — so a tag is only ever
# recorded for an image that actually built successfully. Atomic write (temp
# file + mv) so a concurrent reader never sees a half-written file.
write_image_tag() {
  local tag_file="$1" tag_value="$2"
  local tmp_file
  tmp_file="${tag_file}.tmp.$$"
  printf 'IMAGE_TAG=%s\n' "$tag_value" > "$tmp_file"
  mv "$tmp_file" "$tag_file"
  log_ok "Release tag recorded: $tag_value -> $(basename "$tag_file")"
}

# Usage: require_image_tag "$(dashboard_image_tag_file)" "chad-dashboard" || exit 1
# Reads and exports IMAGE_TAG from the given canonical tag-record file for use
# by `docker compose ... up`. Fails with a clear, actionable error if the file
# is missing or empty — NEVER falls back to `:latest`. TEST and PROD read the
# exact same tag-record file for chad-dashboard, so running the build ONCE
# (from either environment) and then `begin` in both is how a release is
# promoted without a second build.
require_image_tag() {
  local tag_file="$1" image_label="${2:-image}"
  if [ ! -f "$tag_file" ]; then
    log_error "No release tag recorded for $image_label."
    log_error "  Missing: $tag_file"
    log_error "  Fix: run the build script for $image_label first (see documentation/ai-docs/deploy/image-tagging-standard.md)."
    return 1
  fi
  # shellcheck disable=SC1090
  source "$tag_file"
  if [ -z "${IMAGE_TAG:-}" ]; then
    log_error "$tag_file exists but IMAGE_TAG is empty."
    log_error "  Fix: rebuild $image_label so a valid tag is recorded."
    return 1
  fi
  export IMAGE_TAG
  log_info "Using $image_label release tag: $IMAGE_TAG"
  return 0
}

# Usage: export IMAGE_TAG="$(image_tag_for_readonly "$(dashboard_image_tag_file)")"
# For status/end scripts: `docker compose ps`/`down` still need the compose
# file's `image:` field to interpolate successfully, but — unlike
# `up`/`build` — don't need the image to exist or be correct (`ps` and `down`
# never pull/run it). Returns the recorded tag if present, otherwise the
# harmless placeholder "none" so `docker compose` doesn't hard-fail on a
# stack that was never built/deployed. `require_image_tag` (used by
# build/begin) is what actually enforces a real, valid tag.
image_tag_for_readonly() {
  local tag_file="$1"
  if [ -f "$tag_file" ]; then
    # shellcheck disable=SC1090
    source "$tag_file"
    if [ -n "${IMAGE_TAG:-}" ]; then
      echo "$IMAGE_TAG"
      return 0
    fi
  fi
  echo "none"
}

# Usage: value="$(read_env_var "$ENV_FILE" QNAP_CONTAINER_DATA_PATH)"
# Minimal .env-style parser (KEY=value, ignores comments/blank lines, strips
# surrounding quotes). Prints an empty string if the file or key is missing —
# never errors, so callers decide what "unset" means.
read_env_var() {
  local env_file="$1" key="$2"
  [ -f "$env_file" ] || return 0
  awk -F'=' -v k="$key" '
    /^[[:space:]]*#/ { next }
    /^[[:space:]]*$/ { next }
    {
      ek = $1; gsub(/^[[:space:]]+|[[:space:]]+$/, "", ek)
      if (ek != k) next
      v = substr($0, index($0, "=") + 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", v)
      gsub(/^"|"$/, "", v)
      print v
      exit
    }
  ' "$env_file"
}

# Usage: require_data_path_writable /share/CACHEDEV1_DATA/ContainerData/chad-shared/mongodb [min_free_kb]
# Creates the directory if missing, verifies it's writable, and verifies the
# underlying filesystem has at least min_free_kb free (default 1,048,576 KB =
# 1GB). This is a tripwire for the QNAP_CONTAINER_DATA_PATH-on-tmpfs class of
# bug (see documentation/ai-docs/deploy/qnap-data-path.md): a 16MB tmpfs looks
# like a perfectly normal, writable directory right up until MongoDB's
# WiredTiger journal fills it and the container crash-loops with "No space
# left on device". Also WARNS (does not fail) when the path resolves onto a
# tmpfs filesystem at all, since that's the exact failure signature even when
# free space happens to be temporarily above the floor. Not a capacity
# planner — just a floor that catches an obviously-misconfigured path.
require_data_path_writable() {
  local path="$1" min_free_kb="${2:-1048576}"

  mkdir -p "$path" || {
    log_error "Cannot create data directory: $path"
    return 1
  }

  local test_file="$path/.write-test.$$"
  if ! touch "$test_file" 2>/dev/null; then
    log_error "Data directory is not writable: $path"
    return 1
  fi
  rm -f "$test_file"

  local avail_kb
  avail_kb="$(df -Pk "$path" 2>/dev/null | awk 'NR==2 {print $4}')"
  if [ -z "$avail_kb" ]; then
    log_warn "Could not determine free space for: $path (df failed) — continuing."
  elif [ "$avail_kb" -lt "$min_free_kb" ]; then
    log_error "Data path has too little free space: $path"
    log_error "  Available: ${avail_kb}KB, required at least: ${min_free_kb}KB."
    log_error "  This is the exact signature of QNAP_CONTAINER_DATA_PATH pointing at a"
    log_error "  small tmpfs instead of the real data volume."
    log_error "  Fix: see documentation/ai-docs/deploy/qnap-data-path.md"
    return 1
  fi

  if df -PT "$path" >/dev/null 2>&1; then
    local fstype
    fstype="$(df -PT "$path" 2>/dev/null | awk 'NR==2 {print $2}')"
    if [ "$fstype" = "tmpfs" ]; then
      log_warn "Data path '$path' is on a tmpfs filesystem — contents will not"
      log_warn "  survive a reboot/container recreate, and tmpfs is often tiny."
      log_warn "  Verify QNAP_CONTAINER_DATA_PATH in .env.qnap is intentional."
    fi
  fi

  return 0
}
