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
  log_warn "Port $port is in use by Docker container '${container_name:-$container_id}' — stopping and removing it."
  docker stop "$container_id" >/dev/null
  docker rm "$container_id" >/dev/null 2>&1 || true
  log_ok "Stopped and removed container '${container_name:-$container_id}' (was using port $port)."
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
