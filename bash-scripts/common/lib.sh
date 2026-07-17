#!/usr/bin/env bash
# Shared helpers for bash-scripts/*. Source this, don't execute it directly:
#   source "$REPO_ROOT/bash-scripts/common/lib.sh"
#
# Every caller is expected to have already computed REPO_ROOT itself via the
# standard pattern (see any script in bash-scripts/dashboard/ for the
# canonical form) — this file only provides utility functions, not path
# resolution, since resolving REPO_ROOT is what lets a script find this file
# in the first place.

# Colors (no-op if not a tty, so logs stay clean when piped/redirected)
if [ -t 1 ]; then
  C_RED='\033[0;31m'
  C_GREEN='\033[0;32m'
  C_YELLOW='\033[0;33m'
  C_BLUE='\033[0;34m'
  C_RESET='\033[0m'
else
  C_RED=''; C_GREEN=''; C_YELLOW=''; C_BLUE=''; C_RESET=''
fi

log_info()  { printf "${C_BLUE}[info]${C_RESET} %s\n" "$*"; }
log_ok()    { printf "${C_GREEN}[ok]${C_RESET} %s\n" "$*"; }
log_warn()  { printf "${C_YELLOW}[warn]${C_RESET} %s\n" "$*" >&2; }
log_error() { printf "${C_RED}[error]${C_RESET} %s\n" "$*" >&2; }

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Usage: port_in_use 12080  -> exit 0 (in use) or 1 (free)
port_in_use() {
  local port="$1"
  lsof -i ":$port" -sTCP:LISTEN >/dev/null 2>&1
}

# Usage: require_command tmux "brew install tmux"
require_command() {
  local cmd="$1" hint="$2"
  if ! command_exists "$cmd"; then
    log_error "Required command not found: $cmd"
    log_error "  Fix: $hint"
    return 1
  fi
  return 0
}

# Usage: require_file /path/to/.env "cp .env.example .env and fill it in"
require_file() {
  local path="$1" hint="$2"
  if [ ! -f "$path" ]; then
    log_error "Required file missing: $path"
    log_error "  Fix: $hint"
    return 1
  fi
  return 0
}

# Usage: find_docker_container_by_port 12020  -> prints container ID (empty if none)
# Matches only containers that PUBLISH this exact host port — never a broad
# scan of all containers.
find_docker_container_by_port() {
  local port="$1"
  docker ps --filter "publish=$port" --format '{{.ID}}' 2>/dev/null | head -n1
}

# Usage: stop_docker_container_using_port 12020
# Stops and removes ONLY the single container publishing this exact port
# (never docker rm -f $(docker ps -aq), never docker system prune). Safe to
# call when nothing is using the port — it's then a no-op.
stop_docker_container_using_port() {
  local port="$1"
  local container_id
  container_id="$(find_docker_container_by_port "$port")"
  if [ -z "$container_id" ]; then
    return 0
  fi
  local container_name
  container_name="$(docker inspect -f '{{.Name}}' "$container_id" 2>/dev/null | sed 's#^/##')"
  log_warn "Port $port is in use by Docker container '${container_name:-unknown}' (ID: $container_id) — stopping and removing it."
  docker stop "$container_id" >/dev/null
  docker rm "$container_id" >/dev/null 2>&1 || true
  log_ok "Stopped and removed container '${container_name:-unknown}' (ID: $container_id) (was using port $port)."
}

# Usage: ensure_port_available 12020 || exit 1
# If a Docker container publishes the port, stops+removes ONLY that
# container and returns 0. Otherwise falls back to lsof to check for a
# non-Docker process; if found, prints its PID/name and returns 1 — never
# kills an arbitrary system process automatically. If neither finds
# anything, the port is free — returns 0.
#
# Docker is checked FIRST, before lsof, deliberately: `docker ps --filter
# publish=<port>` is authoritative regardless of platform, but `lsof -i`
# is NOT — confirmed on QNAP (Linux) that lsof reports a Docker-published
# port as free even while `docker ps --filter publish=` correctly finds
# the container holding it (real failure during the first QNAP TEST
# deploy: the old lsof-first check silently reported every port free,
# skipping cleanup, and `docker compose up` then failed with "port is
# already allocated"). Checking Docker first works on both platforms.
# Usage: ensure_docker_network chad-shared
# Creates the named Docker network only if it doesn't already exist
# (idempotent). Never recreates/touches an existing network.
ensure_docker_network() {
  local network="$1"
  if docker network inspect "$network" >/dev/null 2>&1; then
    return 0
  fi
  log_info "Creating Docker network '$network' (doesn't exist yet)."
  docker network create "$network" >/dev/null
  log_ok "Created Docker network '$network'."
}

