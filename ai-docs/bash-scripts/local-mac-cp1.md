# Local Mac Docker — QNAP SMB `cp_1` mount & recovery

Status: Story 118 (2026-08-13). Local Mac only — never TEST/PROD.

## Chain

```
QNAP SMB share cp_1 (Tailscale 100.117.139.83)
        ↓  mount_smbfs (host macOS, no Finder GUI)
/Volumes/cp_1
        ↓  Docker Desktop bind (virtiofs)
dashboard container
  /app/contact-photos  ← /Volumes/cp_1/chad-data/02_files_refrenced
  /app/audio-recordings ← …/pawel_f/10_files_audio (legacy default path)
```

Compose must never create a local decoy under `/Volumes/cp_1` via
`create_host_path`. If the share is down, restart **fails**.

## Scripts (`bash-scripts/dashboard/03_local_mac_docker/`)

| Script | Role |
|--------|------|
| `91_ensure-cp1-mounted.sh` | Classify HEALTHY / UNMOUNTED / STALE; timed FS probe; unmount+remount via `/sbin/mount_smbfs -N` |
| `92_verify-cp1-in-container.sh` | `docker exec` readdir probe of bind paths |
| `03_re-start.sh` | Early host ensure → ports → `compose up` → container verify → health |
| `06_deploy.sh` | `02_build` → `03_re-start` → `05_status` (no duplicated preflight) |
| `93_cp1-watchdog.sh` | Host loop: probe + signal file → repair → `03_re-start` |
| `94_install-cp1-watchdog.sh` | LaunchAgent `com.chad.local-cp1-watchdog` |
| `95_uninstall-cp1-watchdog.sh` | Remove LaunchAgent |
| `96_cp1-watchdog-status.sh` | Status + log tail |

## Credentials

Never commit passwords. Never put them in process argv / logs.

1. **Keychain** (preferred): internet password for server `100.117.139.83`
2. **Fallback**: `CP1_SMB_USER` / `CP1_SMB_PASSWORD` in gitignored `.env.local`
   (aliases `NAS_USER` / `NAS_PASSWORD` also accepted)

Password is piped to `mount_smbfs -N` on stdin.

### Mount-point directory (`/Volumes/cp_1`)

macOS **removes** `/Volumes/cp_1` on unmount. Creating it again needs elevation:

1. passwordless `sudo` for `/bin/mkdir` + `/usr/sbin/chown` on that path, or
2. Keychain generic password service `chad-local-cp1-sudo`, or
3. `CP1_SUDO_PASSWORD` / `NAS_SUDO_PASSWORD` in `.env.local`, or
4. interactive admin dialog (`CP1_ALLOW_ADMIN_DIALOG=1` / TTY) — **not** an SMB login sheet

**STALE repair refuses to unmount** unless one of the above can recreate the
mount point afterward (prevents watchdog from leaving the share unavailable).

External Python reference (`retry_network_drive_v7.py`) used plaintext
`NAS_*` in its own `.env` and put password in the mount URL argv — **not**
copied into this repo.

## Why remount alone is not enough

After host remount, Docker Desktop/virtiofs may keep a dead bind
(`EBADF` / `ENOTDIR` / `EIO`). Watchdog / restart always refreshes the
local stack via official `03_re-start.sh` after a successful host repair.

## Dashboard signal (accelerate only)

On local (`CHAD_ENVIRONMENT=local`), DBA file-storage / audio paths that hit
real storage errno write:

`.runtime/cp1-repair/request` → `/app/runtime/cp1-repair/request`

Watchdog is the primary protector; the signal only speeds reaction.
Plain `ENOENT` (missing file) does **not** trigger repair.

API (local + session only):

- `GET /api/dev-settings/cp1-repair` — status.json
- `POST /api/dev-settings/cp1-repair` — fixed action `repair-cp1` (no args)

## Manual checks

```bash
bash bash-scripts/dashboard/03_local_mac_docker/91_ensure-cp1-mounted.sh
bash bash-scripts/dashboard/03_local_mac_docker/92_verify-cp1-in-container.sh
bash bash-scripts/dashboard/03_local_mac_docker/96_cp1-watchdog-status.sh
/sbin/mount | grep cp_1
ls /Volumes/cp_1/chad-data/02_files_refrenced | head
```

## Troubleshooting (no Finder)

| Symptom | Action |
|---------|--------|
| `91` auth fail | Confirm Keychain entry or `CP1_SMB_*` in `.env.local` |
| Host :445 unreachable | Tailscale/VPN to QNAP |
| Non-empty decoy at `/Volumes/cp_1` | Move files out manually (script never `rm -rf`) |
| Host OK, container `EBADF` | `03_re-start.sh` (refresh virtiofs) |
| Restart loop | Check `.runtime/cp1-repair/lock` + cooldown (default 180s) |

Emergency escape (discouraged): `CHAD_ALLOW_WITHOUT_CP1=1` lets restart
continue without a healthy share — uploads may hit a decoy.
