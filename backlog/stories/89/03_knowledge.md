# Story 89 — Knowledge

## Dev Panel source switch (bugs fixed)

1. `invalidateUsersCache()` on every successful POST — previously 30s cache
   made login/session look like the old DB after a switch.
2. `closePostgresConnection()` + probe `SELECT count(*) FROM cp_items` so the
   UI shows `probe OK — cp_items=N` or a real connection error.
3. Preference persisted to `/app/data/dev-db-source.json` (dashboard volume).

## Local mirror

- `syncLocalPostgresFromQnap()` copies QNAP → local volume (cp_items,
  cp_history, outboxes) with history triggers disabled during bulk load.
- Host script: `07_sync-postgres-from-qnap.sh`
- Dev Panel button + `POST /api/dev-settings/sync-local-postgres`
- `03_re-start.sh` always mirrors after migrate.

## Hard rule

Test fixtures / automated mutations → **test3 only**. Never invent
`pawel_f` trees in the local volume. Documented in
`ai-docs/begin_here/01_ai_start.md`.
