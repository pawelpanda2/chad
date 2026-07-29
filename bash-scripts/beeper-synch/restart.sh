#!/bin/bash
# Reloads the beeper-synch LaunchAgent (unload + load) without touching the
# plist file itself. Requires it to already be installed
# (install-startup.sh).
set -euo pipefail

PLIST_LABEL="com.chad.beeper-synch"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_LABEL.plist"

if [ ! -f "$PLIST_PATH" ]; then
  echo "beeper-synch is not installed — run install-startup.sh first." >&2
  exit 1
fi

launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"
echo "beeper-synch LaunchAgent restarted"
