# Story 106 — Tasks Checklist (Plugin synch health + latina)

Start SHA: `85bb952`

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE | PASS | Env: API key in `.env.mac-beeper`; helper token restored in `.env.local` |
| 2 | DONE | PASS | Health-first status (token expired ≠ already running) |
| 3 | DONE | PASS | Top ErrorBox + clear token-expired message |
| 4 | DONE | PASS | Contact `26-08-01_nn_latina` Mongo → API → GUI |
| 5 | DONE | PASS | Tests (plugin-synch, auth-health, participants) |
| 6 | DONE | PASS* | Local Docker rebuild + browser smoke (*cp_1 SMB unmounted; decoy + `CHAD_ALLOW_WITHOUT_CP1=1`) |
| 7 | DONE | | Commit + push; PROD NOT RUN |

## Pipeline (latina)

- Beeper Desktop REST: chat title + phone OK
- Root cause: only `isSender` messages → contacts never created from senders
- Fix: `sync-channel.mjs` materializes contacts from chat participants
- Mongo contact `6a74b8d8a147d2185bedc207`, phone `+48572549017`
- API `/api/beeper-crm/contacts` + GUI Beeper Conv search: visible
- Plugin synch helper/API: `running` / authorized / healthy
