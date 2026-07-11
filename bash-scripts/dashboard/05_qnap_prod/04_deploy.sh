#!/usr/bin/env bash
# One-shot: build then start (which is itself idempotent). Reuses
# 01_build.sh and 02_start.sh rather than duplicating their logic.
#
# PROD deployment requires separate explicit approval — running this script
# IS the deployment action.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

bash "$SCRIPT_DIR/01_build.sh"
bash "$SCRIPT_DIR/02_start.sh"
bash "$SCRIPT_DIR/05_status.sh"
