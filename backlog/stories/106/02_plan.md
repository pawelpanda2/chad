# Story 106 — Plugin synch health + token env + latina contact

Start SHA: `85bb952` (leave photos/WIP untouched).

## Goals

1. Env: Beeper Desktop token → `.env.mac-beeper` `BEEPER_API_KEY`; helper token stays in `.env.local` / helper-token file.
2. UI/status: health-first Plugin synch (`token expired` ≠ `already running`); top ErrorBox.
3. Contact `26-08-01_nn_latina` (+48 572 549 017) visible via Mongo → API → GUI.
4. Tests + local Docker rebuild; commit+push; PROD NOT RUN.
