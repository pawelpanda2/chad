#!/bin/bash

# Instaluje system-startup.sh jako LaunchAgent uruchamiany przy logowaniu.
# Idempotentne: jeśli stary LaunchAgent już istnieje, najpierw go w pełni
# usuwa (stop + unload + rm), a potem instaluje od nowa.

# Absolutna ścieżka do katalogu ze skryptem
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

STARTUP_SCRIPT="$SCRIPT_DIR/system-startup.sh"
PLIST_LABEL="com.content-provider.startup"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_LABEL.plist"

echo "🗑️  Usuwam poprzednią instalację (jeśli istnieje)..."
launchctl stop "$PLIST_LABEL" 2>/dev/null
launchctl unload "$PLIST_PATH" 2>/dev/null
rm -f "$PLIST_PATH"
osascript -e 'tell application "System Events" to delete login item "system-startup.sh"' 2>/dev/null

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

  <key>StandardOutPath</key>
  <string>/tmp/content-provider-startup.log</string>

  <key>StandardErrorPath</key>
  <string>/tmp/content-provider-startup-error.log</string>
</dict>
</plist>
EOF

launchctl load "$PLIST_PATH"

echo "✅ Startup zainstalowany ($STARTUP_SCRIPT)"
echo "Test:"
echo "launchctl start $PLIST_LABEL"
