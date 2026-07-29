#!/bin/bash
# Actual command run by the beeper-synch LaunchAgent (com.chad.beeper-synch)
# at login/startup. Builds plugins/beeper-synch if its dist/ is missing,
# then `exec`s the built plugin in the foreground so launchd tracks its
# real PID/exit code — KeepAlive in the installed plist restarts it on
# crash; plugins/beeper-synch's own PID lock (.runtime/beeper-synch/
# beeper-synch.pid) still enforces single-instance even across restarts.
#
# Resolves the repo root from this script's own location via git, never
# from $PWD or a hardcoded /Users/... path — safe to install on any
# checkout of this repo.

set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
PLUGIN_DIR="$REPO_ROOT/plugins/beeper-synch"

cd "$PLUGIN_DIR"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "beeper-synch startup: pnpm not found on PATH ($PATH)" >&2
  exit 1
fi

if [ ! -f "$PLUGIN_DIR/dist/index.js" ]; then
  echo "beeper-synch startup: dist/index.js missing — building..."
  pnpm --filter beeper-synch build
fi

echo "beeper-synch startup: launching node dist/index.js from $PLUGIN_DIR"
exec node "$PLUGIN_DIR/dist/index.js"
