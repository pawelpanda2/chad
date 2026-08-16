#!/usr/bin/env bash
# Prepares read-only host paths for LOCAL Docker when cp_1 is unavailable
# (Story 123). Never uses /Volumes/cp_1 as a writable decoy.
#
# Exports (for the calling 03_re-start / compose):
#   CHAD_CONTACT_PHOTOS_HOST_PATH
#   CHAD_AUDIO_RECORDINGS_HOST_PATH
#   CHAD_CP1_MODE=degraded
#
# Creates empty dirs under .runtime/cp1-unavailable/ with mode 0555 so even
# if create_host_path races, they are not world-writable storage.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"

ROOT="${CHAD_CP1_UNAVAILABLE_ROOT:-$REPO_ROOT/.runtime/cp1-unavailable}"
PHOTOS="$ROOT/02_files_refrenced"
AUDIO="$ROOT/10_files_audio"

mkdir -p "$PHOTOS" "$AUDIO"
# Strip write bits for owner/group/other (no silent decoy writes).
/bin/chmod -R a-w "$ROOT" 2>/dev/null || true
/bin/chmod u+rx,go+rx "$ROOT" "$PHOTOS" "$AUDIO" 2>/dev/null || true
# Keep dirs traversable but not writable.
/bin/chmod 555 "$PHOTOS" "$AUDIO" "$ROOT" 2>/dev/null || true

# Marker for humans / tests
mkdir -p "$REPO_ROOT/.runtime/cp1-repair" 2>/dev/null || true
printf '%s\n' "degraded" >"$REPO_ROOT/.runtime/cp1-repair/mode" 2>/dev/null || true

export CHAD_CONTACT_PHOTOS_HOST_PATH="$PHOTOS"
export CHAD_AUDIO_RECORDINGS_HOST_PATH="$AUDIO"
export CHAD_CP1_MODE=degraded

log_warn "cp_1 DEGRADED: binding read-only unavailable stubs under .runtime/cp1-unavailable/"
log_warn "  File-storage writes will be rejected (CHAD_CP1_MODE=degraded)."
log_warn "  Dashboard and non-storage features continue."
