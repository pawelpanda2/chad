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
# were removed from here along with it; the .NET adapter code is untouched.
# The `net-content-provider` submodule itself was removed from this
# monorepo (legacy Content Provider fully migrated) — see git history if
# you need its old .NET source.

COMPOSE_PROJECT_NAME="chad-local"
COMPOSE_FILE="$REPO_ROOT/docker-compose.local.yml"
ENV_FILE="$REPO_ROOT/.env.local"

DASHBOARD_PORT=12020
MONGODB_PORT=27017

export DASHBOARD_PORT MONGODB_PORT

# DBA_MONGO_MODE — single switch for which datastore the LOCAL dashboard
# container talks to, read from .env.local (default: "local").
#   local (default): unchanged — MONGODB_URI/BEEPER_MONGODB_URI/POSTGRES_URI
#     come straight from .env.local (sibling containers in this stack).
#   qnap: this script overrides those env vars here, exported into the
#     shell BEFORE `docker compose up` runs — Compose gives shell-exported
#     vars priority over the same names in --env-file, so this wins
#     without editing .env.local.
#       • Mongo (Beeper + any leftover mongo path): QNAP chad-mongodb over
#         Tailscale (100.117.139.83:12040).
#       • Postgres (Story 80/81 primary for cp_items — login users-list,
#         Folders, History): QNAP chad-postgres over Tailscale
#         (100.117.139.83:12042). Story 87: local mode seeds
#         chad_admin/users-list via 03_re-start — qnap is no longer
#         required just to log in locally.
#     Local sibling mongo/postgres containers still start but go unused.
DBA_MONGO_MODE="$(read_env_var "$ENV_FILE" DBA_MONGO_MODE)"
DBA_MONGO_MODE="${DBA_MONGO_MODE:-local}"

if [ "$DBA_MONGO_MODE" = "qnap" ]; then
  QNAP_TAILSCALE_HOST="100.117.139.83"
  QNAP_MONGO_PORT="12040"
  QNAP_POSTGRES_PORT="12042"
  MONGO_ROOT_USERNAME="$(read_env_var "$ENV_FILE" MONGO_ROOT_USERNAME)"
  MONGO_ROOT_PASSWORD="$(read_env_var "$ENV_FILE" MONGO_ROOT_PASSWORD)"
  # Keep LOCAL volume password separate from QNAP — never overwrite
  # POSTGRES_PASSWORD in the shell (Compose would then init/auth the sibling
  # volume with the wrong secret and Dev Panel → Local would fail).
  QNAP_ENV_FILE="$REPO_ROOT/.env.qnap"
  POSTGRES_USER="$(read_env_var "$ENV_FILE" POSTGRES_USER)"
  POSTGRES_PASSWORD="$(read_env_var "$ENV_FILE" POSTGRES_PASSWORD)"
  POSTGRES_DB="$(read_env_var "$ENV_FILE" POSTGRES_DB)"
  POSTGRES_QNAP_PASSWORD="$(read_env_var "$ENV_FILE" POSTGRES_QNAP_PASSWORD)"
  if [ -z "$POSTGRES_QNAP_PASSWORD" ] && [ -f "$QNAP_ENV_FILE" ]; then
    POSTGRES_QNAP_PASSWORD="$(read_env_var "$QNAP_ENV_FILE" POSTGRES_PASSWORD)"
    QNAP_PG_USER="$(read_env_var "$QNAP_ENV_FILE" POSTGRES_USER)"
    QNAP_PG_DB="$(read_env_var "$QNAP_ENV_FILE" POSTGRES_DB)"
    [ -n "$QNAP_PG_USER" ] && POSTGRES_USER="$QNAP_PG_USER"
    [ -n "$QNAP_PG_DB" ] && POSTGRES_DB="$QNAP_PG_DB"
  fi
  if [ -z "$POSTGRES_QNAP_PASSWORD" ]; then
    POSTGRES_QNAP_PASSWORD="$POSTGRES_PASSWORD"
  fi
  POSTGRES_USER="${POSTGRES_USER:-chad}"
  POSTGRES_DB="${POSTGRES_DB:-chad}"
  if [ -z "$POSTGRES_PASSWORD" ]; then
    log_error "POSTGRES_PASSWORD missing in $ENV_FILE (local volume password)."
    exit 1
  fi
  if [ -z "$POSTGRES_QNAP_PASSWORD" ]; then
    log_error "POSTGRES_QNAP_PASSWORD missing — set it in $ENV_FILE (preferred) or POSTGRES_PASSWORD in $QNAP_ENV_FILE."
    exit 1
  fi
  # directConnection=true is required here (found 2026-07-22, real failure:
  # the dashboard's background Google Sheets worker's continuous polling
  # loop failed with "getaddrinfo ENOTFOUND chad-mongodb" a few ticks after
  # startup). QNAP's chad-mongodb is a single-node replica set (rs0, Story
  # 74); once the driver completes its initial handshake, it discovers the
  # replica set's own self-reported member address, which is the
  # container's own Docker-internal hostname ("chad-mongodb") — unreachable
  # from outside QNAP's docker network. directConnection=true skips that
  # topology discovery and only ever uses the one seed address given here
  # (the same fix already needed for local Mongo in dba's own test suite,
  # see packages/dba/src/*.test.ts headers — same root cause, same fix).
  MONGODB_URI="mongodb://${MONGO_ROOT_USERNAME}:${MONGO_ROOT_PASSWORD}@${QNAP_TAILSCALE_HOST}:${QNAP_MONGO_PORT}/chad?authSource=admin&directConnection=true"
  # Story 73: no database segment — getBeeperMongoDb(repoGuid) in
  # packages/dba/src/mongo.ts always calls client.db(`beeper_<repoGuid>`)
  # explicitly, so this is a server URI only.
  BEEPER_MONGODB_URI="mongodb://${MONGO_ROOT_USERNAME}:${MONGO_ROOT_PASSWORD}@${QNAP_TAILSCALE_HOST}:${QNAP_MONGO_PORT}?authSource=admin&directConnection=true"
  POSTGRES_URI="postgres://${POSTGRES_USER}:${POSTGRES_QNAP_PASSWORD}@${QNAP_TAILSCALE_HOST}:${QNAP_POSTGRES_PORT}/${POSTGRES_DB}"
  export MONGODB_URI BEEPER_MONGODB_URI POSTGRES_URI
  # Local volume password stays POSTGRES_PASSWORD (from .env.local).
  export POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB POSTGRES_QNAP_PASSWORD
  LOCAL_PG_PORT="$(read_env_var "$ENV_FILE" POSTGRES_PORT)"
  LOCAL_POSTGRES_HOST_URI="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${LOCAL_PG_PORT:-5433}/${POSTGRES_DB}"
  export LOCAL_POSTGRES_HOST_URI
  log_info "DBA_MONGO_MODE=qnap — local dashboard will use QNAP Mongo (:${QNAP_MONGO_PORT}) + Postgres (:${QNAP_POSTGRES_PORT}) over Tailscale (${QNAP_TAILSCALE_HOST})."
