#!/usr/bin/env bash
# Host-side cp_1 watchdog for local Mac Docker only (Story 118).
# Polls mount health + optional dashboard signal file under .runtime/cp1-repair/.
# On confirmed failure: repair mount → restart local stack via 03_re-start.sh →
# verify container bind. Lock + cooldown prevent restart loops.
#
# Inactive for TEST/PROD (those use /share/cp_1 on QNAP; this script exits
# unless Darwin + local compose project).
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
source "$SCRIPT_DIR/01_config.sh"

RUNTIME_DIR="$REPO_ROOT/.runtime/cp1-repair"
LOCK_FILE="$RUNTIME_DIR/lock"
LAST_RESTART_FILE="$RUNTIME_DIR/last-restart"
REQUEST_FILE="$RUNTIME_DIR/request"
STATUS_FILE="$RUNTIME_DIR/status.json"
LOG_FILE="${CP1_WATCHDOG_LOG:-/tmp/chad-cp1-watchdog.log}"

POLL_SEC="${CP1_WATCHDOG_POLL_SEC:-20}"
COOLDOWN_SEC="${CP1_WATCHDOG_COOLDOWN_SEC:-180}"
CONFIRM_SEC="${CP1_WATCHDOG_CONFIRM_SEC:-8}"
# Require this many consecutive failed probes before recovery (avoid flapping).
FAIL_STREAK_NEED="${CP1_WATCHDOG_FAIL_STREAK:-3}"
fail_streak=0

mkdir -p "$RUNTIME_DIR"

log_w() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  printf '%s\n' "$msg" | tee -a "$LOG_FILE" >/dev/null
  # Also mirror to stderr when run interactively.
  printf '%s\n' "$msg" >&2
}

