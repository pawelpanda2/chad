#!/usr/bin/env bash
# Non-secret technical constants for the QNAP SHARED stack (mongo, used by
# BOTH TEST and PROD dashboards). Sourced by every other script in this
# directory. Secrets/paths (SSH creds, Mongo credentials, ...) come from
# root .env.qnap, loaded separately by each script — never put those here.
#
# Docker Compose interpolates the WHOLE compose file for every command,
# including `build` — so every script in this directory must source this
# file and export these before invoking `docker compose` (see
# 04_qnap_test/01_config.sh for the confirmed real failure this avoids).
#
# Content Provider (content-provider-api) removed from this stack — Mongo
# is the only active runtime backend now (DBA_CONTENT_PROVIDER_ENABLED=false,
# DBA_PRIMARY_BACKEND=mongo). Its appsettings-generation helper
# (write_content_provider_appsettings) and CONTENT_PROVIDER_API_PORT were
# removed from here along with it; the .NET adapter code and
# `net-content-provider` submodule are untouched — this is a
# deployment-only change, reversible by re-adding the service to
# docker-compose.qnap.shared.yml (see that file's header comment).

COMPOSE_PROJECT_NAME="chad-shared"
ENV_NAME="shared"
COMPOSE_FILE="$REPO_ROOT/docker-compose.qnap.shared.yml"
ENV_FILE="$REPO_ROOT/.env.qnap"

export ENV_NAME

# QNAP's Container Station sets HOME to a directory the SSH user often
# doesn't have write access to. Point DOCKER_CONFIG at a writable directory
# inside the repo instead of fighting Container Station's HOME.
DOCKER_CONFIG_DIR="$REPO_ROOT/.docker-qnap"
mkdir -p "$DOCKER_CONFIG_DIR"
export DOCKER_CONFIG="$DOCKER_CONFIG_DIR"
