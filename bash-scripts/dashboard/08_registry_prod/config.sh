#!/usr/bin/env bash
# Non-secret constants for the GHCR-based PROD promotion (deploy.sh). Same
# image as 09_registry_test/config.sh (promoted, never rebuilt). Secrets
# (read token) live in .env.qnap on the QNAP host, never here.
GHCR_REGISTRY="ghcr.io"
GHCR_OWNER="pawelpanda2"
GHCR_IMAGE="chad-dashboard"
