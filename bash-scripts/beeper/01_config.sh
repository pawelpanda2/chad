#!/usr/bin/env bash
# Shared config for bash-scripts/beeper/*. Source this, don't execute it
# directly — see bash-scripts/common/lib.sh for the sourcing convention.

BEEPER_WS_DIR="$REPO_ROOT/packages/beeper-ws"
BEEPER_SYNC_DIR="$REPO_ROOT/packages/beeper-sync"
BEEPER_RUNTIME_DIR="$REPO_ROOT/.runtime/beeper"
BEEPER_WS_PID_FILE="$BEEPER_RUNTIME_DIR/beeper-ws.pid"
BEEPER_WS_LOG_FILE="$BEEPER_RUNTIME_DIR/beeper-ws.log"