# Usage: require_shared_services_healthy 12024
# Preflight for TEST/PROD dashboard restart scripts: refuses to proceed
# unless the shared chad-mongodb + chad-content-provider-api stack (started
# separately by bash-scripts/dashboard/00_qnap_shared/03_restart.sh) is
# already up and healthy. Never starts/restarts shared services itself —
# only reads state.
require_shared_services_healthy() {
  local cp_port="$1"

  if ! docker network inspect chad-shared >/dev/null 2>&1; then
    log_error "Docker network 'chad-shared' does not exist."
    log_error "  Fix: bash bash-scripts/dashboard/00_qnap_shared/03_restart.sh (start shared services first)."
    return 1
  fi

  local mongo_state
  mongo_state="$(docker inspect -f '{{.State.Health.Status}}' chad-mongodb 2>/dev/null || true)"
  if [ "$mongo_state" != "healthy" ]; then
    log_error "Shared chad-mongodb container is not running/healthy (state: ${mongo_state:-not found})."
    log_error "  Fix: bash bash-scripts/dashboard/00_qnap_shared/03_restart.sh"
    return 1
  fi

  if ! docker ps --filter "name=^chad-content-provider-api$" --filter "status=running" --format '{{.Names}}' | grep -qx "chad-content-provider-api"; then
    log_error "Shared chad-content-provider-api container is not running."
    log_error "  Fix: bash bash-scripts/dashboard/00_qnap_shared/03_restart.sh"
    return 1
  fi

  if ! curl -fsS -m 3 "http://localhost:$cp_port/health" >/dev/null 2>&1; then
    log_error "Shared content-provider-api did not respond on port $cp_port."
    log_error "  Fix: bash bash-scripts/dashboard/00_qnap_shared/05_status.sh (diagnose shared stack)."
    return 1
  fi

  return 0
}

# Usage: kill_process_on_port 12080
# For "end"/cleanup scripts (and 03_local_mac_docker/01_port_kill.sh, the CLI
# wrapper around this one function — see that file, don't reimplement this
# logic there) — where, unlike ensure_port_available's startup preflight,
# the caller genuinely wants the port free, not just a report. Docker-first
# (same reasoning as ensure_port_available: authoritative on both
# platforms): if a container publishes this port, stops+removes ONLY that
# container. Otherwise sends SIGTERM to the PID(s) found by `lsof -ti :port`
# (targeted by port, never a broad pkill/killall/kill-by-name), waits, then
# SIGKILL if still alive. No-op if the port is already free.
kill_process_on_port() {
  local port="$1"
  local container_id
  container_id="$(find_docker_container_by_port "$port")"
  if [ -n "$container_id" ]; then
    stop_docker_container_using_port "$port"
    return 0
  fi

  if ! port_in_use "$port"; then
    log_ok "Port $port is free."
    return 0
  fi

  local pids
  pids="$(lsof -ti ":$port" 2>/dev/null)"
  if [ -z "$pids" ]; then
    return 0
  fi

  local pid pname
  for pid in $pids; do
    pname="$(ps -p "$pid" -o comm= 2>/dev/null | sed 's#.*/##')"
    log_info "Port $port is in use by process '${pname:-unknown}' (PID $pid)."
  done

  log_warn "Sending SIGTERM to PID(s): $pids"
  kill $pids 2>/dev/null || true
  sleep 1

  if port_in_use "$port"; then
    log_warn "Still running after SIGTERM — sending SIGKILL to PID(s): $pids"
    kill -9 $pids 2>/dev/null || true
    sleep 1
  fi

  if port_in_use "$port"; then
    log_error "Port $port is still in use after kill attempt."
    return 1
  fi
  log_ok "Port $port is now free."
}

