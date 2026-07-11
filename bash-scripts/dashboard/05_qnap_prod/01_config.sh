#!/usr/bin/env bash
# Non-secret technical constants for the QNAP PROD dashboard. Sourced by
# every other script in this directory (after REPO_ROOT is already set by
# the sourcing script). Secrets/paths (SSH creds, Mongo credentials,
# CP_REPOS_HOST_PATH, ...) come from root .env.qnap, loaded separately by
# each script — never put those here.
#
# PROD is dashboard-ONLY — mongo + content-provider-api are shared with
# TEST and live in docker-compose.qnap.shared.yml / bash-scripts/dashboard/
# 00_qnap_shared/ instead. This directory never starts, stops, or builds
# those.
#
# Docker Compose interpolates the WHOLE compose file for every command,
# including `build` — so every script in this directory must source this
# file and export these before invoking `docker compose`.

COMPOSE_PROJECT_NAME="chad-prod"
ENV_NAME="prod"
COMPOSE_FILE="$REPO_ROOT/docker-compose.qnap.prod.yml"
ENV_FILE="$REPO_ROOT/.env.qnap"

DASHBOARD_PORT=12030

# Port of the SHARED content-provider-api (docker-compose.qnap.shared.yml)
# — read-only reference here, used only to preflight-check that the shared
# stack is up before starting this dashboard. Never used to start/stop/build
# the shared service itself.
CONTENT_PROVIDER_API_PORT=12024

export ENV_NAME DASHBOARD_PORT CONTENT_PROVIDER_API_PORT

# QNAP's Container Station sets HOME to a directory the SSH user often
# doesn't have write access to. Point DOCKER_CONFIG at a writable directory
# inside the repo instead.
DOCKER_CONFIG_DIR="$REPO_ROOT/.docker-qnap"
mkdir -p "$DOCKER_CONFIG_DIR"
export DOCKER_CONFIG="$DOCKER_CONFIG_DIR"
