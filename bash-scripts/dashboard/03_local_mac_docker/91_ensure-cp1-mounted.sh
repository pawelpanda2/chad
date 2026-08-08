#!/usr/bin/env bash
# Ensures the `cp_1` SMB share (QNAP, reached over Tailscale) is actually
# mounted at /Volumes/cp_1 before the local Mac Docker stack starts.
#
# Why this exists (real incident, Story 106 follow-up): the dashboard
# container's audio-recordings and contact-photos bind mounts both point at
# subtrees of /Volumes/cp_1/02_files_refrenced on the host. Compose's
# `bind.create_host_path: true` on those mounts means that if /Volumes/cp_1
# isn't mounted when `docker compose up` runs, Docker silently creates an
# EMPTY LOCAL DIRECTORY at that path instead of erroring — uploads then
# "succeed" into a decoy folder that never reaches the real network share,
# which is worse than a loud failure. This script fails loudly instead.
#
# Also covers the other real failure mode seen in practice: the share WAS
# mounted, but got remounted (or files there changed) after Docker Desktop's
# virtiofs bridge already cached its view of the directory, producing
# `EPERM`/`ENOTDIR` errors from inside the container even though the host
# side looks fine. Restarting the stack (03_re-start.sh, which calls this
# script) refreshes that cache — this script's mount check alone can't fix
# a stale cache, only a missing mount, but it's the same "run this before
# every restart" preflight either way.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"

CP1_MOUNT_POINT="/Volumes/cp_1"
# Same Tailscale IP already used for QNAP Mongo/Postgres in 01_config.sh —
# not redefined there because that file is sourced by every script
# (including on non-Mac CI-style runs) and this check is Mac-only (uses
# `mount`/`open smb://`, neither of which exists on Linux).
CP1_SMB_HOST="${CP1_SMB_HOST:-100.117.139.83}"
CP1_SHARE_NAME="cp_1"

is_cp1_mounted() {
  # macOS: `mount` lives in /sbin; Cursor/agent PATH often omits it.
  /sbin/mount | grep -q "on ${CP1_MOUNT_POINT} (smbfs"
}

if is_cp1_mounted; then
  log_ok "cp_1 share already mounted at $CP1_MOUNT_POINT."
  exit 0
fi

if [ -d "$CP1_MOUNT_POINT" ] && [ -n "$(ls -A "$CP1_MOUNT_POINT" 2>/dev/null)" ]; then
  log_warn "$CP1_MOUNT_POINT exists and is non-empty but is NOT a live smbfs mount — likely a decoy directory Docker created earlier because the share wasn't mounted at the time. Not deleting it automatically; if audio recordings / contact photos look wrong after this script mounts the real share, check for stray files directly under $CP1_MOUNT_POINT (they don't belong there — everything real lives under the actual share)."
fi

log_info "cp_1 share not mounted — attempting to mount smb://${CP1_SMB_HOST}/${CP1_SHARE_NAME} (uses Keychain-saved credentials via Finder; a Finder/Keychain prompt may appear once)..."
open "smb://${CP1_SMB_HOST}/${CP1_SHARE_NAME}" >/dev/null 2>&1 || true

waited=0
while [ "$waited" -lt 20 ]; do
  if is_cp1_mounted; then
    log_ok "cp_1 share mounted at $CP1_MOUNT_POINT."
    exit 0
  fi
  sleep 1
  waited=$((waited + 1))
done

log_error "cp_1 share still not mounted at $CP1_MOUNT_POINT after 20s."
log_error "Mount it manually (Finder -> Go -> Connect to Server -> smb://${CP1_SMB_HOST}/${CP1_SHARE_NAME}) and re-run this script, or the stack will silently write audio recordings / contact photos to a local decoy directory instead of the real share."
if [ "${CHAD_ALLOW_WITHOUT_CP1:-}" = "1" ]; then
  log_warn "CHAD_ALLOW_WITHOUT_CP1=1 — continuing without cp_1 (audio/photos may write to a local decoy)."
  exit 0
fi
exit 1
