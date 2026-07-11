#!/usr/bin/env bash
# Non-secret technical constants for the local-mac (non-Docker, tmux/pnpm)
# dev stack. Sourced by 02_start.sh and by
# bash-scripts/content-provider/run-content-provider-if-needed.sh (which is
# only ever invoked from this directory today).

CONTENT_PROVIDER_API_PORT=12024
CONTENT_PROVIDER_API_CONTAINER_NAME="cp_api_csharp"
CONTENT_PROVIDER_API_IMAGE="chad-content-provider-api:latest"

# Content Provider's own config module (appsettings.json) — not a secret,
# so the full file lives here as text rather than split into individual
# PreparerModule__* environment variable overrides. Unlike the Docker
# Compose environments, there's no container-internal remount here: the
# real host path is mounted at the SAME absolute path inside the container
# (see run-content-provider-if-needed.sh's `docker run -v`), so this points
# straight at the real Dropbox folder, matching the original proven config
# (packages/net-content-provider's own now-removed .env used the identical
# value for both keys below).
read -r -d '' CONTENT_PROVIDER_APPSETTINGS_JSON <<'EOF' || true
{
  "ApiUrls": "http://0.0.0.0:12024",
  "IdentityModule": {
    "DbFolderName": "IdentityDatabase",
    "DbFileName": "IdentityDatabase.db"
  },
  "PreparerModule": {
    "DbIdentityParentFolderSearchExpression": "/Users/pawelfluder/Dropbox",
    "SettingsSearchExpr": "0(0,1)",
    "NoSqlRepoSearchPaths": [
      "/Users/pawelfluder/Dropbox"
    ]
  }
}
EOF

# Writes CONTENT_PROVIDER_APPSETTINGS_JSON to the runtime path that
# run-content-provider-if-needed.sh bind-mounts read-only into the
# container at /app/appsettings.json. Call before `docker run` — never
# docker cp into an already-running container.
write_content_provider_appsettings() {
  local output_file="$REPO_ROOT/.runtime/local-mac/content-provider/appsettings.json"
  mkdir -p "$(dirname "$output_file")"
  printf '%s\n' "$CONTENT_PROVIDER_APPSETTINGS_JSON" > "$output_file"
}
