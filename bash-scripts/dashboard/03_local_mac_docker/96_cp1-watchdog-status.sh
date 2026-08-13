#!/usr/bin/env bash
# Prints LaunchAgent + .runtime/cp1-repair status for the local cp_1 watchdog.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
PLIST_LABEL="com.chad.local-cp1-watchdog"
STATUS_FILE="$REPO_ROOT/.runtime/cp1-repair/status.json"

echo "LaunchAgent: $PLIST_LABEL"
launchctl print "gui/$(id -u)/$PLIST_LABEL" 2>/dev/null | head -20 \
  || echo "  (not loaded)"

echo ""
echo "Host mount:"
/sbin/mount | grep 'cp_1' || echo "  (no cp_1 smbfs)"

echo ""
if [ -f "$STATUS_FILE" ]; then
  echo "Watchdog status.json:"
  /bin/cat "$STATUS_FILE"
  echo ""
else
  echo "No status.json yet."
fi

echo "Recent log (tail):"
/usr/bin/tail -n 15 /tmp/chad-cp1-watchdog.log 2>/dev/null || echo "  (no log)"
