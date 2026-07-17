#!/usr/bin/env bash
# Shows the full local Beeper runtime status: MongoDB connection + collection
# counts, beeper-ws process state, Beeper Desktop reachability, and the last
# error (if any) from the beeper-ws log. Never prints secrets (Mongo
# credentials, Beeper API key).
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
# shellcheck source=../common/lib.sh
source "$REPO_ROOT/bash-scripts/common/lib.sh"
# shellcheck source=./01_config.sh
source "$SCRIPT_DIR/01_config.sh"

echo ""
log_info "Beeper — local runtime status"

# ── MongoDB ──────────────────────────────────────────────────────────────
echo ""
if [ -f "$REPO_ROOT/.env.mac-beeper" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$REPO_ROOT/.env.mac-beeper"
  set +a
fi

MONGO_HEALTH_EXIT=0
bash "$REPO_ROOT/bash-scripts/mongo/health-check-mac.sh" >/dev/null 2>&1 || MONGO_HEALTH_EXIT=$?

if [ "$MONGO_HEALTH_EXIT" = "0" ] || [ "$MONGO_HEALTH_EXIT" = "4" ]; then
  log_ok "MongoDB: reachable."
  MONGO_DRIVER_DIR="$REPO_ROOT/packages/beeper-sync/node_modules/mongodb"
  if [ -d "$MONGO_DRIVER_DIR" ] && [ -n "${MONGODB_URI:-}" ]; then
    COUNTS="$(MONGODB_URI="$MONGODB_URI" node -e "
      const { MongoClient } = require('$MONGO_DRIVER_DIR');
      const names = ['contacts','channels','messages','sync_state','beeper_events'];
      (async () => {
        const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
        try {
          await client.connect();
          const db = client.db();
          for (const n of names) {
            const c = await db.collection(n).countDocuments({});
            console.log(n + ': ' + c);
          }
        } finally {
          await client.close();
        }
      })();
    " 2>/dev/null || true)"
    if [ -n "$COUNTS" ]; then
      log_info "Database: beeper — collection counts:"
      echo "$COUNTS" | sed 's/^/    /'
    fi
  fi
else
  log_warn "MongoDB: NOT reachable (see .env.mac-beeper's MONGODB_URI)."
fi

# ── Beeper Desktop ───────────────────────────────────────────────────────
echo ""
if bash "$SCRIPT_DIR/health-check-desktop.sh" >/dev/null 2>&1; then
  log_ok "Beeper Desktop: reachable and authenticated."
else
  log_warn "Beeper Desktop: NOT reachable (is it running on this Mac?)."
fi

# ── beeper-ws process ────────────────────────────────────────────────────
echo ""
if [ -f "$BEEPER_WS_PID_FILE" ] && kill -0 "$(cat "$BEEPER_WS_PID_FILE")" 2>/dev/null; then
  log_ok "beeper-ws: running (pid $(cat "$BEEPER_WS_PID_FILE"))."
else
  log_warn "beeper-ws: NOT running."
fi

if [ -f "$BEEPER_WS_LOG_FILE" ]; then
  echo ""
  LAST_ERROR="$(grep -i "error" "$BEEPER_WS_LOG_FILE" | tail -n 1 || true)"
  if [ -n "$LAST_ERROR" ]; then
    log_warn "Last error in log: $LAST_ERROR"
  else
    log_info "No errors found in log."
  fi
  echo ""
  log_info "Last 15 log lines ($BEEPER_WS_LOG_FILE):"
  tail -n 15 "$BEEPER_WS_LOG_FILE"
fi
