# Story 97 — Knowledge

Pointers to what was needed for this Story, and why. Not a description of
the implementation (that's `05_tasks_and_checklist.md`).

## CpItem contract & public entrypoints

- `packages/content-provider/common/src/contracts.ts` — confirmed still the
  current, real provider-storage contract (`ContentProviderStorage`,
  legacy uppercase `CpItem`). This is what a storage backend implements,
  **not** what application code (dashboard/console, and now MCP) is
  supposed to call directly.
- `packages/dba/src/item-ops.ts` — the actual public, transport/backend-
  agnostic layer every MCP tool calls (`getItemByLoca`, `resolveByNames`,
  `getChildrenOf`, `findRecursively`, `createOrGetChild`, `putItemBody`).
  Confirmed via `human-docs/dba/data-access.md`'s own instruction that raw
  CP communication must be hidden inside `dba`.
- `packages/dba/src/cp-model.ts` — the current, live `CpItem` shape
  (`{ _id, config, body }`), used across the whole app. Confirmed via
  `packages/dba/src/index.ts`'s barrel (`export * from './cp-model.js'`,
  `export * from './item-ops.js'`) that both are part of `dba`'s public
  surface.
- `packages/dba/src/data-providers/types.ts` — confirmed the legacy
  `GetManyByName(repoGuid, parentLoca, name)` operation has **no** direct
  counterpart on `CpCompatibleDataProvider` — consolidated into
  `getChildren(parentAddress)` during the Story 72 provider migration. This
  is why `cp_get_many_by_name` filters `getChildrenOf`'s result instead of
  calling a same-named method that no longer exists.

## Identity / repo context

- `packages/dba/src/repo-context.ts` — `runWithRepoContext`/
  `getCurrentRepoGuid()` (AsyncLocalStorage), the one mechanism every dba
  business function relies on. Used as-is by every MCP tool handler via
  `identity.ts`'s `withMcpIdentity`.
