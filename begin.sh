#!/usr/bin/env bash
# Thin wrapper — the real logic lives in bash-scripts/dashboard/02_local_mac_tmux/02_start.sh.
# Lets you run `bash begin.sh` from the repo root without remembering the
# subfolder path. Works from any cwd.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/bash-scripts/dashboard/02_local_mac_tmux/02_start.sh" "$@"
