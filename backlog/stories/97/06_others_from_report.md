# Story 97 — Others from report

## Story renumbering (96 → 97)

This Story was first created as `backlog/stories/96/`. Mid-research, a
parallel Claude Code session (running concurrently in the same working
directory — this repo has no worktree isolation between sessions, a known,
documented condition) claimed the same next-available number for an
unrelated task ("Cursor — Knowledge zasilane przez cp_items z repo
chad_shared") and overwrote `96/01_input.md` before this Story's own
`02_plan.md` existed yet. Per this repo's own rule against ever reverting
another session's concurrent work, this Story was renumbered to 97 (the
next free number once the collision was noticed) rather than touching
`96/` a second time; `96/01_input.md` was left exactly as the other
session wrote it, and this Story's own input/plan were moved intact into
`97/`. That other Story (Knowledge) was committed independently
(`a21c9d7 feat(knowledge): drive Knowledge from cp_items in shared
chad_shared repo (Story 96)`) before this Story's own commit — no file
conflict occurred between the two.

## Architectural decisions

- **Identity source deviated from the original plan.** The plan initially
  called for `dba`'s `resolveOwnRepo(username)`. Live investigation showed
  that function depends on the legacy Content Provider `/invoke` HTTP API
  (`getAllRepos()`), which is confirmed removed from the current local
  Docker stack and not buildable via the current build pipeline. Switched
  to reading `chad_admin/users/users-list` directly (`dba`'s
  `getUsersListBody()`) — the same source the dashboard's own login flow
  uses, routed through the current Postgres primary. See
  `03_knowledge.md`/`architecture.md` §3 for the full trail.
- **Did not edit `packages/dba/src/index.ts`.** The minimal, correct fix
  would have been adding a small shared `findUserByUsername`-equivalent to
  `dba` itself (avoiding a duplicate lookup with
  `packages/dashboard/lib/user-service.ts`'s own copy). That file was
  under active concurrent edit by the parallel Knowledge-story session at
  the exact time this Story needed it (`git diff --stat` showed 2 lines
  added mid-session). Chose to duplicate the ~15-line YAML lookup inside
  `packages/mcp/src/identity.ts` instead, explicitly documented as a
  deliberate, small duplication rather than touching a file under
  concurrent edit. **Follow-up proposal:** once both Stories are merged,
  consider extracting a shared `findUserRepoGuid(username)` into `dba`
  and having both `user-service.ts` and `identity.ts` call it, removing
  the duplication.
- **`cp_get_many_by_name` filters instead of calling a same-named
  method.** No `getManyByName` exists on the current provider interface —
  consolidated into `getChildren` during the Story 72 migration. Documented
  in `architecture.md` §4.1 so a future reader doesn't go looking for a
  method that doesn't exist.

## Local Docker

**Not rebuilt — not required.** `packages/mcp` is a standalone Node
process invoked by an external MCP client (stdio spawn) or run as its own
short-lived HTTP listener; it has no Dockerfile and is not part of
`docker-compose.local.yml`'s Dashboard/Postgres/Mongo stack. It only reads
FROM the already-running Postgres (local Mac Docker's own container is
irrelevant here — MCP is deliberately pointed at the real QNAP Postgres via
`.env.mcp`, matching test3's actual provisioned data, not a separate local
sandbox). Confirmed no other package/script assumes MCP is part of the
Docker runtime.

## Streamable HTTP manual smoke test (raw output)

```
$ TOKEN=$(grep '^MCP_HTTP_AUTH_TOKEN=' .env.mcp | cut -d= -f2-)
$ MCP_TRANSPORT=http node packages/mcp/dist/http.js &
$ curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:8420/mcp \
    -H "Content-Type: application/json" -d '{}'
401
$ curl -s -X POST http://127.0.0.1:8420/mcp \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl-smoke","version":"0.0.0"}}}'
event: message
data: {"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{"listChanged":true}},"serverInfo":{"name":"chad-mcp","version":"1.0.0"}},"jsonrpc":"2.0","id":1}
```

## Real Odyseusz acceptance test — full log

Ran twice: first run surfaced a real bug (dotenv 17's "injected env" banner
writing to **stdout**, corrupting the stdio JSON-RPC channel — the Python
MCP client logged one `Failed to parse JSONRPC message from server` for
that exact line, though the rest of the run still succeeded because every
subsequent line was valid). Fixed with `dotenv.config({ ..., quiet: true
})` in `packages/mcp/src/config.ts`. Second run, clean, zero parse errors:

```
[1] Connecting to CHAD MCP over stdio (real spawn: node dist/stdio.js) ...
    connected OK.

[2] Listing tools ...
    ['chad_mcp_health', 'cp_create_item', 'cp_find_recursively', 'cp_get_by_names', 'cp_get_item', 'cp_get_many_by_name', 'cp_put_item']
    OK — no tool exposes a model-controlled repo/repoGuid parameter.

[3] Calling chad_mcp_health ...
--- chad_mcp_health ---
{
  "ok": true, "server": "chad-mcp", "version": "1.0.0",
  "mcpProtocolVersion": "2025-11-25", "environment": "local",
  "transport": "stdio", "mutationsAllowed": true, "identityConfigured": true,
  "dba": {"status": "ready", "detail": "Resolved identity \"test3\" and read its repo root via the configured primary backend."}
}

[4] Reading a known test3 CpItem (repo root, loca="") ...
--- cp_get_item (root) --- { "name": "test3", "type": "Folder", ... }
--- cp_get_by_names([views]) --- { "name": "views", "type": "Folder", ... }

[5] Creating a new item on test3 only ...
--- cp_create_item ---
{ "name": "odysseus-story97-1785461522", "body": "...v1", "contentApplied": true, ... }

[6] Editing that item (loca=18) ...
--- cp_put_item --- { "body": "...v2 EDITED", ... }

[7] Re-reading to confirm the saved content (read-after-write) ...
--- cp_get_item (after edit) --- { "body": "...v2 EDITED", ... }
    OK — read-after-write content matches exactly.

[8] Attempting to escape test3's repo context (cross-user isolation) ...
--- cp_get_item (escape attempt) ---
[VALIDATION] loca must be empty or numeric segments separated by "/", e.g. "03/21/05" — got "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03".
    OK — blocked (structurally: loca isn't a valid absolute address at all).

[9] Disconnecting ...
    disconnected.

=== ALL ODYSSEUS ACCEPTANCE CHECKS PASSED ===
```

No secrets or other users' data appear in server logs during this run
(server logging is stderr-only, redacted — `packages/mcp/src/logging.ts`).

## Follow-up proposals (not implemented, out of scope for this Story)

- Extract `findUserRepoGuid(username)` into `dba` proper (see above),
  removing the small duplication between `identity.ts` and
  `packages/dashboard/lib/user-service.ts`.
- Real OAuth-based identity for the HTTP transport (§10 of
  `architecture.md` — explicitly deferred, no ChatGPT account/endpoint
  configured per the Input's own boundary).
- `test2` currently has no code-level guard/constant (unlike `test3`) —
  if a second parallel-safe test identity is ever needed, provision it the
  same way `test3` was (Story 78) rather than improvising.
