#!/usr/bin/env bash
# Story 123 — regression checks for cp_1 local deploy contract (no secrets).
# Run from chad repo root: bash bash-scripts/dashboard/03_local_mac_docker/98_cp1-contract-selftest.sh
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"

fail=0
pass() { log_ok "PASS: $*"; }
bad() { log_error "FAIL: $*"; fail=1; }

# D — placeholder must not count as healthy smbfs
TMP="$(/usr/bin/mktemp -d /tmp/chad-cp1-selftest.XXXXXX)"
# Simulate classify helpers by grepping script contract
rg -q 'find_alternate_cp1_mount' "$SCRIPT_DIR/91_ensure-cp1-mounted.sh" \
  && pass "91 reclaim alternate mount helper present" \
  || bad "91 missing reclaim helper"

rg -q 'write_cp1_mode' "$SCRIPT_DIR/91_ensure-cp1-mounted.sh" \
  && pass "91 writes mode marker" \
  || bad "91 missing mode marker"

rg -q 'CP1_DEGRADED' "$SCRIPT_DIR/03_re-start.sh" \
  && pass "03_re-start respects degraded" \
  || bad "03_re-start missing degraded branch"

rg -q '97_prepare-cp1-degraded-binds' "$SCRIPT_DIR/03_re-start.sh" \
  && pass "03 sources degraded binds helper" \
  || bad "03 missing 97 source"

# F — CHAD_ALLOW / default degraded must not hit unconditional abort alone
if rg -n 'Host read of /Volumes/cp_1' "$SCRIPT_DIR/03_re-start.sh" | rg -q 'CP1_DEGRADED'; then
  : # optional
fi
# Ensure host probe is inside else of degraded
python3 - <<'PY'
from pathlib import Path
t=Path("bash-scripts/dashboard/03_local_mac_docker/03_re-start.sh").read_text()
idx=t.find('CP1_DEGRADED=1')
probe=t.find('Host read of /Volumes/cp_1')
assert idx!=-1 and probe!=-1 and probe>idx, 'probe must be after degraded assignment'
# probe should be in else branch: look for "else" between
chunk=t[idx:probe]
assert 'else' in chunk, 'host probe must be under else (not unconditional)'
print('contract_ok')
PY
pass "03 host probe is conditional on non-degraded"

# Prepare degraded binds — must create 555 stubs outside /Volumes/cp_1
# shellcheck disable=SC1091
source "$SCRIPT_DIR/97_prepare-cp1-degraded-binds.sh" >/dev/null
mode="$(cat "$REPO_ROOT/.runtime/cp1-repair/mode" 2>/dev/null || true)"
[ "$mode" = "degraded" ] && pass "97 sets mode=degraded" || bad "97 mode=$mode"
photos="${CHAD_CONTACT_PHOTOS_HOST_PATH:-}"
case "$photos" in
  */.runtime/cp1-unavailable/*) pass "degraded photos path under .runtime" ;;
  *) bad "unexpected photos path: $photos" ;;
esac
case "$photos" in
  /Volumes/cp_1*) bad "degraded must not use /Volumes/cp_1" ;;
esac
# Not writable by owner write bit
if [ -d "$photos" ] && [ ! -w "$photos" ]; then
  pass "degraded photos dir not writable"
else
  bad "degraded photos dir still writable (or missing)"
fi

# Restore healthy mode marker if live mount is healthy (do not leave degraded sticky)
if /sbin/mount | /usr/bin/grep -q ' on /Volumes/cp_1 (smbfs'; then
  printf 'healthy\n' >"$REPO_ROOT/.runtime/cp1-repair/mode"
  pass "restored mode=healthy because live smbfs present"
fi

rm -rf "$TMP"
if [ "$fail" -ne 0 ]; then
  log_error "cp_1 contract selftest FAILED"
  exit 1
fi
log_ok "cp_1 contract selftest PASS"
exit 0
