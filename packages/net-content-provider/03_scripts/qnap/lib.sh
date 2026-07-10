#!/usr/bin/env bash
# Shared helpers + constants for the QNAP TEST scripts (build/begin/end/
# status/deploy_qnap_test.sh). Self-contained on purpose — this directory
# (packages/net-content-provider) is meant to eventually become a standalone
# git submodule, so these scripts must not depend on anything outside it.
#
# Source this, don't execute it directly.

# Colors (no-op if not a tty)
if [ -t 1 ]; then
  C_RED='\033[0;31m'; C_GREEN='\033[0;32m'; C_YELLOW='\033[0;33m'; C_BLUE='\033[0;34m'; C_RESET='\033[0m'
else
  C_RED=''; C_GREEN=''; C_YELLOW=''; C_BLUE=''; C_RESET=''
fi

log_info()  { printf "${C_BLUE}[info]${C_RESET} %s\n" "$*"; }
log_ok()    { printf "${C_GREEN}[ok]${C_RESET} %s\n" "$*"; }
log_warn()  { printf "${C_YELLOW}[warn]${C_RESET} %s\n" "$*" >&2; }
log_error() { printf "${C_RED}[error]${C_RESET} %s\n" "$*" >&2; }

command_exists() { command -v "$1" >/dev/null 2>&1; }

port_in_use() { lsof -i ":$1" -sTCP:LISTEN >/dev/null 2>&1; }

# ---------------------------------------------------------------------------
# Path resolution — REPO_ROOT here means packages/net-content-provider
# itself (two levels up from 03_scripts/qnap), NOT the chad monorepo root.
# ---------------------------------------------------------------------------
qnap_script_dir() {
  cd -- "$(dirname -- "${BASH_SOURCE[1]}")" && pwd
}

# ---------------------------------------------------------------------------
# Test-environment resource names — deliberately distinct from local-mac
# (cp_api_csharp, cp_blazor) and from any future prod names, so this never
# collides with or accidentally touches non-test containers/images/networks.
# ---------------------------------------------------------------------------
CP_TEST_API_CONTAINER="cp-api-test"
CP_TEST_BLAZOR_CONTAINER="cp-blazor-test"
CP_TEST_NETWORK="cp-test-network"
CP_TEST_API_IMAGE="cp_webapi_test:latest"
CP_TEST_BLAZOR_IMAGE="cp_blazor_test:latest"

# ---------------------------------------------------------------------------
# Build-tag convention: YYMMDD_HHMMSS_<arch>, e.g. 260710_231500_mac /
# 260710_231500_linux. build_qnap_test.sh tags each freshly built image with
# this in addition to the fixed :latest-style name above (which begin/end/
# status_qnap_test.sh use to find "the current test image") — the timestamped
# tag is purely for history/traceability, not for running containers.
# ---------------------------------------------------------------------------
image_arch_suffix() {
  case "$(uname -s)" in
    Darwin) echo "mac" ;;
    Linux) echo "linux" ;;
    *) uname -s | tr '[:upper:]' '[:lower:]' ;;
  esac
}

build_timestamp_tag() {
  echo "$(date +%y%m%d_%H%M%S)_$(image_arch_suffix)"
}

require_command() {
  local cmd="$1" hint="$2"
  if ! command_exists "$cmd"; then
    log_error "Required command not found: $cmd"
    log_error "  Fix: $hint"
    return 1
  fi
  return 0
}

require_file() {
  local path="$1" hint="$2"
  if [ ! -f "$path" ]; then
    log_error "Required file missing: $path"
    log_error "  Fix: $hint"
    return 1
  fi
  return 0
}
