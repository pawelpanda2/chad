#!/usr/bin/env bash
# Ensures QNAP SMB share `cp_1` is HEALTHY at /Volumes/cp_1 before local Mac
# Docker starts (Story 106 follow-up, Story 118).
#
# States:
#   HEALTHY   — smbfs mount + timed filesystem probe OK → exit 0
#   UNMOUNTED — no smbfs at mount point → mount via mount_smbfs (no Finder GUI)
#   STALE     — mount entry or directory present but FS probe fails → unmount + remount
#
# Credentials (never logged, never put in argv):
#   1) Keychain internet password for host (security find-internet-password)
#   2) CP1_SMB_USER / CP1_SMB_PASSWORD from .env.local (gitignored)
# Password is piped to `mount_smbfs -N` on stdin (not process args).
#
# CHAD_ALLOW_WITHOUT_CP1=1 remains an emergency escape only — normal flow
# must FAIL so Compose cannot create a local decoy under /Volumes/cp_1.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"

ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env.local}"

CP1_MOUNT_POINT="/Volumes/cp_1"
CP1_SMB_HOST="${CP1_SMB_HOST:-100.117.139.83}"
CP1_SHARE_NAME="${CP1_SHARE_NAME:-cp_1}"
# Path that must be readable after mount (real chad-data layout).
CP1_PROBE_REL="${CP1_PROBE_REL:-chad-data/02_files_refrenced}"
CP1_FS_TIMEOUT_SEC="${CP1_FS_TIMEOUT_SEC:-5}"
CP1_MOUNT_TIMEOUT_SEC="${CP1_MOUNT_TIMEOUT_SEC:-30}"
CP1_ALLOW_SUDO="${CP1_ALLOW_SUDO:-true}"

# --- helpers -----------------------------------------------------------------

load_cp1_creds_from_env() {
  [ -f "$ENV_FILE" ] || return 0
  CP1_SMB_USER="${CP1_SMB_USER:-$(read_env_var "$ENV_FILE" CP1_SMB_USER)}"
  CP1_SMB_PASSWORD="${CP1_SMB_PASSWORD:-$(read_env_var "$ENV_FILE" CP1_SMB_PASSWORD)}"
  CP1_SUDO_PASSWORD="${CP1_SUDO_PASSWORD:-$(read_env_var "$ENV_FILE" CP1_SUDO_PASSWORD)}"
  # Optional aliases matching the external Python NAS_* module (.env gitignored).
  if [ -z "${CP1_SMB_USER:-}" ]; then
    CP1_SMB_USER="$(read_env_var "$ENV_FILE" NAS_USER)"
  fi
  if [ -z "${CP1_SMB_PASSWORD:-}" ]; then
    CP1_SMB_PASSWORD="$(read_env_var "$ENV_FILE" NAS_PASSWORD)"
  fi
  if [ -z "${CP1_SUDO_PASSWORD:-}" ]; then
    CP1_SUDO_PASSWORD="$(read_env_var "$ENV_FILE" NAS_SUDO_PASSWORD)"
  fi
}

# Optional macOS login password for `sudo -S mkdir/chown/rmdir` of /Volumes/cp_1
# when passwordless sudo is unavailable. Prefer NOPASSWD; never log this value.
load_cp1_sudo_password() {
  if [ -n "${CP1_SUDO_PASSWORD:-}" ]; then
    return 0
  fi
  local from_kc
  from_kc="$(/usr/bin/security find-generic-password -s "chad-local-cp1-sudo" -w 2>/dev/null || true)"
  if [ -n "$from_kc" ]; then
    CP1_SUDO_PASSWORD="$from_kc"
    return 0
  fi
  return 1
}

sudo_run() {
  # Usage: sudo_run /bin/mkdir /Volumes/cp_1
  if /usr/bin/sudo -n "$@" >/dev/null 2>&1; then
    return 0
  fi
  load_cp1_creds_from_env
  if load_cp1_sudo_password; then
    if printf '%s\n' "$CP1_SUDO_PASSWORD" | /usr/bin/sudo -S "$@" >/dev/null 2>&1; then
      return 0
    fi
  fi
  # Last resort on an interactive Mac session: one admin dialog (NOT an SMB
  # username/password sheet). Used only to create/chown/rmdir the mount point.
  if [ -t 0 ] || [ -n "${CP1_ALLOW_ADMIN_DIALOG:-}" ]; then
    local joined="" arg
    for arg in "$@"; do
      joined+="$(printf '%q' "$arg") "
    done
    /usr/bin/osascript -e "do shell script \"${joined% }\" with administrator privileges" >/dev/null 2>&1
    return $?
  fi
  return 1
}

