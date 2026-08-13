# Story 118 — checklist

## Punkt startowy

- Pre-task dirty: folders recursive delete → committed as `42de334`
- Implementation starts after that SHA
- Kickoff note: `f9f373d` was HEAD before folders baseline

## Implementation

- [x] Rewrite `91_ensure-cp1-mounted.sh` (Bash mount_smbfs, HEALTHY/UNMOUNTED/STALE, timed probe, Keychain)
- [x] `03_re-start.sh` early preflight + host read + `92_verify-cp1-in-container.sh`
- [x] Watchdog LaunchAgent `93`–`96` (Homebrew bash, fail streak, cooldown on attempt)
- [x] Dashboard/DBA signal via `.runtime/cp1-repair/request` + local API
- [x] Docs `ai-docs/bash-scripts/local-mac-cp1.md`
- [x] Install watchdog on this Mac (`94_install-cp1-watchdog.sh`)
- [x] Local Docker rebuild + restart + bind verify + `/login` smoke

## Verification matrix

| # | Scenario | Result |
|---|----------|--------|
| A | HEALTHY → no remount, restart works | PASS lokalnie |
| B | UNMOUNTED → Bash mount no GUI | PASS lokalnie (admin dialog only for mkdir `/Volumes/cp_1`) |
| C | STALE → unmount/remount | częściowo — refuse unmount bez sudo prep (PASS safety); pełny STALE remount nieuruchomione destrukcyjnie |
| D | repair FAIL → restart FAIL | PASS lokalnie (compose odmówił bez mount) |
| E | share drops mid-run → watchdog | nieuruchomione (nie odpinano share celowo) |
| F | many signals → one repair | lock + cooldown (code) |
| G | missing file → no repair | unit test PASS |
| H | TEST/PROD inactive | `CHAD_ENVIRONMENT=local` + Darwin guards |

## Incidents during implementation

1. LaunchAgent used `/bin/bash` 3.2 → `${var,,}` broke; fixed to Homebrew bash.
2. Watchdog false STALE unmounted then failed mkdir — fixed `can_prepare_mount_point` + fail streak + cooldown on attempt.
3. `NAS_SUDO_PASSWORD` in external Python `.env` is stale (not usable). Need Keychain `chad-local-cp1-sudo` or NOPASSWD for unattended remount after unmount.

## Credential note

Python `retry_network_drive_v7.py` uses plaintext `NAS_*` in external `.env`
and password-in-URL argv. Repo uses Keychain first; optional gitignored
`CP1_SMB_*` — password via `mount_smbfs -N` stdin only.