elif [ "$DBA_MONGO_MODE" = "local" ]; then
  # Safety guard (2026-07-22, real incident): GOOGLE_SHEETS_ENABLED in
  # .env.local is a single flag with no awareness of DBA_MONGO_MODE — left
  # alone, a normal DBA_MONGO_MODE=local dev session (test/dev data, safe to
  # wipe/reset) would still run the embedded Google Sheets worker against
  # that same test data and sync it straight into the REAL, per-user
  # production spreadsheets. Sheets sync must only ever reflect production
  # (QNAP) data — forced off here unconditionally whenever DBA_MONGO_MODE is
  # "local", regardless of what .env.local itself says; only DBA_MONGO_MODE=
  # qnap (production Mongo) can leave it enabled.
  export GOOGLE_SHEETS_ENABLED=false
  # Host-side URI for migrations/seed/sync scripts (port published on the Mac).
  # Inside Compose the dashboard still uses service DNS `postgres:5432`.
  POSTGRES_USER="$(read_env_var "$ENV_FILE" POSTGRES_USER)"
  POSTGRES_PASSWORD="$(read_env_var "$ENV_FILE" POSTGRES_PASSWORD)"
  POSTGRES_DB="$(read_env_var "$ENV_FILE" POSTGRES_DB)"
  POSTGRES_PORT="$(read_env_var "$ENV_FILE" POSTGRES_PORT)"
  POSTGRES_QNAP_PASSWORD="$(read_env_var "$ENV_FILE" POSTGRES_QNAP_PASSWORD)"
  POSTGRES_USER="${POSTGRES_USER:-chad}"
  POSTGRES_DB="${POSTGRES_DB:-chad}"
  POSTGRES_PORT="${POSTGRES_PORT:-5433}"
  if [ -z "$POSTGRES_PASSWORD" ]; then
    log_error "POSTGRES_PASSWORD missing in $ENV_FILE (required for DBA_MONGO_MODE=local)."
    exit 1
  fi
  LOCAL_POSTGRES_HOST_URI="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT}/${POSTGRES_DB}"
  export POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB POSTGRES_PORT LOCAL_POSTGRES_HOST_URI POSTGRES_QNAP_PASSWORD
  log_info "DBA_MONGO_MODE=local — Google Sheets sync forced OFF; local volume mirrors QNAP via 07_sync / Dev Panel."
else
  log_error "Invalid DBA_MONGO_MODE=\"$DBA_MONGO_MODE\" in $ENV_FILE — must be \"local\" or \"qnap\"."
  exit 1
fi

# Expose mode so 03_re-start can branch.
export DBA_MONGO_MODE

# Story 89/Sheets: export the spreadsheet map from .env.local into the shell
# so docker-compose can pass it through WITHOUT ${...} interpolation (which
# strips JSON quotes and breaks History → Google Sheets).
GOOGLE_SHEETS_SPREADSHEET_MAP="$(read_env_var "$ENV_FILE" GOOGLE_SHEETS_SPREADSHEET_MAP)"
if [ -n "$GOOGLE_SHEETS_SPREADSHEET_MAP" ]; then
  export GOOGLE_SHEETS_SPREADSHEET_MAP
fi
