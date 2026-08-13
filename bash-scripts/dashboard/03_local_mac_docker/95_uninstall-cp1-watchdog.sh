#!/usr/bin/env bash
# Removes the local Mac cp_1 watchdog LaunchAgent.
set -euo pipefail

PLIST_LABEL="com.chad.local-cp1-watchdog"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_LABEL.plist"

launchctl bootout "gui/$(id -u)/$PLIST_LABEL" 2>/dev/null || true
launchctl unload "$PLIST_PATH" 2>/dev/null || true
rm -f "$PLIST_PATH"
echo "Uninstalled $PLIST_LABEL"
