#!/usr/bin/env bash
# Health check: is the local Beeper Desktop REST API reachable and
# authenticated? Uses GET /v1/app/setup (the same lightweight diagnostic
# endpoint packages/beeper-sync/diag-setup.mjs uses) — read-only, no side
# effects.
#
# Reads BEEPER_REST_URL and BEEPER_API_KEY from env (source .env.mac-beeper
# first). Never prints the API key.
#
# Exit codes:
#   0 = reachable and authenticated (HTTP 200)
#   1 = BEEPER_REST_URL or BEEPER_API_KEY not set
#   2 = not reachable (Beeper Desktop not running / wrong URL)
#   3 = reachable but not authenticated (bad/stale BEEPER_API_KEY)

set -euo pipefail

if [ -z "${BEEPER_REST_URL:-}" ] || [ -z "${BEEPER_API_KEY:-}" ]; then
  echo "Error: BEEPER_REST_URL or BEEPER_API_KEY is not set. Source .env.mac-beeper first." >&2
  exit 1
fi

echo "Checking Beeper Desktop at $BEEPER_REST_URL ..."

HTTP_CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 \
  -H "Authorization: Bearer $BEEPER_API_KEY" \
  "$BEEPER_REST_URL/v1/app/setup" 2>/dev/null)" || true
HTTP_CODE="${HTTP_CODE:-000}"

if [ "$HTTP_CODE" = "200" ]; then
  echo "OK: Beeper Desktop reachable and authenticated."
  exit 0
elif [ "$HTTP_CODE" = "000" ]; then
  echo "FAIL: Beeper Desktop not reachable at $BEEPER_REST_URL (is Beeper Desktop running?)." >&2
  exit 2
elif [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
  echo "FAIL: Beeper Desktop reachable but rejected the API key (HTTP $HTTP_CODE)." >&2
  exit 3
else
  echo "FAIL: Beeper Desktop returned unexpected HTTP $HTTP_CODE." >&2
  exit 3
fi
