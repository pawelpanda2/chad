#!/usr/bin/env bash
# Health check: Mac -> MongoDB@QNAP (over Tailscale).
#
# Run this on the Mac before starting beeper-ws/beeper-sync, to fail fast and
# clearly if MongoDB on QNAP isn't reachable, instead of the long-lived
# process silently hanging or crash-looping.
#
# Reads MONGODB_URI from env (source your local, gitignored .env.mac-beeper
# first — see .env.mac-beeper.example). Never prints the password or the
# full connection string; only host:port and a redacted form are logged.
#
# Exit codes:
#   0 = reachable and Mongo responded to ping
#   1 = MONGODB_URI not set
#   2 = host:port not reachable (network/Tailscale/firewall problem)
#   3 = TCP reachable but MongoDB did not respond to ping (auth/db problem)
#   4 = mongosh not installed, so only the TCP check could be performed

set -euo pipefail

if [ -z "${MONGODB_URI:-}" ]; then
  echo "Error: MONGODB_URI is not set. Source your .env.mac-beeper first:" >&2
  echo "  set -a; source .env.mac-beeper; set +a" >&2
  exit 1
fi

# Extract host and port from mongodb://[user:pass@]host:port/db?...
# without ever echoing the credentials.
HOST_PORT="$(echo "$MONGODB_URI" | sed -E 's#^mongodb://([^@]*@)?([^/?]+).*#\2#')"
HOST="${HOST_PORT%%:*}"
PORT="${HOST_PORT##*:}"

if [ -z "$HOST" ] || [ -z "$PORT" ] || [ "$HOST" = "$PORT" ]; then
  echo "Error: could not parse host:port out of MONGODB_URI (redacted check only)." >&2
  exit 2
fi

echo "Checking reachability of $HOST:$PORT (5s timeout) ..."

# Manual timeout wrapper: `timeout(1)` isn't installed on macOS by default,
# and BSD nc's `-w` only bounds the post-connect idle period, NOT the
# initial connection attempt — verified this hangs indefinitely against a
# black-holed address, so it cannot be trusted alone here.
nc -z "$HOST" "$PORT" >/dev/null 2>&1 &
NC_PID=$!
for _ in $(seq 1 50); do
  if ! kill -0 "$NC_PID" 2>/dev/null; then
    break
  fi
  sleep 0.1
done
if kill -0 "$NC_PID" 2>/dev/null; then
  kill -9 "$NC_PID" 2>/dev/null || true
  wait "$NC_PID" 2>/dev/null || true
  echo "FAIL: $HOST:$PORT did not respond within 5s (Tailscale down? QNAP mongo container down? firewall?)." >&2
  exit 2
fi
NC_STATUS=0
wait "$NC_PID" || NC_STATUS=$?
if [ "$NC_STATUS" -ne 0 ]; then
  echo "FAIL: $HOST:$PORT is not reachable (connection refused)." >&2
  exit 2
fi

echo "OK: TCP reachable."

if ! command -v mongosh >/dev/null 2>&1; then
  echo "mongosh not installed — skipping application-level ping. Install mongosh for a full check." >&2
  exit 4
fi

echo "Pinging MongoDB ..."
if mongosh "$MONGODB_URI" --quiet --eval "db.runCommand({ ping: 1 })" >/dev/null 2>&1; then
  echo "OK: MongoDB responded to ping."
  exit 0
else
  echo "FAIL: TCP reachable but MongoDB did not respond to ping (check credentials / authSource / replica set state)." >&2
  exit 3
fi