# True if we can CREATE /Volumes/cp_1 after unmount. macOS removes the
# mount-point directory when smbfs unmounts — an existing mounted dir must
# NOT count as "can prepare" (that caused the watchdog to unmount and then
# fail mkdir without sudo).
can_prepare_mount_point() {
  if /usr/bin/sudo -n /bin/true >/dev/null 2>&1; then
    return 0
  fi
  load_cp1_creds_from_env
  if load_cp1_sudo_password; then
    return 0
  fi
  if [ -t 0 ] || [ -n "${CP1_ALLOW_ADMIN_DIALOG:-}" ]; then
    return 0
  fi
  return 1
}

load_cp1_creds_from_keychain() {
  local user="${CP1_SMB_USER:-}"
  local pass=""
  if [ -z "$user" ]; then
    user="$(/usr/bin/security find-internet-password -s "$CP1_SMB_HOST" 2>/dev/null \
      | /usr/bin/awk -F'=' '/"acct"/ { gsub(/"/, "", $2); print $2; exit }' || true)"
  fi
  [ -n "$user" ] || return 1
  pass="$(/usr/bin/security find-internet-password -s "$CP1_SMB_HOST" -a "$user" -w 2>/dev/null || true)"
  [ -n "$pass" ] || return 1
  CP1_SMB_USER="$user"
  CP1_SMB_PASSWORD="$pass"
  return 0
}

resolve_cp1_creds() {
  # Prefer Keychain (no password in repo/.env). Fall back to gitignored .env.local.
  if load_cp1_creds_from_keychain; then
    return 0
  fi
  load_cp1_creds_from_env
  if [ -n "${CP1_SMB_USER:-}" ] && [ -n "${CP1_SMB_PASSWORD:-}" ]; then
    return 0
  fi
  return 1
}

is_smbfs_at_point() {
  /sbin/mount | /usr/bin/grep -q " on ${CP1_MOUNT_POINT} (smbfs"
}

# Timed FS probe — a hung SMB must not block restart forever.
fs_probe_ok() {
  local target="${CP1_MOUNT_POINT}/${CP1_PROBE_REL}"
  # Prefer the probe path; fall back to mount root listability.
  /usr/bin/perl -e '
    use strict; use warnings;
    my ($path, $root, $timeout) = @ARGV;
    eval {
      local $SIG{ALRM} = sub { die "timeout\n" };
      alarm $timeout;
      if (-e $path) {
        opendir(my $dh, $path) or die "opendir: $!\n";
        readdir($dh);
        closedir($dh);
      } else {
        opendir(my $dh, $root) or die "opendir_root: $!\n";
        readdir($dh);
        closedir($dh);
      }
      alarm 0;
    };
    if ($@) { exit 1; }
    exit 0;
  ' "$target" "$CP1_MOUNT_POINT" "$CP1_FS_TIMEOUT_SEC"
}

host_reachable() {
  /usr/bin/nc -z -G 3 "$CP1_SMB_HOST" 445 >/dev/null 2>&1
}

classify_cp1() {
  if is_smbfs_at_point; then
    if fs_probe_ok; then
      echo "HEALTHY"
    else
      echo "STALE"
    fi
    return
  fi
  if [ -d "$CP1_MOUNT_POINT" ]; then
    # Directory exists but not smbfs — decoy or stale placeholder.
    if fs_probe_ok 2>/dev/null; then
      # Readable local decoy — treat as UNMOUNTED (must not use as share).
      echo "UNMOUNTED"
    else
      echo "STALE"
    fi
    return
  fi
  echo "UNMOUNTED"
}

try_unmount() {
  log_info "Unmounting $CP1_MOUNT_POINT..."
  /usr/sbin/diskutil unmount force "$CP1_MOUNT_POINT" >/dev/null 2>&1 || true
  /sbin/umount "$CP1_MOUNT_POINT" >/dev/null 2>&1 || true
}

sudo_rmdir_if_empty() {
  local path="$1"
  [ -d "$path" ] || return 0
  if is_smbfs_at_point; then
    return 1
  fi
  # Never rm -rf — only empty rmdir.
  if /bin/rmdir "$path" 2>/dev/null; then
    log_ok "Removed empty placeholder at $path"
    return 0
  fi
  case "$(printf '%s' "${CP1_ALLOW_SUDO:-true}" | tr '[:upper:]' '[:lower:]')" in
    true|yes|1|t) ;;
    *)
      log_warn "Cannot remove $path (needs sudo). Set CP1_ALLOW_SUDO=true or remove it manually."
      return 1
      ;;
  esac
  if sudo_run /bin/rmdir "$path"; then
    log_ok "Removed empty placeholder with sudo: $path"
    return 0
  fi
  log_warn "sudo rmdir failed for $path (NOPASSWD, Keychain chad-local-cp1-sudo, or CP1_SUDO_PASSWORD)."
  return 1
}

