#!/bin/bash
# Shows: LaunchAgent load state, plugins/beeper-synch's own status.json
# (real readiness — beeper-ws actually connected, not just "process
# started"), and recent startup logs. Never prints secrets.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
PLIST_LABEL="com.chad.beeper-synch"
STATUS_FILE="$REPO_ROOT/.runtime/beeper-synch/status.json"

echo "LaunchAgent ($PLIST_LABEL):"
launchctl list | grep "$PLIST_LABEL" || echo "  not loaded"

echo ""
echo "beeper-synch status file ($STATUS_FILE):"
if [ -f "$STATUS_FILE" ]; then
  cat "$STATUS_FILE"
else
  echo "  not found — beeper-synch has not started yet"
fi

echo ""
echo "Recent startup logs:"
tail -n 20 /tmp/chad-beeper-synch.log 2>/dev/null || echo "  no log file yet"
