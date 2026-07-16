#!/usr/bin/env bash
# Non-secret technical constants for the local-mac-docker stack. Sourced by
# every other script in this directory (after REPO_ROOT is already set by
# the sourcing script). Secrets/paths (API keys, Mongo credentials,
# CP_REPOS_HOST_PATH, ...) come from root .env.local, loaded separately by
# each script — never put those here.
#
# Docker Compose interpolates the WHOLE compose file for every command,
# including `build` — so every script in this directory must source this
# file and export these before invoking `docker compose`, not just the
# scripts that obviously need the ports (confirmed by a real failure on
# QNAP: 01_build.sh alone exporting ENV_NAME but not the ports produced
# "variable is not set" warnings during `docker compose ... build`).

COMPOSE_PROJECT_NAME="chad-local"
COMPOSE_FILE="$REPO_ROOT/docker-compose.local.yml"
ENV_FILE="$REPO_ROOT/.env.local"

DASHBOARD_PORT=12020
CONTENT_PROVIDER_API_PORT=12024
MONGODB_PORT=27017

export DASHBOARD_PORT CONTENT_PROVIDER_API_PORT MONGODB_PORT

# Content Provider's own config module (appsettings.json) — not a secret,
# so the full file lives here as text rather than split into individual
# PreparerModule__* environment variable overrides. /data/repos is the
# in-container mount point for CP_REPOS_HOST_PATH (see docker-compose.local.yml),
# not a real host path — the real host path lives in .env.local, not here.
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
# docker-compose.local.yml bind-mounts read-only into the container at
# /app/appsettings.json. Call before `docker compose up` — never docker cp
# into an already-running container (see 04_re-start.sh).
write_content_provider_appsettings() {
  local output_file="$REPO_ROOT/.runtime/local/content-provider/appsettings.json"
  mkdir -p "$(dirname "$output_file")"
  printf '%s\n' "$CONTENT_PROVIDER_APPSETTINGS_JSON" > "$output_file"
}
