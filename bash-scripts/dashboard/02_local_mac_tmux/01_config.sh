#!/usr/bin/env bash
# Non-secret technical constants for the local-mac (non-Docker, tmux/pnpm)
# dev stack. Sourced by 03_re-start.sh and by
# bash-scripts/content-provider/run-content-provider-if-needed.sh (which is
# only ever invoked from this directory today).

CONTENT_PROVIDER_API_PORT=12024
# NIE "cp_api_csharp" — to jest nazwa kontenera legacy stacku
# (packages/net-content-provider/03_scripts/03_local-mac_docker/02_run_api_charp.sh,
# port 12004, dla Blazor). Ta sama nazwa kolidowała z tym kontenerem: gdy oba
# stacki były uruchamiane w różnym czasie, `docker rm -f "$NAME"` w
# run-content-provider-if-needed.sh kasował legacy kontener zamiast swojego
# (potwierdzone realnym incydentem 2026-07-12 — ubiło to Blazor). Nazwa
# poniżej zgodna z konwencją reszty tego stacku (chad-*-local-mac-*).
CONTENT_PROVIDER_API_CONTAINER_NAME="chad-content-provider-api-local-mac-tmux"
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
#
# NoSqlRepoSearchPaths must include the trailing "repos" segment itself
# (net-content-provider Story 68, 2026-07-17): GuidGroupsHelper.
# GetGuidGroupsForSearchFolders no longer appends "repos" automatically and
# now scans every configured path directly for GUID-named folders. The real
# GUID folders live under /Users/pawelfluder/Dropbox/repos/<guid>, so the
# search path must say that, not just /Users/pawelfluder/Dropbox.
#
# Second search root (Story 68, corrected 2026-07-17): the "kamilgame042"
# Dropbox account is mounted separately on this Mac at
# /Volumes/Dropbox/kamilgame042 — its own repos/ subfolder holds repos not
# present under the main /Users/pawelfluder/Dropbox account, including
# chad_admin (used by login) and the shared repo (21d11bdc-...) used by
# leads/reports/beeper. Confirmed on disk 2026-07-17 (`ls -ld`); an earlier
# `/Volume/...` (singular) value was a typo and does not exist. Needs its own
# `docker run -v` mount too — see run-content-provider-if-needed.sh.
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
      "/Users/pawelfluder/Dropbox/repos",
      "/Volumes/Dropbox/kamilgame042/repos"
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