ensure_mount_point_dir() {
  if [ -d "$CP1_MOUNT_POINT" ]; then
    return 0
  fi
  if /bin/mkdir "$CP1_MOUNT_POINT" 2>/dev/null; then
    return 0
  fi
  case "$(printf '%s' "${CP1_ALLOW_SUDO:-true}" | tr '[:upper:]' '[:lower:]')" in
    true|yes|1|t) ;;
    *)
      log_error "Cannot create $CP1_MOUNT_POINT"
      return 1
      ;;
  esac
  if ! sudo_run /bin/mkdir "$CP1_MOUNT_POINT"; then
    log_error "Cannot create $CP1_MOUNT_POINT (need passwordless sudo, Keychain service chad-local-cp1-sudo, or CP1_SUDO_PASSWORD in .env.local)."
    return 1
  fi
  # mount_smbfs requires the mount point to be owned by the calling user.
  sudo_run /usr/sbin/chown "$(/usr/bin/id -un)" "$CP1_MOUNT_POINT" || true
  log_ok "Created mount point $CP1_MOUNT_POINT"
}

mount_smbfs_cp1() {
  if ! resolve_cp1_creds; then
    log_error "No SMB credentials for $CP1_SMB_HOST."
    log_error "  Add CP1_SMB_USER + CP1_SMB_PASSWORD to .env.local (gitignored),"
    log_error "  or store an internet password in Keychain for server $CP1_SMB_HOST."
    return 1
  fi
  if ! host_reachable; then
    log_error "Host $CP1_SMB_HOST:445 unreachable (Tailscale/VPN down?)."
    return 1
  fi
  ensure_mount_point_dir || return 1

  local user_enc
  # Percent-encode user for URL; password via stdin (-N), never in argv/ps.
  user_enc="$(/usr/bin/python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=""))' "$CP1_SMB_USER")"
  local url="//${user_enc}@${CP1_SMB_HOST}/${CP1_SHARE_NAME}"

  log_info "Mounting smbfs //${CP1_SMB_USER}@${CP1_SMB_HOST}/${CP1_SHARE_NAME} -> $CP1_MOUNT_POINT (no Finder GUI)..."
  # Timed mount_smbfs -N: password only on mount_smbfs stdin (not in ps argv).
  if ! printf '%s' "$CP1_SMB_PASSWORD" | /usr/bin/perl -e '
    use strict; use warnings;
    my ($url, $mp, $timeout) = @ARGV;
    my $pw = do { local $/; <STDIN> };
    eval {
      local $SIG{ALRM} = sub { die "timeout\n" };
      alarm $timeout;
      open(my $fh, "|-", "/sbin/mount_smbfs", "-N", $url, $mp) or die "spawn: $!\n";
      print {$fh} $pw;
      close($fh) or die "mount_smbfs failed (exit $?)\n";
      alarm 0;
    };
    if ($@) { warn $@; exit 1; }
    exit 0;
  ' "$url" "$CP1_MOUNT_POINT" "$CP1_MOUNT_TIMEOUT_SEC"; then
    log_error "mount_smbfs failed for $CP1_SMB_HOST/$CP1_SHARE_NAME"
    return 1
  fi

  if is_smbfs_at_point && fs_probe_ok; then
    log_ok "cp_1 HEALTHY at $CP1_MOUNT_POINT"
    return 0
  fi
  log_error "Mount reported success but filesystem probe failed."
  return 1
}