ensure_port_available() {
  local port="$1"
  local container_id
  container_id="$(find_docker_container_by_port "$port")"
  if [ -n "$container_id" ]; then
    stop_docker_container_using_port "$port"
    if [ -n "$(find_docker_container_by_port "$port")" ]; then
      log_error "Port $port is still published by a Docker container after attempting cleanup."
      return 1
    fi
    return 0
  fi

  if ! port_in_use "$port"; then
    return 0
  fi

  local proc_line
  proc_line="$(lsof -i ":$port" -sTCP:LISTEN -n -P 2>/dev/null | awk 'NR==2 {print $1, $2}')"
  log_error "Port $port is in use by a non-Docker process: ${proc_line:-unknown}"
  log_error "  Not killing it automatically — stop it yourself, then re-run."
  return 1
}

# ============================================================================
# Release-tag mechanism for CHAD's own images (chad-dashboard,
# chad-content-provider-api). Own images never use `:latest` — every build
# writes ONE canonical, gitignored tag-record file; every restart/deploy script
# reads that same file and fails loudly if it's missing, instead of silently
# defaulting to `:latest`. Full standard:
# documentation/ai-docs/deploy/image-tagging-standard.md
# ============================================================================

# Canonical per-image tag-record file paths. Callers must have REPO_ROOT set
# (same requirement as the rest of this file).
dashboard_image_tag_file() { echo "$REPO_ROOT/.image-tag.chad-dashboard.env"; }
content_provider_image_tag_file() { echo "$REPO_ROOT/.image-tag.chad-content-provider-api.env"; }

# Usage: write_image_tag "$(dashboard_image_tag_file)" "$IMAGE_TAG"
# Persists a release tag to disk. Call this as the LAST step of a build
# script, after `docker compose build` has already returned 0 (under
# `set -e`, a failed build never reaches this line) — so a tag is only ever
# recorded for an image that actually built successfully. Atomic write (temp
# file + mv) so a concurrent reader never sees a half-written file.
write_image_tag() {
  local tag_file="$1" tag_value="$2"
  local tmp_file
  tmp_file="${tag_file}.tmp.$$"
  printf 'IMAGE_TAG=%s\n' "$tag_value" > "$tmp_file"
  mv "$tmp_file" "$tag_file"
  log_ok "Release tag recorded: $tag_value -> $(basename "$tag_file")"
}

# Usage: require_image_tag "$(dashboard_image_tag_file)" "chad-dashboard" || exit 1
# Reads and exports IMAGE_TAG from the given canonical tag-record file for use
# by `docker compose ... up`. Fails with a clear, actionable error if the file
# is missing or empty — NEVER falls back to `:latest`. TEST and PROD read the
# exact same tag-record file for chad-dashboard, so running the build ONCE
# (from either environment) and then `restart` in both is how a release is
# promoted without a second build.
require_image_tag() {
  local tag_file="$1" image_label="${2:-image}"
  if [ ! -f "$tag_file" ]; then
    log_error "No release tag recorded for $image_label."
    log_error "  Missing: $tag_file"
    log_error "  Fix: run the build script for $image_label first (see documentation/ai-docs/deploy/image-tagging-standard.md)."
    return 1
  fi
  # shellcheck disable=SC1090
  source "$tag_file"
  if [ -z "${IMAGE_TAG:-}" ]; then
    log_error "$tag_file exists but IMAGE_TAG is empty."
    log_error "  Fix: rebuild $image_label so a valid tag is recorded."
    return 1
  fi
  export IMAGE_TAG
  log_info "Using $image_label release tag: $IMAGE_TAG"
  return 0
}

# Usage: export IMAGE_TAG="$(image_tag_for_readonly "$(dashboard_image_tag_file)")"
# For status/end scripts: `docker compose ps`/`down` still need the compose
# file's `image:` field to interpolate successfully, but — unlike
# `up`/`build` — don't need the image to exist or be correct (`ps` and `down`
# never pull/run it). Returns the recorded tag if present, otherwise the
# harmless placeholder "none" so `docker compose` doesn't hard-fail on a
# stack that was never built/deployed. `require_image_tag` (used by
# build/restart) is what actually enforces a real, valid tag.
image_tag_for_readonly() {
  local tag_file="$1"
  if [ -f "$tag_file" ]; then
    # shellcheck disable=SC1090
    source "$tag_file"
    if [ -n "${IMAGE_TAG:-}" ]; then
      echo "$IMAGE_TAG"
      return 0
    fi
  fi
  echo "none"
}

