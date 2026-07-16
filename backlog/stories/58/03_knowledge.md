# Story 58 — Knowledge

**Note on timing:** this Story folder was created mid-task, on explicit user
request ("zapisz to story jako 58 wedlug standardow w dokumentacji"), after
work had already started (reading local-run scripts, wiring
`MONGODB_URI` into `.env.local`). `01_input.md` and this file were backfilled
from the actual conversation/tool history rather than written before the
first action, per the Story standard's "if you notice mid-task" rule.

- `documentation/beeper/architecture.md`,
  `documentation/beeper/mongo-schema.md`,
  `documentation/beeper/migration.md` — the prior Story-less migration work
  (contacts → chad) that this Story continues. `migration.md`'s "Blockers /
  remaining work" section is the direct source of the items Input 1
  reclassifies as non-blockers.
- `documentation/ai-docs/knowledge/03_story-standard.md` — the standard this
  Story folder itself follows.
- `bash-scripts/dashboard/02_local_mac_tmux/{01_config,02_start,03_end,04_status}.sh`
  — the existing local-mac (non-Docker, tmux/pnpm) dev launcher. Needed
  because Input 1 explicitly requires reading and reusing existing run
  scripts instead of inventing new ones. Key facts learned: it exports
  `.env.local` into the shell (`set -a; source .env.local; set +a`) rather
  than relying on Next.js's own `.env*` auto-loading, which is why adding
  `MONGODB_URI` to root `.env.local` is enough to reach `packages/dashboard`
  — no per-package `.env` file needed. It auto-detects a non-interactive
  invocation (no TTY) and starts tmuxinator with `--no-attach` instead of
  attaching, which matters when driving it from an agent session.
- `bash-scripts/content-provider/run-content-provider-if-needed.sh` +
  `01_config.sh`'s `CONTENT_PROVIDER_APPSETTINGS_JSON` — how the local
  Content Provider API container is started, on port 12024, mounting the
  real `/Users/pawelfluder/Dropbox` (`PreparerModule.NoSqlRepoSearchPaths`).
  Confirmed this path genuinely contains real `chad_admin/users-list` data
  locally (repo GUID `0fc7da8d-3466-4964-a24c-dfc0d0fef87c`, item
  `01/01` = `users-list`) — so a real local login is possible in principle,
  but the stored password is bcrypt-hashed and not recoverable from disk.
- `docker-compose.local.yml` — local Mac Docker stack (mongo + CP +
  dashboard as built production images). Not the path used for this Story;
  `02_local_mac_tmux` (hot-reload `pnpm dev`) is faster to iterate against.
  Its `mongodb` service/volume (`chad-mongodb-local-mac-docker-db`) is the
  one referenced by the "Caution for next time" note in the
  `chad_monorepo_migration` memory file — do not seed it with disposable
  verification data, only real local-dev use.
- `.env.local.example` / `.env.local` (root) — confirmed `MONGODB_URI` was
  never added here (comment literally said "local_mac's non-Docker mode
  doesn't run Mongo at all yet"), which predates the Beeper migration.
  Added it as part of this Story.
- `packages/dashboard/lib/session.ts` — `getCurrentUserFromCookies()` calls
  `resolveCurrentUser()`, which re-validates the session cookie against the
  real Content Provider user list on **every** request. This is why a
  browser click-through of any authenticated route needs the full local CP
  stack running with real data, not just a mocked cookie.
- Root `package.json`'s `mongo:up` script (`docker compose up -d mongodb`,
  no `-f` flag) is stale/broken — there is no root-level `docker-compose.yml`
  (only `docker-compose.local.yml` / `.qnap.*.yml`). Noted here rather than
  "fixed" outside this Story's scope; the correct invocation is
  `docker compose -f docker-compose.local.yml up -d mongodb`.
