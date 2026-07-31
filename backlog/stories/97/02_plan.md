# Story 97 — Plan

## Confirmed facts (from reading actual HEAD, not the prompt's assumptions)

- `packages/content-provider/common/src/contracts.ts`'s `ContentProviderStorage`
  contract (GetItem/GetByNames/GetManyByName/FindRecursively/Put/PostParentItem,
  `CpItem { Body, Config, Settings, Address }`) is still present and still the
  contract every storage backend implements — **but it is not the layer
  application code (dashboard/console) is supposed to call.** `dba`'s own docs
  (`human-docs/dba/...`, referenced from `ai-docs/begin_here/02_what-and-where.md`)
  are explicit: "Cała surowa komunikacja z Content Providerem MA być ukryta w
  `dba` — dashboard i console nigdy nie wywołują tych metod bezpośrednio."
  `packages/dba/src/item-ops.ts` is that public, transport/backend-agnostic
  layer (`resolveByNames`, `getItemByAddress`/`getItemByLoca`, `resolveSequence`,
  `findRecursively`, `createOrGetChild`/`findOrCreateFolderChain`, `putItemBody`,
  `putItem`), already re-exported through `dba`'s barrel `index.ts`
  (`export * from './item-ops.js'`, `export * from './cp-model.js'`). It
  internally routes through `DbaDataRouter`/the primary provider — MCP must
  call *this* layer, not `contracts.ts`'s `ContentProviderStorage` directly and
  not any provider file under `packages/dba/src/data-providers/*` or
  `packages/content-provider/*`.