# Usage: value="$(read_env_var "$ENV_FILE" QNAP_CONTAINER_DATA_PATH)"
# Minimal .env-style parser (KEY=value, ignores comments/blank lines, strips
# surrounding quotes). Prints an empty string if the file or key is missing —
# never errors, so callers decide what "unset" means.
read_env_var() {
  local env_file="$1" key="$2"
  [ -f "$env_file" ] || return 0
  awk -F'=' -v k="$key" '
    /^[[:space:]]*#/ { next }
    /^[[:space:]]*$/ { next }
    {
      ek = $1; gsub(/^[[:space:]]+|[[:space:]]+$/, "", ek)
      if (ek != k) next
      v = substr($0, index($0, "=") + 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", v)
      gsub(/^"|"$/, "", v)
      print v
      exit
    }
  ' "$env_file"
}

# Usage: require_data_path_writable /share/CACHEDEV1_DATA/ContainerData/chad-shared/mongodb [min_free_kb]
# Creates the directory if missing, verifies it's writable, and verifies the
# underlying filesystem has at least min_free_kb free (default 1,048,576 KB =
# 1GB). This is a tripwire for the QNAP_CONTAINER_DATA_PATH-on-tmpfs class of
# bug (see documentation/ai-docs/deploy/qnap-data-path.md): a 16MB tmpfs looks
# like a perfectly normal, writable directory right up until MongoDB's
# WiredTiger journal fills it and the container crash-loops with "No space
# left on device". Also WARNS (does not fail) when the path resolves onto a
# tmpfs filesystem at all, since that's the exact failure signature even when
# free space happens to be temporarily above the floor. Not a capacity
# planner — just a floor that catches an obviously-misconfigured path.
require_data_path_writable() {
  local path="$1" min_free_kb="${2:-1048576}"

  mkdir -p "$path" || {
    log_error "Cannot create data directory: $path"
    return 1
  }

  local test_file="$path/.write-test.$$"
  if ! touch "$test_file" 2>/dev/null; then
    log_error "Data directory is not writable: $path"
    return 1
  fi
  rm -f "$test_file"

  local avail_kb
  avail_kb="$(df -Pk "$path" 2>/dev/null | awk 'NR==2 {print $4}')"
  if [ -z "$avail_kb" ]; then
    log_warn "Could not determine free space for: $path (df failed) — continuing."
  elif [ "$avail_kb" -lt "$min_free_kb" ]; then
    log_error "Data path has too little free space: $path"
    log_error "  Available: ${avail_kb}KB, required at least: ${min_free_kb}KB."
    log_error "  This is the exact signature of QNAP_CONTAINER_DATA_PATH pointing at a"
    log_error "  small tmpfs instead of the real data volume."
    log_error "  Fix: see documentation/ai-docs/deploy/qnap-data-path.md"
    return 1
  fi

  if df -PT "$path" >/dev/null 2>&1; then
    local fstype
    fstype="$(df -PT "$path" 2>/dev/null | awk 'NR==2 {print $2}')"
    if [ "$fstype" = "tmpfs" ]; then
      log_warn "Data path '$path' is on a tmpfs filesystem — contents will not"
      log_warn "  survive a reboot/container recreate, and tmpfs is often tiny."
      log_warn "  Verify QNAP_CONTAINER_DATA_PATH in .env.qnap is intentional."
    fi
  fi

  return 0
}

# ============================================================================
# SSH / QNAP-remote-deploy helpers (Story 63). Used ONLY by
# bash-scripts/dashboard/06_qnap_test_ssh/*.sh and
# bash-scripts/dashboard/07_qnap_prod_ssh/*.sh — moved here from the old,
# now-deleted bash-scripts/dashboard/06_qnap_ssh/lib.sh so both directories
# share one library instead of duplicating it (per explicit decision: no
# common_ssh/lib.sh, no per-directory lib.sh). Nothing else in the repo needs
# to call these. Callers must have REPO_ROOT set (same requirement as the
# rest of this file) before calling load_qnap_ssh_config.
# ============================================================================

# Usage: value="$(qnap_config_value KEY "$env_file" "default")"
# A shell-env-var override (if already exported) wins over the file value,
# which wins over the given default. Reuses read_env_var (above) for the
# actual file parsing — not a second .env parser.
qnap_config_value() {
  local key="$1" env_file="$2" default_value="${3:-}"
  local value="${!key:-}"
  if [ -n "$value" ]; then echo "$value"; return 0; fi
  value="$(read_env_var "$env_file" "$key")"
  if [ -n "$value" ]; then echo "$value"; return 0; fi
  echo "$default_value"
}

# Usage: load_qnap_ssh_config   (requires REPO_ROOT already set)
# Sets/exports QNAP_SSH_HOST, QNAP_SSH_PORT, QNAP_SSH_USERNAME,
# QNAP_REPO_DIR, QNAP_SSH_PASSWORD, SSH_TARGET, SSH_OPTS from
# $REPO_ROOT/.env.qnap (repo root, gitignored) — never hardcode these in a
# calling script. Returns 1 (with a clear fix-it message) if the file or any
# required value is missing.
load_qnap_ssh_config() {
  QNAP_ENV_FILE="$REPO_ROOT/.env.qnap"
  require_file "$QNAP_ENV_FILE" "cp .env.qnap.example .env.qnap and fill in real values" || return 1

  QNAP_SSH_HOST="$(qnap_config_value QNAP_SSH_HOST "$QNAP_ENV_FILE")"
  QNAP_SSH_PORT="$(qnap_config_value QNAP_SSH_PORT "$QNAP_ENV_FILE" 22)"
  QNAP_SSH_USERNAME="$(qnap_config_value QNAP_SSH_USERNAME "$QNAP_ENV_FILE")"
  QNAP_REPO_DIR="$(qnap_config_value QNAP_REPO_DIR "$QNAP_ENV_FILE")"
  QNAP_SSH_PASSWORD="$(qnap_config_value QNAP_SSH_PASSWORD "$QNAP_ENV_FILE")"

  local pair key value
  for pair in "QNAP_SSH_HOST:$QNAP_SSH_HOST" "QNAP_SSH_USERNAME:$QNAP_SSH_USERNAME" "QNAP_REPO_DIR:$QNAP_REPO_DIR"; do
    key="${pair%%:*}"; value="${pair#*:}"
    if [ -z "$value" ]; then
      log_error "Missing config: $key"
      log_error "  Set it in $QNAP_ENV_FILE"
      return 1
    fi
  done

  SSH_TARGET="${QNAP_SSH_USERNAME}@${QNAP_SSH_HOST}"

  # ConnectTimeout/ServerAlive*: bound how long a stuck/dropped connection can
  # hang. StrictHostKeyChecking=accept-new: auto-trust a NEW host key (single
  # known Tailscale-only host) without prompting, but still reject a CHANGED
  # key — safe for non-interactive automation.
  #
  # ServerAliveInterval=10/ServerAliveCountMax=12 (120s tolerance) — raised
  # from 5/3 (15s) after a real incident (Story 66): a long `next build` on
  # the QNAP left the host too CPU/scheduling-starved to answer even
  # protocol-level keepalive probes in time, and the client gave up with
  # OpenSSH's own "Timeout, server <host> not responding." mid-deploy, with
  # no way to tell afterward whether the remote build/restart had actually
  # succeeded. 120s is still short enough to catch a genuinely dead
  # connection quickly for fast ops (restart/end/status/logs). For the one
  # operation that's genuinely long-running and silent for minutes at a
  # time (the TEST build, inside 06_deploy.sh) — see
  # run_remote_job_with_progress() below instead of relying on any timeout
  # value here being "big enough."
  SSH_OPTS=(-o ConnectTimeout=10 -o ServerAliveInterval=10 -o ServerAliveCountMax=12 -o StrictHostKeyChecking=accept-new)

  export QNAP_SSH_HOST QNAP_SSH_PORT QNAP_SSH_USERNAME QNAP_REPO_DIR QNAP_SSH_PASSWORD SSH_TARGET
}

# Runs one remote command over SSH, streaming output live. Password (if set)
# via sshpass > expect > plain ssh (interactive prompt) fallback.
#
# No `-tt` (forced pseudo-TTY): confirmed by real reproduction (2026-07-13)
# that `-tt` through sshpass in a non-interactive tool environment can hang
# indefinitely after the remote command finishes — the PTY never signals
# close, so the local ssh process just sits there. Plain ssh (no -t at all)
# still streams output live for a human watching a real terminal; it just
# doesn't force PTY allocation when stdin isn't one, which is exactly the
# safe behavior here.
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
spawn ssh -o ConnectTimeout=10 -o ServerAliveInterval=10 -o ServerAliveCountMax=12 -o StrictHostKeyChecking=accept-new -p $QNAP_SSH_PORT $SSH_TARGET "bash -lc $(printf '%q' "$remote_cmd")"
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

# Usage: output="$(run_remote_capture "some read-only remote command")"
# Like run_remote, but captures stdout instead of streaming to the terminal,
# and prints no label/echo of its own — for read-only checks that need the
# actual output (e.g. remote_repo_head, 06_last_from_test.sh's image
# lookups). Only supports the sshpass and plain-ssh (key-based) auth paths
# cleanly — if password auth falls all the way back to `expect`, this
# returns empty (expect's interactive prompt-answering doesn't cleanly
# separate from the command's own stdout); callers must treat an empty
# result as "couldn't determine," never as a real answer.
run_remote_capture() {
  local remote_cmd="$1"
  if [ -n "$QNAP_SSH_PASSWORD" ] && command_exists sshpass; then
    SSHPASS="$QNAP_SSH_PASSWORD" sshpass -e ssh "${SSH_OPTS[@]}" -p "$QNAP_SSH_PORT" "$SSH_TARGET" "bash -lc $(printf '%q' "$remote_cmd")" 2>/dev/null
  elif [ -z "$QNAP_SSH_PASSWORD" ]; then
    ssh "${SSH_OPTS[@]}" -p "$QNAP_SSH_PORT" "$SSH_TARGET" "bash -lc $(printf '%q' "$remote_cmd")" 2>/dev/null
  fi
}

# Runs one of the real 04_qnap_test/05_qnap_prod/00_qnap_shared scripts on
# the QNAP host — never duplicates their logic, just: cd to the repo, pull
# latest, run it.
run_remote_script() {
  local env_dir="$1" script_name="$2" label="$3"
  run_remote "Update repo on QNAP" "cd '$QNAP_REPO_DIR' && git pull --ff-only"
  run_remote "$label" "cd '$QNAP_REPO_DIR' && bash bash-scripts/dashboard/${env_dir}/${script_name}"
}

# ============================================================================
# Detached remote job + polling (Story 66). For long-running remote
# operations — today, only the TEST build inside 06_qnap_test_ssh/06_deploy.sh
# — that must survive the LOCAL ssh connection dropping, whether from a real
# network blip or from the remote host being too resource-starved under load
# to answer SSH keepalives within any tolerance we pick (see the real
# incident this fixes: a long, silent `next build` phase left the QNAP host
# unable to answer keepalives in time, and the client gave up with OpenSSH's
# own "Timeout, server <host> not responding.", with no way afterward to
# tell whether the remote build/restart had actually succeeded).
#
# The fix is architectural, not just a bigger timeout: the remote command
# runs detached (nohup, disowned, no controlling terminal) so it keeps
# running independent of any one ssh session's lifetime, and the local side
# reconnects periodically (short-lived, low-risk polls) to report progress
# and detect completion — a poll attempt itself failing to connect is
# treated as "still running, retry," never as the job having failed. Only
# the remote-recorded exit code decides success/failure.
# ============================================================================

# Usage: JOBID="$(remote_job_start "cd '$QNAP_REPO_DIR' && ...")"
# Starts remote_cmd detached on the QNAP host under
# $QNAP_REPO_DIR/.runtime/remote-jobs/. Prints the job ID (empty if the
# start itself couldn't connect).
#
# remote_cmd is base64-encoded before being embedded in the outer heredoc —
# NOT passed through as literal text inside a nested `bash -c '...'`. An
# earlier version of this function did the latter and broke the instant
# remote_cmd contained its own single quotes (which it always does in the
# one real call site, `cd '$QNAP_REPO_DIR' && ...` — caught by testing
# against a mocked run_remote_capture before this ever touched the real
# QNAP, see backlog/stories/66/06_others_from_report.md). Base64 makes the
# encoded payload pure `[A-Za-z0-9+/=]` text, safe to splice into the
# heredoc with zero quoting concerns regardless of what remote_cmd contains.
remote_job_start() {
  local user_cmd="$1"
  local encoded
  encoded="$(printf '%s' "$user_cmd" | base64 | tr -d '\n')"
  local remote_cmd
  remote_cmd=$(cat <<EOF
mkdir -p "\$QNAP_REPO_DIR/.runtime/remote-jobs"
JOBID="\$(date +%s)-\$\$"
LOGFILE="\$QNAP_REPO_DIR/.runtime/remote-jobs/\${JOBID}.log"
DONEFILE="\$QNAP_REPO_DIR/.runtime/remote-jobs/\${JOBID}.done"
( echo "$encoded" | base64 -d | bash > "\$LOGFILE" 2>&1; echo \$? > "\$DONEFILE" ) < /dev/null &
disown
echo "\$JOBID"
EOF
)
  run_remote_capture "$remote_cmd"
}

# Usage: STATUS="$(remote_job_status "$JOBID")"  -> "RUNNING" or the exit code
# Empty output (e.g. this poll couldn't connect) is also normalized to
# "RUNNING" — a failed poll must never be mistaken for a failed job.
remote_job_status() {
  local jobid="$1"
  local out
  out="$(run_remote_capture "cat \"\$QNAP_REPO_DIR/.runtime/remote-jobs/${jobid}.done\" 2>/dev/null")"
  if [ -z "$out" ]; then
    echo "RUNNING"
  else
    echo "$out"
  fi
}

