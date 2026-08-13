#!/usr/bin/env bash
# Installs the local Mac cp_1 watchdog as a LaunchAgent (login KeepAlive).
# Idempotent. Does NOT touch TEST/PROD or Docker Desktop.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
WATCHDOG_SCRIPT="$SCRIPT_DIR/93_cp1-watchdog.sh"
PLIST_LABEL="com.chad.local-cp1-watchdog"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_LABEL.plist"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "macOS only" >&2
  exit 1
fi

# Prefer Homebrew bash 5+ (macOS /bin/bash is 3.2 and breaks modern scripts).
BASH_BIN="$(command -v bash)"
if [ -x /opt/homebrew/bin/bash ]; then
  BASH_BIN=/opt/homebrew/bin/bash
elif [ -x /usr/local/bin/bash ]; then
  BASH_BIN=/usr/local/bin/bash
fi

echo "Removing previous $PLIST_LABEL (if any)..."
launchctl bootout "gui/$(id -u)/$PLIST_LABEL" 2>/dev/null || true
launchctl unload "$PLIST_PATH" 2>/dev/null || true
rm -f "$PLIST_PATH"

chmod +x "$WATCHDOG_SCRIPT" \
  "$SCRIPT_DIR/91_ensure-cp1-mounted.sh" \
  "$SCRIPT_DIR/92_verify-cp1-in-container.sh" \
  "$SCRIPT_DIR/93_cp1-watchdog.sh"

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
    <string>$BASH_BIN</string>
    <string>$WATCHDOG_SCRIPT</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/chad-cp1-watchdog.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/chad-cp1-watchdog-error.log</string>
  <key>WorkingDirectory</key>
  <string>$SCRIPT_DIR</string>
</dict>
</plist>
EOF

launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH" 2>/dev/null \
  || launchctl load "$PLIST_PATH"

echo "Installed $PLIST_LABEL"
echo "  Logs:   tail -f /tmp/chad-cp1-watchdog.log"
echo "  Status: $SCRIPT_DIR/96_cp1-watchdog-status.sh"
echo "  Remove: $SCRIPT_DIR/95_uninstall-cp1-watchdog.sh"
