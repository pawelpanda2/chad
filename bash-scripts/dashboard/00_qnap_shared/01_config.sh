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
# secret, so the full file lives here as text. /data/repos and /data/repos2
# are the in-container mount points for CP_REPOS_HOST_PATH/CP_REPOS_HOST_PATH_2
# (see docker-compose.qnap.shared.yml), not real host paths — the real host
# paths live in .env.qnap, not here.
#
# Story 68 (corrected 2026-07-17): the real QNAP Dropbox mount
# (/share/Dropbox, a symlink to /share/CACHEDEV1_DATA/Dropbox) contains two
# separate account subfolders, "pawelpanda2" (36 repos) and "kamilgame042"
# (4 repos, including chad_admin's login repo and the shared repo
# 21d11bdc-... used by leads/reports/beeper) — confirmed via a live SSH
# check, 2026-07-17. There is no bare "/share/Dropbox/repos" and no
# "/shared/..." path on this QNAP — an earlier draft of this fix assumed
# "/shared/Dropbox/..." without verifying against the real filesystem; that
# path does not exist. GuidGroupsHelper.GetGuidGroupsForSearchFolders no
# longer appends "repos" automatically, so both entries below need it
# explicit, matching the 03_local_mac_docker/01_config.sh convention exactly
# (CP_REPOS_HOST_PATH/_2 are each the ACCOUNT root, i.e. the parent of that
# account's own "repos" folder, not the repos folder itself).
#
# IMPORTANT — this fixes a live, latent crash-loop risk: the running
# chad-content-provider-api container currently reports repoCount:38 from an
# in-memory scan cached at its last startup, from BEFORE the Dropbox was
# reorganized into these two account subfolders. The single old search path
# ("/data/repos" -> old bare /share/Dropbox/repos, which no longer exists)
# would make the container crash-loop on its NEXT restart (QNAP reboot, OOM,
# `docker compose up` after this config lands) unless this fix is deployed
# first.
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
      "/data/repos/repos",
      "/data/repos2/repos"
    ]
  }
}
EOF

# Writes CONTENT_PROVIDER_APPSETTINGS_JSON to the runtime path that
# docker-compose.qnap.shared.yml bind-mounts read-only into the container
# at /app/appsettings.json. Call before `docker compose up` — never docker
# cp into an already-running container (see 03_restart.sh).
write_content_provider_appsettings() {
  local output_file="$REPO_ROOT/.runtime/$ENV_NAME/content-provider/appsettings.json"
  mkdir -p "$(dirname "$output_file")"
  printf '%s\n' "$CONTENT_PROVIDER_APPSETTINGS_JSON" > "$output_file"
}
