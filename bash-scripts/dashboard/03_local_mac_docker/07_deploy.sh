#!/usr/bin/env bash
# One-shot: build then begin (which is itself idempotent). Reuses
# 03_build.sh and 04_begin.sh rather than duplicating their logic.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

bash "$SCRIPT_DIR/03_build.sh"
bash "$SCRIPT_DIR/04_begin.sh"
bash "$SCRIPT_DIR/06_status.sh"
