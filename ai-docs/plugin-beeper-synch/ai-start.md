# Plugin beeper-synch — Dashboard Plugin synch (Story 105/106)

## What it is

Official Mac plugin under `plugins/beeper-synch`, managed by LaunchAgent
`com.chad.beeper-synch` and scripts in `bash-scripts/beeper-synch/`.

Dashboard **Beeper → Settings → Plugin synch** starts/restarts that plugin
through a **closed** path — never a remote shell.

## Running vs healthy

| Concept | Meaning |
|---------|---------|
| Process running | LaunchAgent / supervisor PID exists |
| `running` (UI) | Healthcheck **PASS**: supervisor + ws + oplog + Beeper API authorized + last sync OK |
| `already running` | Process was already up — **never** a final success without healthcheck |
| `token expired` | Beeper Desktop REST returned 401 Token expired |
| `unauthorized` | 401/403 without exact “Token expired” |
| `sync failed` | Last sync exit code ≠ 0 |
| `unhealthy` | Process up (or not) but health fields fail |
| `error no connection to plugin` | Helper unreachable / not configured (TEST/PROD) |

Canonical status file: `.runtime/beeper-synch/status.json`
(fields include `supervisorRunning`, `wsRunning`, `oplogRunning`,
`beeperDesktopReachable`, `authorizationStatus`, `lastSuccessfulSyncAt`,
`lastErrorCode`, `lastErrorMessageShort`, `healthy`).

## Env loaders (do not mix)

| Variable | File | Purpose |
|----------|------|---------|
| `BEEPER_API_KEY` | **`.env.mac-beeper`** | Beeper Desktop REST/WS auth (`bdapi_…`) |
| `BEEPER_SYNCH_HELPER_TOKEN` | **`.env.local`** (Dashboard Docker) + `.runtime/beeper-synch/helper-token` | Closed helper Bearer for Dashboard → host |
| `BEEPER_SYNCH_HELPER_URL` | `.env.local` | e.g. `http://host.docker.internal:12701` |

Putting a Beeper Desktop `bdapi_` token into `BEEPER_SYNCH_HELPER_TOKEN`
breaks the helper and does **not** refresh Beeper API auth.

Never commit `.env*`, tokens, or fragments.

## Official scripts

- `install-startup.sh` / `un-install-startup.sh`
- `system-startup.sh`
- `restart.sh` — unload + load LaunchAgent (single instance)
- `status.sh` / `logs.sh`
- `start-helper.sh` — local helper for Docker Dashboard

## Local Mac path (Docker Dashboard → host)

1. On the Mac host: `bash-scripts/beeper-synch/start-helper.sh`
   - TCP `0.0.0.0:12701` (Docker Desktop on Mac cannot reach host
     `127.0.0.1`-only listeners or host Unix sockets across virtiofs)
   - Bearer token required; allowlist `GET /status`, `POST /start` only
   - `/start` runs official `restart.sh` only (single-flight lock + timeout)
   - Response status is **health-first** (not PID-only)
2. Local Docker compose:
   - `BEEPER_SYNCH_HELPER_URL=http://host.docker.internal:12701`
   - `BEEPER_SYNCH_HELPER_TOKEN=<same as helper-token file>`
3. Closed API (session required, ignores body):
   - `GET /api/beeper/plugin-synch/status`
   - `POST /api/beeper/plugin-synch/start`

UI error statuses render a top **ErrorBox** on Beeper (Settings) with a
clear message (e.g. token expired → set `BEEPER_API_KEY` in `.env.mac-beeper`).

Never reverse-proxy the helper. No Docker socket / privileged. Not for QNAP.

## Contact sync note

`beeper-sync` materializes contacts from chat **participants** (not only
message senders). Outbound-only / self-only threads still create a contact.

## TEST / PROD / no helper

Backend returns exactly: `error no connection to plugin`.
No shell, no QNAP LaunchAgent.
