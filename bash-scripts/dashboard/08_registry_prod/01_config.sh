#!/usr/bin/env bash
# Non-secret technical constants for the GHCR-based PROD promotion flow
# (Story 70). Sourced by every other script in this directory. Secrets
# (GHCR read token) come from .env.qnap (PROD only ever pulls, over SSH on
# the QNAP host — same as TEST) — never put those here.
#
# Same registry/owner/image as bash-scripts/dashboard/09_registry_test/
# 01_config.sh (one image, promoted between environments, not rebuilt) —
# duplicated here rather than sourced from there, matching how every other
# environment pair in this repo (04_qnap_test/05_qnap_prod) already keeps
# its own small 01_config.sh rather than sharing one file.

GHCR_REGISTRY="ghcr.io"
GHCR_OWNER="pawelpanda2"
GHCR_IMAGE="chad-dashboard"

export GHCR_REGISTRY GHCR_OWNER GHCR_IMAGE
