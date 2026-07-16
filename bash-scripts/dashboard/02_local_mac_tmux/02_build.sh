#!/usr/bin/env bash
# Production builds dba then dashboard, in the correct order (dashboard
# imports dba's built dist/ output, so it must exist and be current first).
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"

cd "$REPO_ROOT"

log_info "Building dba..."
pnpm --filter dba build
log_ok "dba built."

log_info "Building dashboard..."
pnpm --filter dashboard build
log_ok "dashboard built."
