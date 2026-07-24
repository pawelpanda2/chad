#!/usr/bin/env bash
# Story 81 — run story81-qnap-postgres-smoke.mjs on QNAP via docker (internal URIs).
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
load_qnap_ssh_config

BUNDLE="$REPO_ROOT/.runtime/story81-smoke-bundle"
rm -rf "$BUNDLE"
mkdir -p "$BUNDLE/packages/dba/scripts"

log_info "Building dba dist..."
(cd "$REPO_ROOT" && pnpm --filter dba build >/dev/null)

cp -R "$REPO_ROOT/packages/dba/dist" "$BUNDLE/packages/dba/"
cp "$REPO_ROOT/packages/dba/scripts/story81-qnap-postgres-smoke.mjs" "$BUNDLE/packages/dba/scripts/"

cat >"$BUNDLE/package.json" <<'EOF'
{"type":"module","dependencies":{"diff":"^7.0.0","dotenv":"^16.4.5","js-yaml":"^4.2.0","mongodb":"^7.1.1","pg":"^8.13.1"}}
EOF
(cd "$BUNDLE" && npm install --omit=dev --silent 2>/dev/null)

REMOTE_DIR="$QNAP_REPO_DIR/.runtime/story81-smoke-bundle"
TAR="$REPO_ROOT/.runtime/story81-smoke-bundle.tgz"
tar czf "$TAR" -C "$REPO_ROOT/.runtime" story81-smoke-bundle

run_remote "Prepare smoke bundle dir" "mkdir -p '$REMOTE_DIR' && rm -f '$REMOTE_DIR/bundle.tgz'"
if [ -n "$QNAP_SSH_PASSWORD" ] && command_exists sshpass; then
  SSHPASS="$QNAP_SSH_PASSWORD" sshpass -e ssh "${SSH_OPTS[@]}" -p "$QNAP_SSH_PORT" "$SSH_TARGET" \
    "cat > '$REMOTE_DIR/bundle.tgz'" <"$TAR"
else
  ssh "${SSH_OPTS[@]}" -p "$QNAP_SSH_PORT" "$SSH_TARGET" \
    "cat > '$REMOTE_DIR/bundle.tgz'" <"$TAR"
fi
run_remote "Extract smoke bundle" "cd '$REMOTE_DIR' && tar xzf bundle.tgz && rm bundle.tgz"

REMOTE_CMD="cd '$REMOTE_DIR/story81-smoke-bundle' && \
  QNAP_ENV='$QNAP_REPO_DIR/.env.qnap' && \
  POSTGRES_USER=\$(grep -E '^POSTGRES_USER=' \"\$QNAP_ENV\" | cut -d= -f2- | tr -d '\\\"' ) && \
  POSTGRES_PASSWORD=\$(grep -E '^POSTGRES_PASSWORD=' \"\$QNAP_ENV\" | cut -d= -f2- | tr -d '\\\"' ) && \
  POSTGRES_DB=\$(grep -E '^POSTGRES_DB=' \"\$QNAP_ENV\" | cut -d= -f2- | tr -d '\\\"' ) && \
  export POSTGRES_URI=\"postgres://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@chad-postgres:5432/\${POSTGRES_DB:-chad}\" && \
  docker run --rm --network chad-shared \
    -v '$REMOTE_DIR/story81-smoke-bundle:/work' -w /work/packages/dba \
    -e POSTGRES_URI -e DBA_PRIMARY_BACKEND=postgres -e DBA_POSTGRES_ENABLED=true \
    -e DBA_MONGO_ENABLED=false -e DBA_CONTENT_PROVIDER_ENABLED=false \
    -e DBA_POSTGRES_REPO_ALLOWLIST=5a9c8b7d-6e5f-4a3b-2c1d-0e9f8a7b6c5d,0fc7da8d-3466-4964-a24c-dfc0d0fef87c \
    node:22-bookworm-slim \
    node scripts/story81-qnap-postgres-smoke.mjs"

log_info "Running Story 81 Postgres smoke on QNAP..."
run_remote "Story81 postgres smoke" "$REMOTE_CMD"
rm -f "$TAR"
log_ok "Smoke finished."
