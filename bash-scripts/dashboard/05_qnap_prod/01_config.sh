#!/usr/bin/env bash
# Non-secret technical constants for the QNAP PROD stack. Sourced by every
# other script in this directory (after REPO_ROOT is already set by the
# sourcing script). Secrets/paths (SSH creds, Mongo credentials,
# CP_REPOS_HOST_PATH, ...) come from root .env.qnap, loaded separately by
# each script — never put those here.
#
# Docker Compose interpolates the WHOLE compose file for every command,
# including `build` — so every script in this directory must source this
# file and export these before invoking `docker compose`.

COMPOSE_PROJECT_NAME="chad-prod"
ENV_NAME="prod"
COMPOSE_FILE="$REPO_ROOT/docker-compose.qnap.yml"
ENV_FILE="$REPO_ROOT/.env.qnap"

DASHBOARD_PORT=12030
CONTENT_PROVIDER_API_PORT=12034
MONGODB_PORT=27017

export ENV_NAME DASHBOARD_PORT CONTENT_PROVIDER_API_PORT MONGODB_PORT

# QNAP's Container Station sets HOME to a directory the SSH user often
# doesn't have write access to (confirmed real error on QNAP TEST: "mkdir
# /share/CACHEDEV1_DATA/.qpkg/container-station/homes/<user>: permission
# denied"). Point DOCKER_CONFIG at a writable directory inside the repo
# instead.
DOCKER_CONFIG_DIR="$REPO_ROOT/.docker-qnap"
mkdir -p "$DOCKER_CONFIG_DIR"
export DOCKER_CONFIG="$DOCKER_CONFIG_DIR"

# Content Provider's own config module (appsettings.json) — not a secret,
# so the full file lives here as text rather than split into individual
# PreparerModule__* environment variable overrides. /data/repos is the
# in-container mount point for CP_REPOS_HOST_PATH (see docker-compose.qnap.yml),
# not a real host path — the real host path lives in .env.qnap, not here.
read -r -d '' CONTENT_PROVIDER_APPSETTINGS_JSON <<'EOF' || true
{
  "ApiUrls": "http://0.0.0.0:12024",
  "IdentityModule": {
    "DbFolderName": "IdentityDatabase",
    "DbFileName": "IdentityDatabase.db"
  },
  "PreparerModule": {
    "DbIdentityParentFolderSearchExpression": "/data/repos",
    "SettingsSearchExpr": "0(0,1)",
    "NoSqlRepoSearchPaths": [
      "/data/repos"
    ]
  }
}
EOF

# Writes CONTENT_PROVIDER_APPSETTINGS_JSON to the runtime path that
# docker-compose.qnap.yml bind-mounts read-only into the container at
# /app/appsettings.json. Call before `docker compose up` — never docker cp
# into an already-running container (see 03_begin.sh).
write_content_provider_appsettings() {
  local output_file="$REPO_ROOT/.runtime/$ENV_NAME/content-provider/appsettings.json"
  mkdir -p "$(dirname "$output_file")"
  printf '%s\n' "$CONTENT_PROVIDER_APPSETTINGS_JSON" > "$output_file"
}