# Usage: remote_job_tail "$JOBID"  -> last ~4000 bytes of the job's remote log
# Deliberately a blunt "last N bytes" (not incremental byte-offset tailing)
# — some duplicate output between polls is a fine trade-off for not needing
# exact stream bookkeeping across independent, possibly-failed connections.
remote_job_tail() {
  local jobid="$1"
  run_remote_capture "tail -c 4000 \"\$QNAP_REPO_DIR/.runtime/remote-jobs/${jobid}.log\" 2>/dev/null"
}

# Usage: run_remote_job_with_progress "<label>" "<remote_cmd>" [poll_interval_seconds]
# Orchestrates start + poll-until-done. Returns 0/1 matching the remote
# command's own real exit code — never assumed from "the ssh call
# returned"/"the connection didn't error."
run_remote_job_with_progress() {
  local label="$1" remote_cmd="$2" poll_interval="${3:-15}"
  echo ""
  log_info "$label (running detached on the QNAP host — survives a dropped SSH connection)"

  local jobid
  jobid="$(remote_job_start "$remote_cmd")"
  if [ -z "$jobid" ]; then
    log_error "Could not start the remote job (no job ID returned) — check SSH connectivity to $QNAP_SSH_HOST."
    return 1
  fi
  log_info "Remote job ID: $jobid (log: \$QNAP_REPO_DIR/.runtime/remote-jobs/${jobid}.log on the QNAP host)"

  local status tail_out
  while true; do
    sleep "$poll_interval"
    status="$(remote_job_status "$jobid")"
    tail_out="$(remote_job_tail "$jobid")"
    if [ -n "$tail_out" ]; then
      echo "--- remote progress ($(date '+%H:%M:%S')) ---"
      echo "$tail_out"
    else
      log_info "(no output yet, or couldn't reach the QNAP host this poll — will retry)"
    fi

    if [ "$status" != "RUNNING" ]; then
      if [ "$status" = "0" ]; then
        log_ok "Done: $label (remote exit code 0)"
        return 0
      else
        log_error "$label failed on the QNAP host (remote exit code: $status)"
        return 1
      fi
    fi
  done
}