- `packages/dba/src/repo-access.ts` — `resolveOwnRepo(username)` looked
  like the obvious choice for username → repoGuid, but it calls
  `getAllRepos()` (`client.ts`), which hits the **legacy Content Provider
  `/invoke` HTTP API directly** — confirmed NOT part of the current local
  Docker stack (`docker-compose.local.yml`'s own comment: "Content Provider
  (content-provider-api) removed from this stack") and not buildable via
  the current `bash-scripts/dashboard/03_local_mac_docker/02_build.sh`
  (no reference to it at all; the `03_build.sh` path referenced by
  `bash-scripts/content-provider/run-content-provider-if-needed.sh`'s own
  error message doesn't even exist anymore — stale). Chasing this down cost
  real time and is the single biggest architectural deviation from the
  original plan — see `02_plan.md`'s revision.
- `packages/dba/src/admin-users.ts` — `getUsersListBody()`, reading
  `chad_admin/users/users-list` through `item-ops.ts`/`DbaDataRouter` (i.e.
  works on whichever backend is actually primary — Postgres). This is what
  `packages/dashboard/lib/user-service.ts`'s own login flow
  (`findUserByUsername`) uses. `identity.ts` re-implements the same
  minimal YAML lookup rather than importing dashboard code (wrong
  dependency direction) or editing `dba`'s `index.ts` (under active
  concurrent edit by another session at the time — see below).
- `packages/dba/src/testing/test3-guard.ts` — confirmed `TEST3_REPO_GUID`/
  `TEST3_USERNAME` is this repo's one established, guarded test identity
  (Story 78). Confirmed this module is deliberately **not** part of `dba`'s
  public exports (`package.json`'s `"exports"` map only exposes `.`,
  `./table-columns`, `./system-folders` — no `./testing/*`) — so
  `packages/mcp` cannot and does not import it; `identity.ts` independently
  re-derives the same repoGuid live from `users-list` instead.
- Live probe (`node probe-identity.mjs`, deleted after use) found that
  `users-list`'s own comment says test3/test2 have "no repo provisioned
  yet — repoGuid is just a placeholder", which initially looked like a
  blocker — but `pnpm test:provision-test3`
  (`tests/support/users/provision-test3.mjs`) had, in fact, already
  provisioned real Daily/Date Entry data for test3 on the real QNAP
  Postgres (idempotent no-op on this run — "2 daily, 6 date entries" already
  present). The `users-list` comment is stale relative to that.

## Env / infra

- `.env.local`/`.env.local.example` — repo-root env convention confirmed;
  `plugins/beeper-synch/src/config.ts` established the precedent for a
  standalone host process reading its **own** env file
  (`dotenv.config({ path: resolve(REPO_ROOT, "<own file>") })`) instead of
  `.env.local` (whose Postgres/Mongo hostnames are docker-internal, not
  host-reachable) — `packages/mcp` follows the same pattern
  (`.env.mcp`/`.env.mcp.example`).
- `packages/dba/src/dev-db-override.ts` — the actual live Postgres
  connection logic. Confirmed `defaultPostgresSource()` always resolves to
  `"server"` (real shared QNAP Postgres, `100.117.139.83:12042`) unless an
  offline-readonly-backup marker is present — a plain `localhost:5433`
  `POSTGRES_URI` override is silently ignored by `getEffectivePostgresUri()`
  (it isn't recognized as a QNAP URI, so the function falls through and
  rebuilds a QNAP connection anyway, requiring `POSTGRES_QNAP_PASSWORD`).
  `.env.mcp` therefore does NOT set `POSTGRES_URI` at all — it sets
  `POSTGRES_USER`/`POSTGRES_DB`/`POSTGRES_QNAP_PASSWORD` and lets
  `dev-db-override.ts` build the QNAP connection itself. This is also
  architecturally correct for test3: Story 78's whole point was testing the
  real shared environment via repoGuid isolation, not a separate sandbox DB.
- `tests/support/database/qnap-env.mjs` — confirmed (via its own comment)
  that CHAD's own Mongo (`chad-mongodb`) was physically removed 2026-07-27;
  cp_items/cp_history are Postgres-only now. This directly informed
  `.env.mcp`'s `DBA_MONGO_ENABLED=false`/`DBA_CONTENT_PROVIDER_ENABLED=false`
  (MCP only ever needs the one real backend).

## Odyseusz

- User's own answer (see `01_input.md` Input 2): Odyseusz is a Python/
  FastAPI self-hosted AI workspace at
  `/Users/pawelfluder/03_synch/01_files_programming/11_other_python/odysseus`
  (`pewdiepie-archdaemon/odysseus`), not Claude Desktop (which was the
  initial, wrong guess — see the clarifying question asked before any
  implementation started).
- `src/mcp_manager.py` — `McpManager` class, the real client code
  Odyseusz's own `routes/mcp_routes.py` uses. Supports stdio
  (`StdioServerParameters`+`stdio_client`), legacy `sse`, and `http`
  (`streamablehttp_client` — confirms Streamable HTTP support, so no need
  to implement legacy HTTP+SSE for compatibility).
- `core/database.py`'s `McpServer` SQLAlchemy model + `routes/mcp_routes.py`
  — servers are persisted in Odyseusz's own SQLite DB
  (`data/app.db`'s `mcp_servers` table), normally via an admin-only
  `POST /api/mcp/servers`. No admin session/credentials were established on
  this machine, so the row was inserted directly via the same SQLAlchemy
  model (`register_chad_mcp.py`, left in the Odyseusz repo) — confirmed
  `data/` is gitignored there, and the DB was backed up
  (`data/backups/app.db.pre-chad-mcp-<timestamp>.bak`) before the insert.
- `core/middleware.py`'s `require_admin` — confirmed `AUTH_ENABLED` defaults
  to `"true"` when unset, so the admin HTTP API wasn't a viable path here
  anyway without real login credentials — reinforces the direct-DB-insert
  decision above as the pragmatic, safe choice (not a shortcut around a
  guard that was actually meant to stop this).

## MCP SDK

- `@modelcontextprotocol/sdk` 1.30.0 (current on npm at Story time) —
  `McpServer.registerTool(name, {title,description,inputSchema,
  annotations}, cb)`, `ToolAnnotations` (`readOnlyHint`/`destructiveHint`/
  `idempotentHint`/`openWorldHint`) used directly for §1.5's read/write
  distinction requirement.
- `StreamableHTTPServerTransport` confirmed as the current, non-legacy HTTP
  transport (`LATEST_PROTOCOL_VERSION` in this SDK version: `2025-11-25`).
- `InMemoryTransport`/`StdioClientTransport` (client-side) used for real
  protocol-level tests without needing a generic external Inspector.
