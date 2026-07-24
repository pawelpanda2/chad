# Story 87 — Root cause

## Login chain

Dashboard `/api/auth/login`
→ `findUserByUsername` / `getUsersListBody`
→ DBA Postgres (`cp_items`)
→ `chad_admin` → `users` → `users-list` (YAML)

HTTP 401 **"Invalid credentials"** is returned when the user is **not found**
(empty / missing users-list), not only when the password is wrong.

## Exact cause (two layers)

1. With `DBA_MONGO_MODE=local`, Compose points `POSTGRES_URI` at the sibling
   `postgres` volume. That volume had **no** live `chad_admin/users/users-list`
   in `cp_items` → `getUsersListBody()` empty → `user === null` → Invalid credentials.

2. Seeding failed on a second bug: local volume had `cp_history` for
   `chad_admin` (insert v1 + delete v2) but no `cp_items` row. Trigger
   `cp_items_write_history` hard-coded `v_version := 1` on INSERT → unique
   violation on `(source_id, version)`.

Workaround that masked (1): `DBA_MONGO_MODE=qnap` (not a valid local stage).

## Fix

- Migration `0002_reinsert_after_delete_version.sql` — INSERT uses
  `MAX(cp_history.version)+1`.
- Seed includes **pawel_f** (GUID `21d11bdc-…`), `kamil_s`, `test3`, `local_dev`
  with password `changeme`. Incomplete seed (only test3/local_dev) was a
  regression that broke the real login panel for `pawel_f`.
- Regression: `pnpm test:regression:local-login`
  (API + Playwright panel against localhost:12020).

