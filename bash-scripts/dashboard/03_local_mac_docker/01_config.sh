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

# DBA_MONGO_MODE — initial Mongo source for the LOCAL dashboard container,
# read from .env.local. Dev Panel can still switch at runtime.
#   qnap (default when unset in dba): Server Beeper Mongo over Tailscale
#     (`beeper-mongodb` on :12041) with BEEPER_MONGO_ROOT_*.
#   local: Local readonly backup (sibling `mongodb` container) — read-only
#     writes blocked in dba. CHAD Postgres is unaffected.
# Historical note: chad-mongodb on :12040 was removed 2026-07-27 — never
# point Beeper at that port.
DBA_MONGO_MODE="$(read_env_var "$ENV_FILE" DBA_MONGO_MODE)"
DBA_MONGO_MODE="${DBA_MONGO_MODE:-local}"

if [ "$DBA_MONGO_MODE" = "qnap" ]; then
  QNAP_TAILSCALE_HOST="100.117.139.83"
  QNAP_MONGO_PORT="12040"
  QNAP_BEEPER_MONGO_PORT="12041"
  QNAP_POSTGRES_PORT="12042"
  MONGO_ROOT_USERNAME="$(read_env_var "$ENV_FILE" MONGO_ROOT_USERNAME)"
  MONGO_ROOT_PASSWORD="$(read_env_var "$ENV_FILE" MONGO_ROOT_PASSWORD)"
  BEEPER_MONGO_ROOT_USERNAME="$(read_env_var "$ENV_FILE" BEEPER_MONGO_ROOT_USERNAME)"
  BEEPER_MONGO_ROOT_PASSWORD="$(read_env_var "$ENV_FILE" BEEPER_MONGO_ROOT_PASSWORD)"
  QNAP_ENV_FILE="$REPO_ROOT/.env.qnap"
  if [ -z "$BEEPER_MONGO_ROOT_USERNAME" ] && [ -f "$QNAP_ENV_FILE" ]; then
    BEEPER_MONGO_ROOT_USERNAME="$(read_env_var "$QNAP_ENV_FILE" BEEPER_MONGO_ROOT_USERNAME)"
    BEEPER_MONGO_ROOT_PASSWORD="$(read_env_var "$QNAP_ENV_FILE" BEEPER_MONGO_ROOT_PASSWORD)"
  fi
  # Keep LOCAL volume password separate from QNAP — never overwrite
  # POSTGRES_PASSWORD in the shell (Compose would then init/auth the sibling
  # volume with the wrong secret and Dev Panel → Local would fail).
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
  if [ -z "$BEEPER_MONGO_ROOT_USERNAME" ] || [ -z "$BEEPER_MONGO_ROOT_PASSWORD" ]; then
    log_error "BEEPER_MONGO_ROOT_USERNAME/PASSWORD missing — set in $ENV_FILE or $QNAP_ENV_FILE (never reuse MONGO_ROOT_*)."
    exit 1
  fi
  # directConnection=true is required here (found 2026-07-22, real failure:
  # the dashboard's background Google Sheets worker's continuous polling
  # loop failed with "getaddrinfo ENOTFOUND chad-mongodb" a few ticks after
  # startup). QNAP's legacy chad-mongodb was a single-node replica set; the
  # same flag is safe for beeper-mongodb over Tailscale.
  MONGODB_URI="mongodb://${MONGO_ROOT_USERNAME}:${MONGO_ROOT_PASSWORD}@${QNAP_TAILSCALE_HOST}:${QNAP_MONGO_PORT}/chad?authSource=admin&directConnection=true"
  # Story 73: no database segment — getBeeperMongoDb(repoGuid) always calls
  # client.db(`beeper_<repoGuid>`) explicitly. Port MUST be 12041 (Beeper),
  # never 12040 (removed chad-mongodb). Credentials MUST be BEEPER_MONGO_ROOT_*.
  BEEPER_MONGODB_URI="mongodb://${BEEPER_MONGO_ROOT_USERNAME}:${BEEPER_MONGO_ROOT_PASSWORD}@${QNAP_TAILSCALE_HOST}:${QNAP_BEEPER_MONGO_PORT}?authSource=admin&directConnection=true"
  export MONGODB_URI BEEPER_MONGODB_URI BEEPER_MONGO_ROOT_USERNAME BEEPER_MONGO_ROOT_PASSWORD
  # Local volume password stays POSTGRES_PASSWORD (from .env.local).
  export POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB POSTGRES_QNAP_PASSWORD
  LOCAL_PG_PORT="$(read_env_var "$ENV_FILE" POSTGRES_PORT)"
  LOCAL_POSTGRES_HOST_URI="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${LOCAL_PG_PORT:-5433}/${POSTGRES_DB}"
  export LOCAL_POSTGRES_HOST_URI
  # Runtime CHAD Postgres default is Server (QNAP Tailscale) via Dev Panel /
  # dev-db-override — NOT the compose sibling postgres:5432. That local
  # volume is bootstrap/legacy only; emergency read path is offline-readonly-backup.
  log_info "DBA_MONGO_MODE=qnap — Beeper via QNAP (:${QNAP_BEEPER_MONGO_PORT}); CHAD Postgres default = Server QNAP Tailscale (:${QNAP_POSTGRES_PORT:-12042}), not local sibling volume."
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
