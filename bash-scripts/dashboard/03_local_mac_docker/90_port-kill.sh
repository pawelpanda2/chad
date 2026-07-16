#!/usr/bin/env bash
# Frees a single port on this Mac, no questions asked — for automatic use by
# 03_restart.sh (and transitively 06_deploy.sh), and for direct manual use.
# Numbered 90 (outside the 01-07 standard operation slots) because it's a
# manual technical tool, not one of the seven standard operations — see
# documentation/ai-docs/deploy/dashboard-deployment-scripts.md.
#
# Two cases, both handled by the shared kill_process_on_port() in
# bash-scripts/common/lib.sh (this file is a thin CLI wrapper around it —
# don't duplicate the logic here, see that function for the real
# implementation):
#   1. Plain process holding the port: prints its name + PID, sends SIGTERM,
#      waits, re-checks, escalates to SIGKILL only if still alive.
#   2. Docker container publishing the port: prints its name + ID, stops and
#      removes ONLY that container.
# Never touches anything not actually bound to the given port — no broad
# `docker system prune`, no `pkill`/`killall`, no `docker rm -f $(docker ps
# -aq)`. No interactive confirmation, since this is called automatically.
#
# Usage: ./90_port-kill.sh <port>
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
# shellcheck source=../../common/lib.sh
source "$REPO_ROOT/bash-scripts/common/lib.sh"

PORT="${1:-}"

if [ -z "$PORT" ]; then
  log_error "Usage: $0 <port>"
  exit 1
fi

if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
  log_error "Invalid port: '$PORT' (must be an integer 1-65535)"
  exit 1
fi

log_info "Checking port $PORT..."
kill_process_on_port "$PORT"
