#!/usr/bin/env bash
# One-shot: build then restart (which is itself idempotent). Reuses
# 02_build.sh and 03_restart.sh rather than duplicating their logic.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

bash "$SCRIPT_DIR/02_build.sh"
bash "$SCRIPT_DIR/03_restart.sh"
bash "$SCRIPT_DIR/05_status.sh"
