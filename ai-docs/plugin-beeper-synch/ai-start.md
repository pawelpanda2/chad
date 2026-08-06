# Plugin beeper-synch — Dashboard Plugin synch (Story 105)

## What it is

Official Mac plugin under `plugins/beeper-synch`, managed by LaunchAgent
`com.chad.beeper-synch` and scripts in `bash-scripts/beeper-synch/`.

Dashboard **Beeper → Settings → Plugin synch** starts/restarts that plugin
through a **closed** path — never a remote shell.

## Official scripts

- `install-startup.sh` / `un-install-startup.sh`
- `system-startup.sh`
- `restart.sh` — unload + load LaunchAgent (single instance)
- `status.sh` / `logs.sh`

## Local Mac path (Docker Dashboard → host)

1. On the Mac host: `bash-scripts/beeper-synch/start-helper.sh`
   - TCP `0.0.0.0:12701` (Docker Desktop on Mac cannot reach host
     `127.0.0.1`-only listeners or host Unix sockets across virtiofs)
   - Bearer token required; allowlist `GET /status`, `POST /start` only
   - `/start` runs official `restart.sh` only (single-flight lock + timeout)
2. Local Docker compose:
   - `BEEPER_SYNCH_HELPER_URL=http://host.docker.internal:12701`
   - `BEEPER_SYNCH_HELPER_TOKEN=<same token>`
3. Closed API (session required, ignores body):
   - `GET /api/beeper/plugin-synch/status`
   - `POST /api/beeper/plugin-synch/start`

UI statuses: `running` | `started` | `already running` | `failed` |
`error no connection to plugin`

Never reverse-proxy the helper. No Docker socket / privileged. Not for QNAP.

## TEST / PROD / no helper

Backend returns exactly: `error no connection to plugin`.
No shell, no QNAP LaunchAgent.
