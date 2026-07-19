#!/usr/bin/env bash
# Nothing to build in the QNAP SHARED stack anymore. Content Provider
# (content-provider-api) — the only service here that was ever built from
# source — has been removed from deployment (Mongo is the only active
# runtime backend now; see docker-compose.qnap.shared.yml's header comment
# for the reversible-removal note). `mongodb` uses a plain upstream image
# (mongo:4.4), never built here.
#
# Kept as a no-op (rather than deleted) so the numbered-slot convention
# (01_config/02_build/03_restart/04_end/05_status/06_deploy) stays intact
# across every environment — see documentation/ai-docs/deploy/
# dashboard-deployment-scripts.md.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
source "$SCRIPT_DIR/01_config.sh"

log_info "chad QNAP SHARED — build"
log_ok "Nothing to build — mongodb uses a plain upstream image (mongo:4.4), and content-provider-api was removed from this stack."
