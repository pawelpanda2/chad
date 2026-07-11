#!/usr/bin/env bash
# Non-secret technical constants for the QNAP SHARED stack (mongo +
# content-provider-api, used by BOTH TEST and PROD dashboards). Sourced by
# every other script in this directory. Secrets/paths (SSH creds, Mongo
# credentials, CP_REPOS_HOST_PATH, ...) come from root .env.qnap, loaded
# separately by each script — never put those here.
#
# Docker Compose interpolates the WHOLE compose file for every command,
# including `build` — so every script in this directory must source this
# file and export these before invoking `docker compose` (see
# 04_qnap_test/01_config.sh for the confirmed real failure this avoids).

COMPOSE_PROJECT_NAME="chad-shared"
ENV_NAME="shared"
COMPOSE_FILE="$REPO_ROOT/docker-compose.qnap.shared.yml"
ENV_FILE="$REPO_ROOT/.env.qnap"

CONTENT_PROVIDER_API_PORT=12024

export ENV_NAME CONTENT_PROVIDER_API_PORT

# QNAP's Container Station sets HOME to a directory the SSH user often
# doesn't have write access to. Point DOCKER_CONFIG at a writable directory
# inside the repo instead of fighting Container Station's HOME.
DOCKER_CONFIG_DIR="$REPO_ROOT/.docker-qnap"
mkdir -p "$DOCKER_CONFIG_DIR"
export DOCKER_CONFIG="$DOCKER_CONFIG_DIR"

# Content Provider's own config module (appsettings.json) — identical
# across local-mac-docker/QNAP TEST/QNAP PROD/QNAP SHARED, since TEST and
# PROD now share this one Content Provider instance and data set. Not a
# secret, so the full file lives here as text. /data/repos is the
# in-container mount point for CP_REPOS_HOST_PATH (see
# docker-compose.qnap.shared.yml), not a real host path — the real host
# path (/share/Dropbox) lives in .env.qnap, not here.
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
# docker-compose.qnap.shared.yml bind-mounts read-only into the container
# at /app/appsettings.json. Call before `docker compose up` — never docker
# cp into an already-running container (see 03_begin.sh).
write_content_provider_appsettings() {
  local output_file="$REPO_ROOT/.runtime/$ENV_NAME/content-provider/appsettings.json"
  mkdir -p "$(dirname "$output_file")"
  printf '%s\n' "$CONTENT_PROVIDER_APPSETTINGS_JSON" > "$output_file"
}
