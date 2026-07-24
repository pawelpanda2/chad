#!/usr/bin/env bash
# Story 81 — run migrate-mongo-to-postgres.mjs ON the QNAP host via a
# short-lived node container on chad-shared (internal chad-mongodb /
# chad-postgres URIs). Used when the local Mac's .env.qnap POSTGRES_PASSWORD
# is out of sync with the live container's init password.
#
# Usage (from repo root, after `pnpm --filter dba build`):
#   bash .../09_story81_remote_migrate.sh (--repoGuid=<guid> | --all) [--apply]
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
load_qnap_ssh_config

REPO_GUID=""
APPLY=""
ALL=""
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY="--apply" ;;
    --all) ALL="--all" ;;
    --repoGuid=*) REPO_GUID="${arg#--repoGuid=}" ;;
    *) log_error "Unknown arg: $arg"; exit 1 ;;
  esac
done
if [ -z "$REPO_GUID" ] && [ -z "$ALL" ]; then
  log_error "Usage: $0 (--repoGuid=<guid> | --all) [--apply]"
  exit 1
fi
if [ -n "$REPO_GUID" ] && [ -n "$ALL" ]; then
  log_error "Pass either --repoGuid=... or --all, not both"
  exit 1
fi

SCOPE_ARG=""
if [ -n "$ALL" ]; then
  SCOPE_ARG="--all"
  SCOPE_LABEL="--all"
else
  SCOPE_ARG="--repoGuid='$REPO_GUID'"
  SCOPE_LABEL="repoGuid=$REPO_GUID"
fi

BUNDLE="$REPO_ROOT/.runtime/story81-migrate-bundle"
rm -rf "$BUNDLE"
mkdir -p "$BUNDLE/packages/dba/scripts"

log_info "Building dba dist..."
(cd "$REPO_ROOT" && pnpm --filter dba build >/dev/null)

cp -R "$REPO_ROOT/packages/dba/dist" "$BUNDLE/packages/dba/"
cp "$REPO_ROOT/packages/dba/scripts/migrate-mongo-to-postgres.mjs" "$BUNDLE/packages/dba/scripts/"

cat >"$BUNDLE/package.json" <<'EOF'
{"type":"module","dependencies":{"diff":"^7.0.0","dotenv":"^16.4.5","js-yaml":"^4.2.0","mongodb":"^7.1.1","pg":"^8.13.1"}}
EOF

log_info "Installing bundle deps..."
(cd "$BUNDLE" && npm install --omit=dev --silent 2>/dev/null)

REMOTE_DIR="$QNAP_REPO_DIR/.runtime/story81-migrate-bundle"
TAR="$REPO_ROOT/.runtime/story81-migrate-bundle.tgz"
tar czf "$TAR" -C "$REPO_ROOT/.runtime" story81-migrate-bundle

log_info "Uploading bundle to QNAP (ssh stdin pipe)..."
run_remote "Prepare remote bundle dir" "mkdir -p '$REMOTE_DIR' && rm -f '$REMOTE_DIR/bundle.tgz'"
if [ -n "$QNAP_SSH_PASSWORD" ] && command_exists sshpass; then
  SSHPASS="$QNAP_SSH_PASSWORD" sshpass -e ssh "${SSH_OPTS[@]}" -p "$QNAP_SSH_PORT" "$SSH_TARGET" \
    "cat > '$REMOTE_DIR/bundle.tgz'" <"$TAR"
else
  ssh "${SSH_OPTS[@]}" -p "$QNAP_SSH_PORT" "$SSH_TARGET" \
    "cat > '$REMOTE_DIR/bundle.tgz'" <"$TAR"
fi
run_remote "Extract bundle" "cd '$REMOTE_DIR' && tar xzf bundle.tgz && rm bundle.tgz"

REMOTE_CMD="cd '$REMOTE_DIR/story81-migrate-bundle' && \
  QNAP_ENV='$QNAP_REPO_DIR/.env.qnap' && \
  MONGO_ROOT_USERNAME=\$(grep -E '^MONGO_ROOT_USERNAME=' \"\$QNAP_ENV\" | cut -d= -f2- | tr -d '\\\"' ) && \
  MONGO_ROOT_PASSWORD=\$(grep -E '^MONGO_ROOT_PASSWORD=' \"\$QNAP_ENV\" | cut -d= -f2- | tr -d '\\\"' ) && \
  POSTGRES_USER=\$(grep -E '^POSTGRES_USER=' \"\$QNAP_ENV\" | cut -d= -f2- | tr -d '\\\"' ) && \
  POSTGRES_PASSWORD=\$(grep -E '^POSTGRES_PASSWORD=' \"\$QNAP_ENV\" | cut -d= -f2- | tr -d '\\\"' ) && \
  POSTGRES_DB=\$(grep -E '^POSTGRES_DB=' \"\$QNAP_ENV\" | cut -d= -f2- | tr -d '\\\"' ) && \
  export MONGODB_URI=\"mongodb://\${MONGO_ROOT_USERNAME}:\${MONGO_ROOT_PASSWORD}@chad-mongodb:27017/chad?authSource=admin\" && \
  export POSTGRES_URI=\"postgres://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@chad-postgres:5432/\${POSTGRES_DB:-chad}\" && \
  docker run --rm --network chad-shared \
    -v '$REMOTE_DIR/story81-migrate-bundle:/work' -w /work/packages/dba \
    -e MONGODB_URI -e POSTGRES_URI \
    node:22-bookworm-slim \
    node scripts/migrate-mongo-to-postgres.mjs $SCOPE_ARG $APPLY"

log_info "Running migrate-mongo-to-postgres on QNAP ($SCOPE_LABEL, apply=${APPLY:-dry-run})..."
run_remote "Story81 remote migrate" "$REMOTE_CMD"

rm -f "$TAR"
log_ok "Remote migration finished."
