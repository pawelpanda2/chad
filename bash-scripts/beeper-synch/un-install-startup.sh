#!/bin/bash
# Removes ONLY the beeper-synch LaunchAgent (com.chad.beeper-synch) — never
# touches com.content-provider.startup or any other installed LaunchAgent.
# Idempotent: safe to run even if it was never installed.

set -euo pipefail

PLIST_LABEL="com.chad.beeper-synch"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_LABEL.plist"

launchctl stop "$PLIST_LABEL" 2>/dev/null || true
launchctl unload "$PLIST_PATH" 2>/dev/null || true
rm -f "$PLIST_PATH"

echo "beeper-synch startup uninstalled"
