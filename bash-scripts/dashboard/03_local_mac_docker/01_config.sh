#!/usr/bin/env bash
# Non-secret technical constants for the local-mac-docker stack. Sourced by
# every other script in this directory (after REPO_ROOT is already set by
# the sourcing script). Secrets/paths (API keys, Mongo credentials, ...)
# come from root .env.local, loaded separately by each script — never put
# those here.
#
# Docker Compose interpolates the WHOLE compose file for every command,
# including `build` — so every script in this directory must source this
# file and export these before invoking `docker compose`, not just the
# scripts that obviously need the ports (confirmed by a real failure on
# QNAP: 02_build.sh alone exporting ENV_NAME but not the ports produced
# "variable is not set" warnings during `docker compose ... build`).
#
# Content Provider (content-provider-api) removed from this stack — see
# docker-compose.local.yml's header comment. Its appsettings-generation
# helper (write_content_provider_appsettings) and CONTENT_PROVIDER_API_PORT
# were removed from here along with it; the .NET adapter code and
# `net-content-provider` submodule are untouched.

COMPOSE_PROJECT_NAME="chad-local"
COMPOSE_FILE="$REPO_ROOT/docker-compose.local.yml"
ENV_FILE="$REPO_ROOT/.env.local"

DASHBOARD_PORT=12020
MONGODB_PORT=27017

export DASHBOARD_PORT MONGODB_PORT
