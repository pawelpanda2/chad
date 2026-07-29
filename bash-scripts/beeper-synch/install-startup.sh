#!/bin/bash
# Installs system-startup.sh as a LaunchAgent, run at login/startup.
# Idempotent: if a previous beeper-synch LaunchAgent is already installed,
# fully removes it first (stop + unload + rm), then installs fresh.
#
# Independent from the Content Provider's own LaunchAgent
# (com.content-provider.startup, installed by the separate standalone
# content-provider repo's bash-scripts/04_mac_startup/) — different label,
# different plist file, different log paths, never touched here.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STARTUP_SCRIPT="$SCRIPT_DIR/system-startup.sh"
PLIST_LABEL="com.chad.beeper-synch"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_LABEL.plist"

echo "Removing previous beeper-synch startup installation (if any)..."
launchctl stop "$PLIST_LABEL" 2>/dev/null || true
launchctl unload "$PLIST_PATH" 2>/dev/null || true
rm -f "$PLIST_PATH"

chmod +x "$STARTUP_SCRIPT"

mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$PLIST_LABEL</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$STARTUP_SCRIPT</string>
  </array>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>/tmp/chad-beeper-synch.log</string>

  <key>StandardErrorPath</key>
  <string>/tmp/chad-beeper-synch-error.log</string>
</dict>
</plist>
EOF

launchctl load "$PLIST_PATH"

echo "beeper-synch startup installed ($STARTUP_SCRIPT)"
echo "Check status: ./bash-scripts/beeper-synch/status.sh"
echo "Logs: tail -f /tmp/chad-beeper-synch.log"
