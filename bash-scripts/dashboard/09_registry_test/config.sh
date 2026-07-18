#!/usr/bin/env bash
# Non-secret constants for the GHCR-based TEST deploy (deploy.sh). Secrets
# (push/read tokens) live in .env.local (Mac)/.env.qnap (QNAP), never here.
GHCR_REGISTRY="ghcr.io"
GHCR_OWNER="pawelpanda2"
GHCR_IMAGE="chad-dashboard"
