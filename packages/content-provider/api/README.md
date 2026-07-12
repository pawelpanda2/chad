# cp-api

Single HTTP entry point for Content Provider. **Stage 2, read-only** (GET only — no write endpoints yet, Stage 3).

Routes per-repo item operations to `cp-entry`, which picks a storage backend (`cp-net-adapter`/`cp-files`/`cp-mongo`) per repo — this package never talks to a storage backend directly for those. No storage logic lives here.

## Endpoints

| Endpoint | Behind the scenes | Notes |
|---|---|---|
| `GET /health` | — | `{status, timestamp}` |
| `GET /storage/status` | `cp-files`'s `diagnoseStorage()` | See "One documented exception" below |
| `GET /repos` | `cp-files`'s `listRepos()` | See "One documented exception" below |
| `GET /repos/:repoId/root` | `cp-entry`'s `entry.GetItem(repoId, "")` | Shortcut for the repo root |
| `GET /repos/:repoId/items/<loca>` | `entry.GetItem(repoId, loca)` | `loca` is everything after `/items/`, slash-joined (e.g. `/repos/abc/items/03/06`) |
| `GET /repos/:repoId/by-names?names=a,b,c` | `entry.GetByNames(repoId, "a", "b", "c")` | Comma-separated |
| `GET /repos/:repoId/many-by-name?parentLoca=X&name=Y` | `entry.GetManyByName(repoId, X, Y)` | |
| `GET /repos/:repoId/find?loca=X&phrase=Y` | `entry.FindRecursively(repoId, X, Y)` | Body-only substring search, see `cp-files/README.md` |

## Config

```env
CP_API_PORT=12027
```

Plus whatever `cp-entry`'s active backend needs (`CP_FILES_STORAGE_ROOT` for `cp-files`, `CONTENT_PROVIDER_API_URL` for `cp-net-adapter`) — this package doesn't introduce new backend config, it just calls `cp-entry`.

## One documented exception to "only talk to cp-entry"

`GET /repos` and `GET /storage/status` call `cp-files`'s `listRepos()`/`diagnoseStorage()` **directly**, not through `cp-entry`. Reason: repo discovery isn't part of `cp-core`'s shared `ContentProviderStorage` contract — it's inherently storage-backend-specific (a filesystem walk for `cp-files`; a distinct query for `cp-mongo`; no equivalent "list everything" operation exists on the real .NET API for `cp-net-adapter` either). Since `cp-files` is currently the only backend capable of it, these two endpoints are only accurate for repos actually served by `cp-files` — not a generic cross-backend repo list. Flagged here rather than silently assumed to generalize once `cp-mongo` grows real read operations.

## No framework

Plain `node:http` + manual path parsing, matching `packages/cp-plugin`'s established style (the only other standalone HTTP server package in this monorepo) — not Express/Fastify, to avoid introducing a new dependency choice unprompted.

## Run

```bash
pnpm --filter cp-api build
pnpm --filter cp-api start
```

## Does NOT do

- No write endpoints (`Put`/`PostParentItem`) — Stage 3.
- No auth — this is an internal service, matching `cp-plugin`'s and the real .NET Content Provider API's own lack of auth today. Don't expose it publicly without addressing that first.