write_status() {
  local state="$1" detail="${2:-}"
  /usr/bin/python3 -c '
import json,sys,time
state, detail = sys.argv[1], sys.argv[2]
print(json.dumps({"state": state, "detail": detail, "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}))
' "$state" "$detail" >"$STATUS_FILE"
}

acquire_lock() {
  if [ -f "$LOCK_FILE" ]; then
    local old_pid
    old_pid="$(/bin/cat "$LOCK_FILE" 2>/dev/null || true)"
    if [ -n "$old_pid" ] && /bin/kill -0 "$old_pid" 2>/dev/null; then
      return 1
    fi
    /bin/rm -f "$LOCK_FILE"
  fi
  printf '%s\n' "$$" >"$LOCK_FILE"
  return 0
}

release_lock() {
  /bin/rm -f "$LOCK_FILE"
}

cooldown_active() {
  [ -f "$LAST_RESTART_FILE" ] || return 1
  local last now
  last="$(/bin/cat "$LAST_RESTART_FILE" 2>/dev/null || echo 0)"
  now="$(/bin/date +%s)"
  [ $((now - last)) -lt "$COOLDOWN_SEC" ]
}

host_cp1_healthy() {
  # 91 exits 0 for both healthy and degraded — require mode=healthy.
  bash "$SCRIPT_DIR/91_ensure-cp1-mounted.sh" >/dev/null 2>&1 || return 1
  local mode
  mode="$(tr -d '[:space:]' <"$RUNTIME_DIR/mode" 2>/dev/null || true)"
  [ "$mode" = "healthy" ]
}

# Classify without remounting: use 91's classify by sourcing a dry check.
# We call 91 in "check-only" by inspecting mount + probe inline (same as 91).
is_host_probe_ok() {
  local mp="/Volumes/cp_1"
  local probe="$mp/chad-data/02_files_refrenced"
  /sbin/mount | /usr/bin/grep -q " on ${mp} (smbfs" || return 1
  /usr/bin/perl -e '
    use strict; use warnings;
    my ($path, $root, $timeout) = @ARGV;
    eval {
      local $SIG{ALRM} = sub { die "timeout\n" };
      alarm $timeout;
      if (-e $path) {
        opendir(my $dh, $path) or die $!;
        readdir($dh); closedir($dh);
      } else {
        opendir(my $dh, $root) or die $!;
        readdir($dh); closedir($dh);
      }
      alarm 0;
    };
    exit($@ ? 1 : 0);
  ' "$probe" "$mp" "${CP1_FS_TIMEOUT_SEC:-5}"
}

signal_pending() {
  [ -f "$REQUEST_FILE" ]
}

clear_signal() {
  /bin/rm -f "$REQUEST_FILE"
}

run_recovery() {
  local reason="$1"
  if ! acquire_lock; then
    log_w "Skip recovery (lock held): $reason"
    return 0
  fi
  trap release_lock EXIT

  if cooldown_active; then
    log_w "Skip recovery (cooldown ${COOLDOWN_SEC}s): $reason"
    write_status "cooldown" "$reason"
    release_lock
    trap - EXIT
    return 0
  fi

  log_w "Recovery start: $reason"
  write_status "repairing" "$reason"
  # Cooldown starts on every attempt (including failures) to stop restart loops.
  /bin/date +%s >"$LAST_RESTART_FILE"

  # Confirm failure once more (debounce flapping), except for app signals
  # where the container may already have seen a hard FS error.
  if [ "$reason" != "signal" ]; then
    sleep "$CONFIRM_SEC"
    if is_host_probe_ok; then
      log_w "Probe OK after confirm — aborting recovery."
      write_status "healthy" "false-positive"
      clear_signal
      release_lock
      trap - EXIT
      return 0
    fi
  fi

  need_restart=1
  if is_host_probe_ok; then
    # Host looks fine — only restart if the container bind is stale.
    if bash "$SCRIPT_DIR/92_verify-cp1-in-container.sh" >/dev/null 2>&1; then
      log_w "Host + container already OK — clearing signal."
      write_status "healthy" "already-ok"
      clear_signal
      release_lock
      trap - EXIT
      return 0
    fi
    log_w "Host OK but container bind stale — restart without remount."
  else
    if ! bash "$SCRIPT_DIR/91_ensure-cp1-mounted.sh"; then
      log_w "ERROR: 91_ensure-cp1-mounted.sh failed"
      write_status "failed" "mount-repair"
      release_lock
      trap - EXIT
      return 1
    fi
    if ! is_host_probe_ok; then
      log_w "ERROR: host probe still failing after repair"
      write_status "failed" "host-probe"
      release_lock
      trap - EXIT
      return 1
    fi
  fi

  if [ "$need_restart" = "1" ]; then
    log_w "Restarting local Mac Docker stack (refresh virtiofs binds)..."
    if ! bash "$SCRIPT_DIR/03_re-start.sh"; then
      log_w "ERROR: 03_re-start.sh failed after remount"
      write_status "failed" "restart"
      release_lock
      trap - EXIT
      return 1
    fi
  fi

  if ! bash "$SCRIPT_DIR/92_verify-cp1-in-container.sh"; then
    log_w "ERROR: container bind verify failed after restart"
    write_status "failed" "container-bind"
    release_lock
    trap - EXIT
    return 1
  fi

  clear_signal
  write_status "healthy" "recovered"
  log_w "Recovery complete."
  release_lock
  trap - EXIT
  return 0
}

if [ "$(uname -s)" != "Darwin" ]; then
  log_w "Not Darwin — watchdog exiting."
  exit 0
fi

log_w "cp_1 watchdog started (poll=${POLL_SEC}s cooldown=${COOLDOWN_SEC}s)"
write_status "watching" "started"

while true; do
  if signal_pending; then
    fail_streak=0
    run_recovery "signal" || true
  elif ! is_host_probe_ok; then
    fail_streak=$((fail_streak + 1))
    log_w "Host probe fail streak=$fail_streak/$FAIL_STREAK_NEED"
    if [ "$fail_streak" -ge "$FAIL_STREAK_NEED" ]; then
      run_recovery "stale-or-unmounted" || true
      fail_streak=0
    fi
  else
    fail_streak=0
    write_status "healthy" "ok"
  fi
  sleep "$POLL_SEC"
done