# mount_smbfs alone often leaves the share invisible in Finder's sidebar.
# Register it the same way Finder-native mounts (ProPictures/qnap) appear:
#   1) `mount volume` (Keychain, no password in script) → Locations as mounted disk
#   2) once: File → Add to Sidebar (Favorites) via Cmd+Control+T
ensure_cp1_visible_in_finder() {
  [ -d "$CP1_MOUNT_POINT" ] || return 0
  is_smbfs_at_point || return 0

  local user="${CP1_SMB_USER:-}"
  if [ -z "$user" ]; then
    load_cp1_creds_from_env || true
    load_cp1_creds_from_keychain || true
    user="${CP1_SMB_USER:-}"
  fi
  if [ -z "$user" ]; then
    user="$(/sbin/mount | /usr/bin/sed -n "s#^//\\([^@]*\\)@${CP1_SMB_HOST}/${CP1_SHARE_NAME} on ${CP1_MOUNT_POINT} .*#\\1#p" | /usr/bin/head -n1)"
  fi

  if [ -n "$user" ]; then
    # No password in URL — macOS uses Keychain. Already-mounted → no-op + sidebar refresh.
    /usr/bin/osascript -e "try
      mount volume \"smb://${user}@${CP1_SMB_HOST}/${CP1_SHARE_NAME}\"
    end try" >/dev/null 2>&1 || true
  fi

  # Soft reveal (no focus steal) so Locations lists the mounted volume.
  /usr/bin/open -g "$CP1_MOUNT_POINT" 2>/dev/null || true

  local marker="$REPO_ROOT/.runtime/cp1-repair/sidebar-favorite-done"
  mkdir -p "$(dirname "$marker")" 2>/dev/null || true
  if [ -f "$marker" ]; then
    log_ok "Finder: cp_1 registered (Locations); Favorites already added earlier."
    return 0
  fi

  # Best-effort Favorites (top sidebar). Needs Accessibility for System Events;
  # fails quietly if denied. One-shot so we do not create duplicates.
  if /usr/bin/osascript >/dev/null 2>&1 <<'APPLESCRIPT'
tell application "Finder"
  try
    open disk "cp_1"
  on error
    try
      open (POSIX file "/Volumes/cp_1")
    end try
  end try
end tell
delay 0.4
tell application "System Events"
  tell process "Finder"
    try
      set frontmost to true
      keystroke "t" using {command down, control down}
    end try
  end tell
end tell
APPLESCRIPT
  then
    printf 'cp_1\n' >"$marker" 2>/dev/null || true
    log_ok "Finder: cp_1 added to sidebar Favorites (Cmd+Control+T)."
  else
    log_warn "Finder Favorites add skipped (grant Terminal/Cursor Accessibility, or drag /Volumes/cp_1 to Favorites once)."
  fi
}

repair_cp1() {
  local state
  state="$(classify_cp1)"
  log_info "cp_1 state: $state"

  case "$state" in
    HEALTHY)
      log_ok "cp_1 share already HEALTHY at $CP1_MOUNT_POINT."
      return 0
      ;;
    STALE)
      # Never unmount until we know remount prep (creds + mount-point) can work.
      if ! resolve_cp1_creds; then
        log_error "STALE mount but no SMB credentials — leaving current mount untouched."
        return 1
      fi
      if ! can_prepare_mount_point; then
        log_error "STALE mount but cannot create $CP1_MOUNT_POINT after unmount."
        log_error "Configure passwordless sudo, Keychain service chad-local-cp1-sudo, or CP1_SUDO_PASSWORD."
        log_error "Refusing to unmount (would leave the share unavailable)."
        return 1
      fi
      try_unmount
      # If a non-empty local decoy remains, refuse automatic delete.
      if [ -d "$CP1_MOUNT_POINT" ] && ! is_smbfs_at_point; then
        if ! sudo_rmdir_if_empty "$CP1_MOUNT_POINT"; then
          if [ -n "$(/bin/ls -A "$CP1_MOUNT_POINT" 2>/dev/null || true)" ]; then
            log_error "$CP1_MOUNT_POINT is a non-empty non-smbfs directory (likely a Docker decoy)."
            log_error "Move/remove those stray files manually, then re-run."
            return 1
          fi
        fi
      fi
      mount_smbfs_cp1
      ;;
    UNMOUNTED)
      if [ -d "$CP1_MOUNT_POINT" ] && ! is_smbfs_at_point; then
        if [ -n "$(/bin/ls -A "$CP1_MOUNT_POINT" 2>/dev/null || true)" ]; then
          log_warn "$CP1_MOUNT_POINT exists and is non-empty but is NOT smbfs — likely a decoy. Not deleting automatically."
          log_error "Clear $CP1_MOUNT_POINT manually, then re-run (Compose create_host_path must not win)."
          return 1
        fi
        sudo_rmdir_if_empty "$CP1_MOUNT_POINT" || true
      fi
      mount_smbfs_cp1
      ;;
    *)
      log_error "Unknown cp_1 state: $state"
      return 1
      ;;
  esac
}

# --- main --------------------------------------------------------------------

if [ "$(uname -s)" != "Darwin" ]; then
  log_warn "91_ensure-cp1-mounted.sh is macOS-only — skipping."
  exit 0
fi

if repair_cp1; then
  ensure_cp1_visible_in_finder || true
  exit 0
fi

log_error "cp_1 repair failed — refusing to start Docker with a decoy bind."
if [ "${CHAD_ALLOW_WITHOUT_CP1:-}" = "1" ]; then
  log_warn "CHAD_ALLOW_WITHOUT_CP1=1 — continuing WITHOUT healthy cp_1 (audio/photos may write to a local decoy)."
  exit 0
fi
exit 1