# ============================================================================
# Git preflight for SSH deploy (Story 63, originally specified as its own
# Story before being folded into this one — see backlog/stories/63/
# 03_knowledge.md). Applies ONLY to 06_qnap_test_ssh/06_deploy.sh — the one
# remaining operation that builds a new chad-dashboard image from current
# source. Never called from any *_restart.sh/status.sh/end.sh, and never
# from 07_qnap_prod_ssh/06_last_from_test.sh (PROD never builds from
# source).
# ============================================================================

# Usage: NON_INTERACTIVE=0 git_deploy_preflight   (requires REPO_ROOT and,
# for the no-new-commits check, load_qnap_ssh_config already called)
# Prevents deploying a stale revision: uncommitted local changes, unpushed
# commits, and a same-as-remote no-op deploy all get surfaced BEFORE any SSH
# connection is made for the real deploy. Returns 1 (aborts) on any check
# that isn't resolved — either automatically in --non-interactive mode, or
# because the user declined when asked interactively.
git_deploy_preflight() {
  local branch upstream ahead local_head remote_head

  branch="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)"
  if [ "$branch" = "HEAD" ]; then
    log_error "Repo jest w stanie detached HEAD — brak brancha, z którego można wypchnąć zmiany."
    log_error "  Przełącz się na branch przed deploymentem."
    return 1
  fi

  upstream="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)"
  if [ -z "$upstream" ]; then
    log_error "Branch '$branch' nie ma skonfigurowanego upstreamu."
    log_error "  Ustaw go (np. git push -u origin $branch) przed deploymentem."
    return 1
  fi

  log_info "Repo: $REPO_ROOT"
  log_info "Branch: $branch (upstream: $upstream)"

  if [ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]; then
    echo ""
    git -C "$REPO_ROOT" status --short
    echo ""
    log_warn "Niezacommitowane zmiany istnieją lokalnie — NIE trafią na QNAP."

    if [ "${NON_INTERACTIVE:-0}" = "1" ]; then
      log_error "Tryb --non-interactive: niezacommitowane zmiany = błąd. Przerwano."
      return 1
    fi

    local commit_confirm
    read -r -p "Czy chcesz teraz zacommitować te zmiany? [y/N] " commit_confirm
    if [ "$commit_confirm" != "y" ] && [ "$commit_confirm" != "Y" ]; then
      log_error "Deployment cancelled."
      return 1
    fi

    local commit_message
    read -r -p "Podaj treść commit message: " commit_message
    if [ -z "$commit_message" ]; then
      log_error "Pusty commit message. Przerwano."
      return 1
    fi

    if ! git -C "$REPO_ROOT" add -A; then
      log_error "'git add -A' nie powiodło się. Przerwano."
      return 1
    fi
    if ! git -C "$REPO_ROOT" commit -m "$commit_message"; then
      log_error "'git commit' nie powiodło się. Przerwano."
      return 1
    fi
    log_ok "Zacommitowano: $commit_message"
  fi

  ahead="$(git -C "$REPO_ROOT" rev-list --count "${upstream}..HEAD")"
  if [ "$ahead" -gt 0 ]; then
    log_warn "Lokalny branch jest $ahead commit(y) do przodu względem $upstream."

    if [ "${NON_INTERACTIVE:-0}" = "1" ]; then
      log_error "Tryb --non-interactive: brak push = błąd. Przerwano."
      return 1
    fi

    local push_confirm
    read -r -p "Czy wykonać git push przed deploymentem? [Y/n] " push_confirm
    if [ -z "$push_confirm" ] || [ "$push_confirm" = "y" ] || [ "$push_confirm" = "Y" ]; then
      if ! git -C "$REPO_ROOT" push; then
        log_error "'git push' nie powiodło się. Przerwano."
        return 1
      fi
      log_ok "Wypchnięto do $upstream."
    else
      log_error "Lokalne commity nie zostały wypchnięte — deployment przerwany (uruchomiłby starą wersję)."
      return 1
    fi
  fi

  # No-new-commits detection: compare local HEAD against what's actually
  # checked out on the QNAP host right now — one extra, read-only SSH call,
  # before the real deploy sequence. Requires load_qnap_ssh_config to already
  # have been called by the caller; if remote_repo_head can't determine the
  # remote commit (e.g. expect-only auth fallback), this check is skipped
  # rather than guessed.
  local_head="$(git -C "$REPO_ROOT" rev-parse HEAD)"
  remote_head="$(remote_repo_head)"
  if [ -n "$remote_head" ] && [ "$remote_head" = "$local_head" ]; then
    log_warn "Na zdalnym repozytorium nie ma nowych commitów. Deployment najprawdopodobniej wdroży identyczną wersję aplikacji."

    if [ "${NON_INTERACTIVE:-0}" = "1" ]; then
      log_info "Tryb --non-interactive: kontynuuję mimo braku nowych commitów (informacja, nie błąd)."
    else
      local continue_confirm
      read -r -p "Czy mimo to kontynuować deployment? [y/N] " continue_confirm
      if [ "$continue_confirm" != "y" ] && [ "$continue_confirm" != "Y" ]; then
        log_error "Deployment cancelled."
        return 1
      fi
    fi
  fi

  log_ok "Git preflight passed."
}

# Usage: remote_repo_head   (requires load_qnap_ssh_config already called)
# Reads the commit currently checked out in $QNAP_REPO_DIR on the QNAP host
# — read-only, no git pull. Empty output means "couldn't determine," not
# "no commits" — callers must treat it as inconclusive, never as a match.
remote_repo_head() {
  run_remote_capture "cd '$QNAP_REPO_DIR' && git rev-parse HEAD"
}