- The **current** canonical `CpItem` shape used across the live app is
  `packages/dba/src/cp-model.ts`'s `{ _id, config: { id, address, type, name,
  ...free-form }, body }` — lowercase, not the legacy uppercase
  `{Body, Config, Settings, Address}` wire shape from `contracts.ts`. MCP tools
  return this shape (imported from `dba`, not redeclared) — mapping it 1:1
  onto the prompt's requested `Body/Config/Settings/Address` output fields
  would silently resurrect a shape the rest of the app abandoned. Tool output
  schemas expose `id/address/type/name/config/body` and separately document
  the historical field-name correspondence for anyone coming from the old
  `/invoke` docs.
- Identity/repo-context: `packages/dba/src/repo-context.ts`'s
  `runWithRepoContext({ repoGuid, username }, fn)` + `getCurrentRepoGuid()`
  (AsyncLocalStorage, throws outside a context — exactly the "no fallback"
  behavior the prompt requires) is the one mechanism every dba function
  already relies on. `packages/dba/src/repo-access.ts`'s `resolveOwnRepo(username)`
  is the only sanctioned way to turn a username into a repoGuid (exact
  `chad_<username>` match against the real Content Provider repo list — never
  a hardcoded map, never trusts a client-supplied repoGuid).
- `packages/dba/src/testing/test3-guard.ts` already defines
  `TEST3_REPO_GUID`/`TEST3_USERNAME` as this repo's one existing, established
  "safe to mutate" test identity (used throughout Story 78's regression
  suite). `test2` is referenced only as "exists but unprovisioned" in Story 78
  notes, no code-level guard/constant exists for it. **Decision: MCP's test
  identity profile is `test3`, resolved live via `resolveOwnRepo("test3")`
  (never hardcoding its repoGuid in MCP itself) — consistent with existing
  convention, and Story 78's `assertTest3Scoped`-style address check is
  mirrored as this package's own mutation guard.**
- Env convention: root `.env.local` (+ `.env.local.example` counterpart) is
  the one file holding real CP/DB config for local dev; standalone
  non-Next.js processes (`plugins/beeper-synch/src/config.ts`) load it via
  `dotenv.config({ path: resolve(REPO_ROOT, ".env.local") })`, not the
  bare `dotenv.config()` default. MCP follows the same explicit-path pattern
  and adds its own `MCP_*` vars to `.env.local.example`.
- Workspace pattern: `pnpm-workspace.yaml` already globs `packages/*` — no
  new glob entry needed for `packages/mcp`. Package pattern (from
  `packages/console`, `packages/dba`): `type: module`, `tsx` for dev,
  `tsc` for build, `"dba": "workspace:*"` dependency, own `tsconfig.json`
  (`NodeNext`/`ES2022`, `strict`).
- **Odyseusz** (per user's own answer) is
  `/Users/pawelfluder/03_synch/01_files_programming/11_other_python/odysseus`
  — a self-hosted Python/FastAPI AI workspace (`pewdiepie-archdaemon/odysseus`,
  local README calls it "Odysseus"), not Claude Desktop. It has a first-class
  MCP client (`src/mcp_manager.py`, `ClientSession` from the official `mcp`
  Python SDK) supporting `stdio` (`StdioServerParameters` + `stdio_client`),
  `sse` (legacy), and `http` (`streamablehttp_client` — i.e. Streamable HTTP
  is already supported, matching the prompt's requirement not to rely on
  legacy SSE). Servers are admin-registered via `POST /api/mcp/servers`
  (`routes/mcp_routes.py`, backed by a SQLite `mcp_servers` table,
  `core/database.py`'s `McpServer` model: `transport, command, args(json),
  env(json), url`) — no static JSON config file to hand-edit. `require_admin`
  defaults to auth-**enabled** (`AUTH_ENABLED` unset ⇒ `"true"` default in
  `core/middleware.py`), and Odysseus was not running/set up yet on this
  machine at Story start.

## Design decisions

1. **Package name: `packages/mcp`** — the name the prompt asked for is
   already unambiguous against the workspace glob and unused; no deviation
   needed.
2. **No new CpItem model, no new CRUD layer.** MCP tool handlers import
   `CpItem`/`CpItemConfig` and call `resolveByNames`, `getItemByAddress`,
   `getItemByLoca`, `resolveSequence` (`GetByNames2`-style, used for the
   `cp_get_by_names` sequence-of-names contract), `getChildrenOf`
   (backs `cp_get_many_by_name`). Confirmed the legacy `GetManyByName(repoGuid,
   parentLoca, name)` wire operation has no direct counterpart on the current
   `CpCompatibleDataProvider`/`DbaDataRouter` — it was consolidated into the
   generic `getChildren(parentAddress)` during the Story 72 provider
   migration (no `getManyByName` exists anywhere in `packages/dba/src`).
   `cp_get_many_by_name`'s handler therefore calls `getChildrenOf(parentAddress)`
   and filters the returned list by `config.name === name` at the MCP layer —
   filtering an already-fetched result set, not re-implementing the
   traversal/storage read itself. `findRecursively`, `createOrGetChild`
   (`PostParentItem`'s find-or-create semantics, for `cp_create_item`), and
   `putItemBody`/`putItem` (for `cp_put_item`) — all from `dba`'s public
   barrel export, `import { ... } from "dba"`.
3. **Identity model:** `packages/mcp/src/identity.ts` reads
   `MCP_ENVIRONMENT` (`local` required for mutations) and `MCP_TEST_USERNAME`
   (must equal `test3`, refused otherwise) from env, resolves the repoGuid
   live via `resolveOwnRepo(username)` at server startup (never a hardcoded
   GUID), and every tool call wraps its dba call in
   `runWithRepoContext({ repoGuid, username }, fn)`. No MCP tool accepts a
   `repoGuid` argument from the model, ever. Mutating tools additionally call
   a local `assertWithinConfiguredRepo(address)` guard (mirrors
   `test3-guard.ts`'s anchoring, generalized to whatever repoGuid the
   identity module resolved) before calling into `dba`.
4. **Transport-agnostic core:** `packages/mcp/src/server.ts` builds one
   `McpServer` (official `@modelcontextprotocol/sdk`) with all tools
   registered; `stdio.ts` and `http.ts` entrypoints each just pick a
   transport and connect it — tool handlers never see which transport is
   active.
5. **Streamable HTTP** implemented per current MCP spec (2025-03-26,
   `StreamableHTTPServerTransport`) since Odysseus's own client already
   supports it — legacy HTTP+SSE is not implemented. HTTP transport requires
   a bearer token (`MCP_HTTP_AUTH_TOKEN`) checked before any tool dispatch;
   no anonymous public endpoint.
6. **Odyseusz hookup:** register the server as a row in Odysseus's own
   `mcp_servers` SQLite table using its own SQLAlchemy model (equivalent to
   what `POST /api/mcp/servers` would insert — same shape, avoids fighting
   an admin-auth flow that has no established credentials on this machine
   yet), then drive a real connect + `list_tools` + `call_tool` sequence
   through Odysseus's own `src/mcp_manager.py` (`McpManager.connect_server`,
   `call_tool`) from a throwaway script — this exercises Odysseus's actual
   MCP client code, not a generic MCP Inspector substitute, without requiring
   a configured LLM to drive the full chat/agent loop.
7. **Docker:** MCP is a new local dev tool invoked via stdio/HTTP by an
   external client process, not part of the Dashboard/Postgres/Mongo Docker
   runtime described in `bash-scripts/dashboard/03_local_mac_docker/` — no
   Dockerfile/compose entry planned unless the HTTP transport later needs to
   run as a long-lived service. This will be re-confirmed once the local
   Docker stack's actual services are checked, and stated explicitly in the
   final report either way (no rebuild silently skipped without saying so).

## Scope cut vs. prompt (documented, not silent)

- No delete tool (contract confirms `DeleteWorker.Delete` remains a
  non-functional stub project-wide — `[[feedback_content_provider_no_delete]]`
  in earlier memory — consistent with the prompt's own "no delete this
  stage" instruction).
- `test2` not used for write tests (no established repoGuid/guard exists for
  it yet in this repo) — `test3` used instead, matching the prompt's
  "test2 or test3" allowance.
