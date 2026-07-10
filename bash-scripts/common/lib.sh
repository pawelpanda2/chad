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
