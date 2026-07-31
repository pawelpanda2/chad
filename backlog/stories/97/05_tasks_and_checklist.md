# Story 97 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE | | Odyseusz connects to the CHAD MCP server and lists its tools |
| 2 | DONE | | Odyseusz calls `chad_mcp_health` and gets a real, non-secret status report |
| 3 | DONE | | Odyseusz reads a known CpItem from test3's repo (`cp_get_item`, `cp_get_by_names`) |
| 4 | DONE | | Odyseusz creates and edits a CpItem on test3 only, and re-reads it to confirm the saved content (`cp_create_item`, `cp_put_item`, read-after-write) |
| 5 | DONE | | An attempt to address another user's repo through any tool is blocked (cross-user isolation) |
| 6 | DONE | | Streamable HTTP transport rejects unauthenticated requests and serves a real MCP session for an authenticated one |

# Task 1 — Odyseusz connects and lists tools

**Requested:** Find Odyseusz's real MCP config mechanism, register the CHAD
MCP server there, and confirm Odyseusz itself (not a generic Inspector)
sees the server and lists its tools.

**Done:** Identified Odyseusz as the Python/FastAPI app at
`11_other_python/odysseus` (user's own answer, see `01_input.md` Input 2).
Confirmed its real MCP client is `src/mcp_manager.py`'s `McpManager`, and
that servers are persisted in its own SQLite DB (`data/app.db`'s
`mcp_servers` table, `core/database.py`'s `McpServer` model), normally via
an admin-only `POST /api/mcp/servers`. Backed up `data/app.db` first
(`data/backups/app.db.pre-chad-mcp-20260731_032931.bak`), then inserted a
row for "CHAD MCP" (stdio, `command=node`,
`args=["<chad-repo>/packages/mcp/dist/stdio.js"]`) using the same
SQLAlchemy model directly, via `register_chad_mcp.py` (left in the
Odyseusz repo, untracked — `data/` there is gitignored so no repo-state
pollution). Then ran `test_chad_mcp_from_odysseus.py`, which instantiates
`McpManager()` directly (the exact class the real app uses) and calls
`connect_server(transport="stdio", command="node", args=[...])`.

**Files changed:** `packages/mcp/**` (new package); Odyseusz repo (outside
this monorepo): `register_chad_mcp.py`, `test_chad_mcp_from_odysseus.py`
(both new, untracked, left in place for reproducibility).

**Tested:** Real run, full output captured. Connection succeeded; `
manager.get_all_tools()` returned all 7 tools
(`chad_mcp_health, cp_create_item, cp_find_recursively, cp_get_by_names,
cp_get_item, cp_get_many_by_name, cp_put_item`); verified none of their
`input_schema.properties` contains any key matching `repo` (case-
insensitive) — the structural guarantee behind §5 below.

**Status: DONE**

# Task 2 — `chad_mcp_health`

**Requested:** A diagnostic tool confirming the server is up, its version/
protocol, dependency availability, environment mode, and CP/DBA
readiness — no secrets.

**Done:** `packages/mcp/src/tools/health.ts` — resolves identity (if
configured), probes real connectivity via `getItemByAddress(repoGuid)`,
reports `{ok, server, version, mcpProtocolVersion, environment, transport,
mutationsAllowed, identityConfigured, dba: {status, detail}}`. Never
returns connection strings or the resolved repoGuid itself.

**Files changed:** `packages/mcp/src/tools/health.ts`,
`packages/mcp/src/version.ts`.

**Tested:** Unit/protocol (`protocol-smoke.test.ts`: health works with no
identity configured, `dba.status: "not_configured"`, no network needed).
Real, via Odyseusz: `dba.status: "ready"`, `detail: "Resolved identity
\"test3\" and read its repo root via the configured primary backend."`
(full JSON in the real run's stdout — see Task 1's test script output,
step [3]).

**Status: DONE**

# Task 3 — Real reads on test3

**Requested:** Odyseusz reads a known test CpItem for real.

**Done:** `cp_get_item`/`cp_get_by_names`/`cp_get_many_by_name`/
`cp_find_recursively`, each delegating to the matching existing `dba`
function (`getItemByLoca`/`resolveByNames`/`getChildrenOf`+filter/
`findRecursively` — see `03_knowledge.md` for why `cp_get_many_by_name`
filters rather than calling a same-named provider method that no longer
exists post-Story-72).

**Files changed:** `packages/mcp/src/tools/get-item.ts`,
`get-by-names.ts`, `get-many-by-name.ts`, `find-recursively.ts`,
`packages/mcp/src/cp-output.ts`.

**Tested:** `integration.test.ts` (real QNAP Postgres, test3) — reads the
real repo root and its real `views` child, an existing name lookup, a
non-existent name lookup (0 results, not an error), and a real recursive
search hit (`story78-seed` marker from Story 78's provisioning). Real, via
Odyseusz: read the repo root (`name: "test3"`) and `views` child — output
captured in the run log.

**Status: DONE**

# Task 4 — Real create + edit + read-after-write on test3 only

**Requested:** Create or edit an item on test2/test3 only (never
pawel_f/kamil_s), then re-read it and confirm the saved content.

**Done:** `cp_create_item` (`packages/mcp/src/tools/create-item.ts`) —
atomic find-or-create via `dba`'s `createOrGetChild` (never a separate
non-atomic write; a found-not-created item's body is provably untouched,
verified by a dedicated test). `cp_put_item`
(`packages/mcp/src/tools/put-item.ts`) — overwrites body only after
verifying the caller's stated `type`/`name` match the existing item's real
identity, refusing otherwise. Both only ever registered when
`MCP_ALLOW_MUTATIONS=true`, which `config.ts` only allows for
`MCP_ENVIRONMENT=local` + `MCP_TEST_USERNAME=test3` (hard error otherwise —
no other username can ever reach this code path).

**Files changed:** `packages/mcp/src/tools/create-item.ts`,
`put-item.ts`, `packages/mcp/src/identity.ts`, `packages/mcp/src/config.ts`.

**Tested:** `integration.test.ts` — create+read-back, create-on-existing-
name-leaves-body-untouched, put+read-after-write, put-refused-on-identity-
mismatch (with a follow-up read proving the body really was left
unchanged). Real, via Odyseusz: created
`odysseus-story97-<timestamp>` under test3's repo root with body "... v1",
edited it to "... v2 EDITED", re-read it — body matched exactly
(`assert reread_payload["body"] == content_v2` in the test script, which
passed). No pawel_f/kamil_s data touched at any point (structurally
impossible — see Task 5).

**Status: DONE**

# Task 5 — Cross-user isolation

**Requested:** A blocked attempt to escape the assigned repo context, and
a dedicated cross-user isolation test.

**Done:** No tool's input schema has a `repo`/`repoGuid` field at all —
every address is built server-side as `<resolved-repoGuid>/<client-
supplied loca>`, and `loca` is validated against a strict numeric-segments-
only pattern (`cp-output.ts`'s `isValidLoca`) that a real GUID (letters,
hyphens) can never satisfy. Mutating tools additionally call
`assertWithinConfiguredRepo` (anchored `startsWith(repoGuid + "/")` check,
same anchoring lesson as `test3-guard.ts`/`cp-history.ts`) before writing.

**Files changed:** `packages/mcp/src/identity.ts`,
`packages/mcp/src/cp-output.ts`.

**Tested:** Unit (`identity.test.ts`'s anchoring cases, incl. a GUID that
merely shares a string prefix with the configured repo). Integration
(`integration.test.ts`'s cross-user-isolation `describe` block: pawel_f's
real repoGuid as a `loca` → `VALIDATION`, not data; a name equal to that
same GUID via `cp_get_by_names` → `NOT_FOUND`, never a leak). Real, via
Odyseusz: `cp_get_item` called with `loca` set to pawel_f's real repoGuid
+ "/03" → server returned `[VALIDATION] loca must be empty or numeric
segments...` — the test script asserts this and the run printed "OK —
blocked" before proceeding.

**Status: DONE**

# Task 6 — Streamable HTTP transport

**Requested:** Implement the current MCP HTTP transport (not legacy SSE)
with a secure local scope, and prepare (without executing) what ChatGPT
integration would need later.

**Done:** `packages/mcp/src/http.ts` — `StreamableHTTPServerTransport`
behind a plain Node `http` server, one `/mcp` path, static bearer-token
auth (`MCP_HTTP_AUTH_TOKEN`) checked before any MCP message is processed —
config refuses to start the HTTP entrypoint at all without a token set.
ChatGPT-readiness documented explicitly as NOT done in
`ai-docs/mcp/architecture.md` §10 (checklist for a future OAuth-based
version, no account/endpoint configured, per the Input's own explicit
"nie konfiguruj mojego konta ChatGPT" boundary).

**Files changed:** `packages/mcp/src/http.ts`.

**Tested:** Manual `curl` smoke test (not part of the automated suite —
requires a live listening port): request without `Authorization` →
`401 {"error":"UNAUTHORIZED"}`; request with the correct bearer token →
valid MCP `initialize` response (`protocolVersion: "2025-06-18"`,
`serverInfo: {name:"chad-mcp", version:"1.0.0"}`). Full commands/output in
this Story's session log (see `06_others_from_report.md`).

**Status: DONE**
