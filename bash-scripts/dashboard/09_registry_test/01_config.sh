#!/usr/bin/env bash
# Non-secret technical constants for the GHCR-based TEST registry flow
# (Story 70). Sourced by every other script in this directory. Secrets
# (GHCR push/read tokens) come from .env.local (build+push, Mac-side) /
# .env.qnap (pull, QNAP-side) — never put those here.
#
# GHCR_OWNER is this repo's REAL GitHub owner — confirmed via
# `git remote -v` (github.com/pawelpanda2/chad) — not necessarily your own
# personal GitHub account if it differs; do not change this without
# re-confirming the repo's actual owner first. GHCR_IMAGE matches the
# existing local image name used everywhere else in this repo
# (chad-dashboard, e.g. docker-compose.qnap.test.yml's `image:` field) —
# same image, now also mirrored to a registry.

GHCR_REGISTRY="ghcr.io"
GHCR_OWNER="pawelpanda2"
GHCR_IMAGE="chad-dashboard"

export GHCR_REGISTRY GHCR_OWNER GHCR_IMAGE
