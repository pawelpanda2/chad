# MCP docs — od czego zacząć

Status: utworzone 2026-07-31 (Story 97). Ten dokument jest **wyłącznie
indeksem kolejności czytania** dla `ai-docs/mcp/` — analogiczny do
`ai-docs/beeper/ai-start.md`/`ai-docs/google-sheets/ai-start.md`, scoped do
`packages/mcp` (serwer MCP CHAD — kontrolowany dostęp AI agentów do
CpItem).

Jeśli pracujesz nad czymkolwiek w `packages/mcp` — przeczytaj ten plik
PRZED czymkolwiek innym w tym katalogu.

## 0. Zanim zaczniesz — wiążące decyzje architektoniczne (Story 97)

1. **`packages/mcp` nie tworzy nowego modelu danych ani nowej warstwy
   CRUD.** Każde narzędzie MCP woła wyłącznie publiczne funkcje `dba`
   (`item-ops.ts`: `getItemByLoca`, `resolveByNames`, `getChildrenOf`,
   `findRecursively`, `createOrGetChild`, `putItemBody`) — nigdy
   `packages/content-provider/*` bezpośrednio, nigdy providera
   (`data-providers/*`) bezpośrednio, nigdy surowego SQL/Mongo drivera.
   Zweryfikowane statycznym testem
   (`packages/mcp/src/no-direct-provider-access.test.ts`).
2. **`CpItem` nie jest kopiowany.** Typ importowany z `dba`
   (`cp-model.ts`'s `{ _id, config, body }` — **aktualny**, nie legacy
   uppercase `{Body,Config,Settings,Address}` z
   `packages/content-provider/common/src/contracts.ts`, który jest
   kontraktem providera, a nie tym, czego używa dziś reszta aplikacji).
   `packages/mcp/src/cp-output.ts` mapuje to na płaski JSON zwracany przez
   narzędzia, z notatką o odpowiedniku starych nazw pól.
3. **Tożsamość jest jedna, serwerowa, nigdy sterowana przez model.**
   `packages/mcp/src/identity.ts` — zablokowana na `MCP_TEST_USERNAME=test3`,
   repoGuid rozwiązywany na żywo z `chad_admin/users/users-list` (przez
   `dba`'s `getUsersListBody()`, nie przez legacy `/invoke` API — patrz
   `architecture.md` §3 po pełne uzasadnienie tej decyzji). Żadne narzędzie
   nie przyjmuje `repoGuid`/`repo` jako argumentu.
4. **Odczyt i zapis są strukturalnie rozdzielone.** `cp_put_item`/
   `cp_create_item` są w ogóle NIE rejestrowane na serwerze, jeśli
   `MCP_ALLOW_MUTATIONS` nie jest `true` — klient nie zobaczy ich nawet w
   `tools/list`, nie tylko "ukryte/no-op".
5. **Legacy Content Provider `/invoke` API nie jest częścią lokalnego stacku
   Docker** (`docker-compose.local.yml`: "Content Provider
   (content-provider-api) removed from this stack") — dlatego identity
   resolution NIE używa `dba`'s `resolveOwnRepo()`/`getAllRepos()` (które
   tego API wymagają), tylko `chad_admin/users/users-list`, który przechodzi
   przez `item-ops.ts`/`DbaDataRouter` jak każda inna operacja domenowa
   (działa na aktualnym primary backendzie — Postgres).

## 1. Kolejność czytania

1. **[architecture.md](architecture.md)** — GŁÓWNY dokument: rola package'u,
   architektura i zależności, lista narzędzi + kontrakty I/O, identity/repo
   context, transport stdio, transport HTTP, konfiguracja Odyseusza,
   przygotowanie ChatGPT, bezpieczeństwo mutacji, testy, troubleshooting.
2. **[`backlog/stories/97/`](../../backlog/stories/97/)** — pełna historia
   implementacji: co zostało zweryfikowane w aktualnym repo przed pisaniem
   kodu (kontrakt CpItem, publiczne entrypointy `dba`, konwencja env,
   identyfikacja Odyseusza), decyzje projektowe i ich uzasadnienie, realny
   log testu Odyseusza.

## 2. Gdzie żyje kod

- `packages/mcp/src/config.ts` — ładowanie/walidacja env (`.env.mcp`).
- `packages/mcp/src/identity.ts` — rozwiązanie tożsamości + guard repo-scope.
- `packages/mcp/src/tools/*.ts` — po jednym pliku na narzędzie MCP.
- `packages/mcp/src/server.ts` — złożenie serwera (transport-agnostic).
- `packages/mcp/src/stdio.ts` / `http.ts` — entrypointy transportu.
- `packages/mcp/src/*.test.ts` — testy (uruchamiane przez root Vitest,
  `vitest.config.mjs`, oraz `pnpm mcp:test`).
