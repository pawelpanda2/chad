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

# SSH options shared by every path below:
#   - ConnectTimeout/ServerAlive*: bound how long a stuck/dropped connection
#     can hang instead of failing (or, worse, sitting open indefinitely) —
#     see documentation/ai-docs/deploy/ for the incident this fixes.
#   - StrictHostKeyChecking=accept-new: auto-trust a NEW host key (this is a
#     single known Tailscale-only host) without prompting, but still reject a
#     CHANGED key (protects against a swapped/MITM host) — safe for
#     non-interactive automation.
SSH_OPTS=(-o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=3 -o StrictHostKeyChecking=accept-new)

# Runs one remote command over SSH. Password (if set) via sshpass > expect >
# plain ssh (interactive prompt) fallback — same order as the proven old
# script.
#
# No `-tt` (forced pseudo-TTY): confirmed by real reproduction (2026-07-13)
# that `-tt` through sshpass in this non-interactive tool environment can
# hang indefinitely after the remote command finishes — the PTY never
# signals close, so the local ssh process just sits there. Plain ssh (no -t
# at all) still streams output live for a human watching a real terminal;
# it just doesn't force PTY allocation when stdin isn't one, which is
# exactly the safe behavior here.
run_remote() {
  local label="$1" remote_cmd="$2"
  echo ""
  log_info "$label"
  echo "\$ $remote_cmd"

  if [ -n "$QNAP_SSH_PASSWORD" ] && command_exists sshpass; then
    SSHPASS="$QNAP_SSH_PASSWORD" sshpass -e ssh "${SSH_OPTS[@]}" -p "$QNAP_SSH_PORT" "$SSH_TARGET" "bash -lc $(printf '%q' "$remote_cmd")"
  elif [ -n "$QNAP_SSH_PASSWORD" ] && command_exists expect; then
    EXPECT_QNAP_PASSWORD="$QNAP_SSH_PASSWORD" expect <<EOF
set timeout 120
log_user 1
spawn ssh -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=3 -o StrictHostKeyChecking=accept-new -p $QNAP_SSH_PORT $SSH_TARGET "bash -lc $(printf '%q' "$remote_cmd")"
expect {
  -re {(?i)yes/no} { send -- "yes\r"; exp_continue }
  -re {(?i)password:} { send -- "$env(EXPECT_QNAP_PASSWORD)\r"; exp_continue }
  eof
}
catch wait result
exit [lindex \$result 3]
EOF
  else
    ssh "${SSH_OPTS[@]}" -p "$QNAP_SSH_PORT" "$SSH_TARGET" "bash -lc $(printf '%q' "$remote_cmd")"
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
