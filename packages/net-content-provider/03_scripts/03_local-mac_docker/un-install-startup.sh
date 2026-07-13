#!/bin/bash

PLIST_LABEL="com.content-provider.startup"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_LABEL.plist"

launchctl stop "$PLIST_LABEL" 2>/dev/null
launchctl unload "$PLIST_PATH" 2>/dev/null

rm -f "$PLIST_PATH"

osascript -e 'tell application "System Events" to delete login item "system-startup.sh"' 2>/dev/null

echo "✅ Startup odinstalowany"
