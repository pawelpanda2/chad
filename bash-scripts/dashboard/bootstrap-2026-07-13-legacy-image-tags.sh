#!/usr/bin/env bash
# ONE-TIME migration helper — NOT part of the numbered build/begin/end/
# status/deploy family, and not meant to be run again after 2026-07-13.
#
# Context: before this date, 02_build.sh tagged every image with BOTH a
# timestamp AND `:latest`, and begin.sh silently fell back to `:latest`
# (see documentation/ai-docs/deploy/image-tagging-standard.md — "Incydent").
# That's fixed now: 02_build.sh writes a canonical tag-record file
# (.image-tag.<image>.env) after every successful build, and 03_begin.sh
# refuses to start without one.
#
# But images built by the OLD scripts never had that file written. This
# script recovers that missing state for the QNAP's two already-built
# images, WITHOUT rebuilding and WITHOUT `docker tag`-ing chad-dashboard
# (it already carries a real timestamp tag from its original build — this
# just records that existing tag). chad-content-provider-api only ever had
# `:latest`, so this tags the EXISTING image (no rebuild) with a timestamp
# derived from its own real `Created` date, then records that.
#
# Run once, on the QNAP, via:
#   bash bash-scripts/dashboard/06_qnap_ssh/deploy_test.sh  (or any wrapper
#   that does `git pull` first) -- then, from an SSH session or a future
#   wrapper, `bash bash-scripts/dashboard/bootstrap-2026-07-13-legacy-image-tags.sh`.
# After this runs once, delete this file — its job is done and every future
# build owns these tag files automatically.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"

cd "$REPO_ROOT"

echo ""
log_info "Bootstrap: chad-dashboard tag-record"
DASHBOARD_TAG_FILE="$(dashboard_image_tag_file)"
if [ -f "$DASHBOARD_TAG_FILE" ]; then
  log_ok "Already present, nothing to do: $DASHBOARD_TAG_FILE ($(cat "$DASHBOARD_TAG_FILE"))"
elif docker image inspect chad-dashboard:260713_134936 >/dev/null 2>&1; then
  write_image_tag "$DASHBOARD_TAG_FILE" "260713_134936"
  log_ok "Recorded pre-existing build (no rebuild, no docker tag — this tag already existed on the image)."
else
  log_warn "chad-dashboard:260713_134936 not found on this host — nothing to bootstrap. Run a real build (02_build.sh) instead."
fi

echo ""
log_info "Bootstrap: chad-content-provider-api tag-record"
CP_TAG_FILE="$(content_provider_image_tag_file)"
if [ -f "$CP_TAG_FILE" ]; then
  log_ok "Already present, nothing to do: $CP_TAG_FILE ($(cat "$CP_TAG_FILE"))"
elif docker image inspect chad-content-provider-api:latest >/dev/null 2>&1; then
  # Pure-bash RFC3339 parsing ("2026-07-11T16:08:39.06...+02:00" ->
  # "260711_160839") — no `date -d` (GNU-only; QNAP's BusyBox date doesn't
  # support it, confirmed by a real failure here).
  CREATED="$(docker inspect chad-content-provider-api:latest --format '{{.Created}}')"
  DATE_PART="${CREATED%%T*}"
  TIME_PART="${CREATED#*T}"
  TIME_PART="${TIME_PART%%.*}"
  TS="${DATE_PART:2:2}${DATE_PART:5:2}${DATE_PART:8:2}_${TIME_PART:0:2}${TIME_PART:3:2}${TIME_PART:6:2}"
  if ! [[ "$TS" =~ ^[0-9]{6}_[0-9]{6}$ ]]; then
    log_error "Could not parse image Created date ('$CREATED') into a tag. Bootstrap this one manually or rebuild via 00_qnap_shared/02_build.sh."
    exit 1
  fi
  # No rebuild — tags the EXISTING image (same bytes as :latest) with a
  # timestamp derived from its real build date, so the record is honest
  # about when it was actually built, not "now".
  docker tag chad-content-provider-api:latest "chad-content-provider-api:$TS"
  write_image_tag "$CP_TAG_FILE" "$TS"
  log_ok "Tagged existing image chad-content-provider-api:latest as :$TS (its real build date) and recorded it."
else
  log_warn "chad-content-provider-api:latest not found on this host — nothing to bootstrap. Run a real build (00_qnap_shared/02_build.sh) instead."
fi

echo ""
log_ok "Bootstrap done. From now on, both images are fully owned by write_image_tag/require_image_tag (02_build.sh / 03_begin.sh)."
log_info "This script's job is done — safe to delete after confirming begin_shared.sh / begin_test.sh / begin_prod.sh work."
