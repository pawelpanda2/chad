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

# DBA_MONGO_MODE — single switch for which Mongo the LOCAL dashboard
# container talks to, read from .env.local (default: "local").
#   local (default): unchanged — MONGODB_URI/BEEPER_MONGODB_URI come
#     straight from .env.local (the local chad-mongodb-local-mac-docker
#     container started by this same stack).
#   qnap: this script overrides both env vars here, exported into the
#     shell BEFORE `docker compose up` runs — Compose gives shell-exported
#     vars priority over the same names in --env-file, so this wins
#     without editing .env.local. Points at QNAP's chad-mongodb over
#     Tailscale (100.117.139.83:12040, published in
#     docker-compose.qnap.shared.yml — see that file's header comment),
#     same credentials as local (MONGO_ROOT_USERNAME/PASSWORD, "change_me"
#     on both sides). The local chad-mongodb-local-mac-docker container
#     still starts (this stack always runs both services) but simply goes
#     unused in this mode.
DBA_MONGO_MODE="$(read_env_var "$ENV_FILE" DBA_MONGO_MODE)"
DBA_MONGO_MODE="${DBA_MONGO_MODE:-local}"

if [ "$DBA_MONGO_MODE" = "qnap" ]; then
  QNAP_TAILSCALE_HOST="100.117.139.83"
  QNAP_MONGO_PORT="12040"
  MONGO_ROOT_USERNAME="$(read_env_var "$ENV_FILE" MONGO_ROOT_USERNAME)"
  MONGO_ROOT_PASSWORD="$(read_env_var "$ENV_FILE" MONGO_ROOT_PASSWORD)"
  MONGODB_URI="mongodb://${MONGO_ROOT_USERNAME}:${MONGO_ROOT_PASSWORD}@${QNAP_TAILSCALE_HOST}:${QNAP_MONGO_PORT}/chad?authSource=admin"
  # Story 73: no database segment — getBeeperMongoDb(repoGuid) in
  # packages/dba/src/mongo.ts always calls client.db(`beeper_<repoGuid>`)
  # explicitly, so this is a server URI only.
  BEEPER_MONGODB_URI="mongodb://${MONGO_ROOT_USERNAME}:${MONGO_ROOT_PASSWORD}@${QNAP_TAILSCALE_HOST}:${QNAP_MONGO_PORT}?authSource=admin"
  export MONGODB_URI BEEPER_MONGODB_URI
  log_info "DBA_MONGO_MODE=qnap — local dashboard will use QNAP's Mongo over Tailscale (${QNAP_TAILSCALE_HOST}:${QNAP_MONGO_PORT})."
elif [ "$DBA_MONGO_MODE" != "local" ]; then
  log_error "Invalid DBA_MONGO_MODE=\"$DBA_MONGO_MODE\" in $ENV_FILE — must be \"local\" or \"qnap\"."
  exit 1
fi
