#!/usr/bin/env bash
# Shared SSH connection + remote-exec logic for the QNAP TEST/PROD wrappers
# in this directory. Source this, don't execute it directly.
#
# Host/user/port/repo-dir/password come from .env.qnap (repo root,
# gitignored) — NEVER hardcoded here. Adapted from the already-proven
# read_env_value/run_step pattern in the old
# packages/dashboard/03_scripts/nodejs/07_ssh_qnap/server_by_ssh_v3.sh
# (password via env var > sshpass > expect > plain ssh fallback).

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"

ENV_FILE="$REPO_ROOT/.env.qnap"
require_file "$ENV_FILE" "cp .env.qnap.example .env.qnap and fill in real values" || exit 1

read_env_value() {
  local key="$1"
  awk -F'=' -v key="$key" '
    /^[[:space:]]*#/ { next }
    /^[[:space:]]*$/ { next }
    {
      k = $1
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", k)
      if (k != key) next
      v = substr($0, index($0, "=") + 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", v)
      gsub(/^"|"$/, "", v)
      print v
      exit
    }
  ' "$ENV_FILE"
}

get_config_value() {
  local key="$1" default_value="${2:-}"
  local value="${!key:-}"
  if [ -n "$value" ]; then echo "$value"; return 0; fi
  value="$(read_env_value "$key")"
  if [ -n "$value" ]; then echo "$value"; return 0; fi
  echo "$default_value"
}

QNAP_SSH_HOST="$(get_config_value QNAP_SSH_HOST)"
QNAP_SSH_PORT="$(get_config_value QNAP_SSH_PORT 22)"
QNAP_SSH_USERNAME="$(get_config_value QNAP_SSH_USERNAME)"
QNAP_REPO_DIR="$(get_config_value QNAP_REPO_DIR)"
QNAP_SSH_PASSWORD="$(get_config_value QNAP_SSH_PASSWORD)"

for pair in "QNAP_SSH_HOST:$QNAP_SSH_HOST" "QNAP_SSH_USERNAME:$QNAP_SSH_USERNAME" "QNAP_REPO_DIR:$QNAP_REPO_DIR"; do
  key="${pair%%:*}"; value="${pair#*:}"
  if [ -z "$value" ]; then
    log_error "Missing config: $key"
    log_error "  Set it in $ENV_FILE"
    exit 1
  fi
done

SSH_TARGET="${QNAP_SSH_USERNAME}@${QNAP_SSH_HOST}"

# Runs one remote command over SSH, with a live pseudo-TTY so output streams
# as it happens. Password (if set) via sshpass > expect > plain ssh
# (interactive prompt) fallback — same order as the proven old script.
run_remote() {
  local label="$1" remote_cmd="$2"
  echo ""
  log_info "$label"
  echo "\$ $remote_cmd"

  if [ -n "$QNAP_SSH_PASSWORD" ] && command_exists sshpass; then
    SSHPASS="$QNAP_SSH_PASSWORD" sshpass -e ssh -tt -p "$QNAP_SSH_PORT" "$SSH_TARGET" "bash -lc $(printf '%q' "$remote_cmd")"
  elif [ -n "$QNAP_SSH_PASSWORD" ] && command_exists expect; then
    EXPECT_QNAP_PASSWORD="$QNAP_SSH_PASSWORD" expect <<EOF
set timeout -1
log_user 1
spawn ssh -tt -p $QNAP_SSH_PORT $SSH_TARGET "bash -lc $(printf '%q' "$remote_cmd")"
expect {
  -re {(?i)yes/no} { send -- "yes\r"; exp_continue }
  -re {(?i)password:} { send -- "$env(EXPECT_QNAP_PASSWORD)\r"; exp_continue }
  eof
}
catch wait result
exit [lindex \$result 3]
EOF
  else
    ssh -tt -p "$QNAP_SSH_PORT" "$SSH_TARGET" "bash -lc $(printf '%q' "$remote_cmd")"
  fi

  log_ok "Done: $label"
}

# Runs one of the real 04_qnap_test/05_qnap_prod scripts on the QNAP host —
# never duplicates their logic, just: cd to the repo, pull latest, run it.
run_remote_script() {
  local env_dir="$1" script_name="$2" label="$3"
  run_remote "Update repo on QNAP" "cd '$QNAP_REPO_DIR' && git pull --ff-only"
  run_remote "$label" "cd '$QNAP_REPO_DIR' && bash bash-scripts/dashboard/${env_dir}/${script_name}"
}
