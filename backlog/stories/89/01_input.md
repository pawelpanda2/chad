# Story 89 — Local Postgres mirror + Dev Panel source switch

## Source

User (2026-07-25), after local volume looked like destroyed data:

1. Fix Dev Panel Settings so switching Postgres/Mongo source actually works.
2. Local Postgres must not be a garbage dump of test fixtures under `pawel_f`.
3. Local Postgres should mirror / follow production (QNAP) data.
4. Test mutations only under `test3` — document as a basic error for AI.

## Goal

- Working Dev Panel source switch (invalidate caches, probe connection, clear errors).
- `syncLocalPostgresFromQnap` — pull QNAP → local volume (mirror).
- Seed/tests never invent `pawel_f` fixture trees; test3 only for test data.
- Document in `ai-docs/begin_here/01_ai_start.md`.
