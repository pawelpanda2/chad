# CHAD MCP server — architecture

Status: Story 97 (2026-07-31). Pierwsza implementacja — `packages/mcp`.

## 1. Rola

`packages/mcp` udostępnia agentom AI (Odyseusz lokalnie, docelowo ChatGPT
zdalnie) kontrolowany, izolowany po repoGuid dostęp do `CpItem` — bez
tworzenia nowego modelu danych, bez bezpośredniego dostępu do PostgreSQL/
Mongo/plików Content Providera. Jest cienką warstwą wejściową nad już
istniejącą warstwą `dba`.

```
Odyseusz / ChatGPT / inny klient MCP
  → transport MCP (stdio | Streamable HTTP)
  → walidacja wejścia (zod) + identity/repo-scope guard
  → handler narzędzia MCP (packages/mcp/src/tools/*.ts)
  → dba (packages/dba/src/item-ops.ts — publiczny, transport/backend-agnostyczny)
  → DbaDataRouter → primary provider (Postgres)
```

## 2. Zależności — czego `packages/mcp` NIE robi

- brak importów `pg`/`mongodb` (zweryfikowane statycznym testem,
  `no-direct-provider-access.test.ts`);
- brak importów `packages/dba/src/data-providers/*` ani
  `packages/content-provider/*` — tylko publiczny barrel `dba`;
- brak własnej implementacji `Put`/`PostParentItem`/wyszukiwania — każde
  narzędzie woła istniejącą funkcję `dba`, nigdy nie duplikuje jej logiki
  (patrz tabela w §4);
- brak przyjmowania `repoGuid` jako argumentu żadnego narzędzia (patrz §5).

## 3. `CpItem` — który kontrakt jest aktualny

Prompt tego Story wskazywał
`packages/content-provider/common/src/contracts.ts`'s
`interface CpItem { Body, Config, Settings, Address }` jako punkt
odniesienia. To nadal poprawny, obowiązujący kontrakt — ale jest to
kontrakt **warstwy providera** (co musi zaimplementować `cp-files`/
`cp-mongo`/`cp-postgre`/`cp-net-adapter`), nie tego, czego używa reszta
aplikacji. Aktualny, żywy model to
`packages/dba/src/cp-model.ts`'s `CpItem { _id, config: { id, address,
type, name, ...free-form }, body }` (lowercase) — ten sam typ, którego
używają `dashboard`/`console`/każda funkcja biznesowa w `dba`.
`packages/mcp/src/cp-output.ts`'s `toCpItemOutput()` mapuje to na płaski
JSON (`id/address/type/name/config/body`) i dołącza `legacyFieldNote` z
odpowiednikiem starych nazw pól — nigdy nie reanimuje starego kształtu
`{Body,Config,Settings,Address}` jako realnego wyjścia narzędzia.

## 4. Narzędzia MCP

| Narzędzie | Semantyka | `dba` call | Mutuje? |
|---|---|---|---|
| `chad_mcp_health` | diagnostyka: wersja/protokół, tryb, gotowość dba | `getItemByAddress` (probe, tylko gdy identity skonfigurowana) | nie |
| `cp_get_item` | odczyt po `loca` względem repo wywołującego | `getItemByLoca` | nie |
| `cp_get_by_names` | odczyt po sekwencji nazw logicznych od korzenia | `resolveByNames` (odpowiednik `GetByNames`) | nie |
| `cp_get_many_by_name` | wszystkie dzieci `parentLoca` o nazwie `name` | `getChildrenOf` + filtr `config.name` (patrz §4.1) | nie |
| `cp_find_recursively` | wyszukiwanie substring w body, rekurencyjnie od `rootLoca` | `findRecursively` | nie |
| `cp_put_item` | nadpisanie body istniejącego itemu (identity musi się zgadzać) | `getItemByAddress` + `putItemBody` | **tak** |
| `cp_create_item` | find-or-create dziecka pod istniejącym parentem | `getItemByAddress` + `createOrGetChild` (odpowiednik `PostParentItem`) | **tak** (może) |

### 4.1. `cp_get_many_by_name` — dlaczego filtr, nie osobna metoda

Legacy `IManyItemsWorker.GetManyByName(repoGuid, parentLoca, name)` nie ma
dziś bezpośredniego odpowiednika na `CpCompatibleDataProvider`/
`DbaDataRouter` — podczas migracji providerów (Story 72) skonsolidowano to
do ogólnego `getChildren(parentAddress)`. `cp_get_many_by_name` woła więc
`getChildrenOf` (jedyne współdzielone "wylistuj dzieci folderu") i filtruje
wynik po `config.name === name` w warstwie MCP — to filtrowanie już
pobranego wyniku, nie reimplementacja odczytu/przeszukiwania.

### 4.2. `cp_create_item` — atomowość

`createOrGetChild(parent, name, type, content)` jest jednym, atomowym
wywołaniem: jeśli dziecko nie istnieje, jest tworzone z `content` jako
początkowym body (jeden zapis); jeśli już istnieje, jest zwracane
**niezmienione** — `content` nigdy nie nadpisuje istniejącego body drugim,
osobnym zapisem. Wynik zawiera `contentApplied: boolean`, żeby wywołujący
wiedział, która gałąź się wydarzyła, bez potrzeby zgadywania.

### 4.3. `cp_put_item` — ochrona tożsamości

Wejście wymaga `type`+`name` (oprócz `loca`+`content`) — narzędzie
odczytuje istniejący item i odrzuca zapis (`VALIDATION`), jeśli
`type`/`name` się nie zgadzają z rzeczywistością. To zabezpieczenie przed
sytuacją, w której model błędnie wierzy, że edytuje jeden item, a pod
`loca` jest w rzeczywistości coś innego.

### 4.4. Usuwanie

Brak narzędzia do usuwania. `DeleteWorker.Delete` w Content Providerze
pozostaje niedziałającym stubem w całym projekcie (istniejąca, potwierdzona
wiedza) — zgodnie też z wyraźnym ograniczeniem zakresu tego Story.

## 5. Identity / repo context

**Nikt nie przekazuje `repoGuid` jako argumentu narzędzia.** Żaden zod
schema w `packages/mcp/src/tools/*.ts` nie ma pola `repo`/`repoGuid` — to
zweryfikowane zarówno testem protokołu
(`protocol-smoke.test.ts`: "no tool's input schema exposes a repoGuid
parameter"), jak i realnym testem Odyseusza (§8).

`packages/mcp/src/identity.ts`:

1. Czyta `MCP_TEST_USERNAME` z configu. Brak wartości albo wartość różna od
   dokładnie `"test3"` → `IdentityNotConfiguredError` (żadnego fallbacku).
2. Rozwiązuje repoGuid, czytając `chad_admin/users/users-list` przez `dba`'s
   `getUsersListBody()` (`packages/dba/src/admin-users.ts`) i parsując YAML
   (`js-yaml`) w poszukiwaniu wiersza `username: test3`. **Dlaczego nie
   `dba`'s `resolveOwnRepo()`** (`repo-access.ts`): ta funkcja woła
   `getAllRepos()` (`client.ts`), które trafia bezpośrednio do legacy
   Content Provider `/invoke` HTTP API — potwierdzone jako NIEobecne w
   aktualnym lokalnym stacku Docker
   (`docker-compose.local.yml`: "Content Provider (content-provider-api)
   removed from this stack") i niebudowalne obecnym pipeline'em
   (`bash-scripts/dashboard/03_local_mac_docker/02_build.sh` go nie
   zawiera). `chad_admin/users/users-list` to ta sama ścieżka, której
   używa dashboardowy login (`packages/dashboard/lib/user-service.ts`),
   przechodząca przez `item-ops.ts`/`DbaDataRouter` — działa na aktualnym
   primary backendzie (Postgres) bez dodatkowej infrastruktury.
3. Weryfikuje na żywo, że rozwiązany repoGuid faktycznie czyta się jako
   realny root itemu (`getItemByAddress(repoGuid)`) — nie ufa samemu
   stringowi z `users-list`.
4. Wynik jest cache'owany na czas życia procesu (jedna tożsamość na serwer).
5. Każde wywołanie narzędzia owija swoją logikę w `dba`'s
   `runWithRepoContext({ repoGuid, username }, fn)` — ten sam mechanizm
   (AsyncLocalStorage), którego już używa każdy route Dashboardu.
6. Narzędzia mutujące dodatkowo wołają `assertWithinConfiguredRepo(address,
   repoGuid)` — zakotwiczony check (`address === repoGuid` albo
   `address.startsWith(repoGuid + "/")`), ten sam wzorzec anchoringu co
   `test3-guard.ts`/`cp-history.ts`'s repo-isolation check (GUID dzielący
   tylko prefiks stringa NIE przechodzi).

**Dlaczego `test3`, nie `test2`:** `packages/dba/src/testing/test3-guard.ts`
to jedyna istniejąca, ustalona, strzeżona tożsamość testowa w tym repo
(`TEST3_REPO_GUID`/`TEST3_USERNAME`, używana w całym regresyjnym
zestawie Story 78+). `test2` istnieje w `users-list`, ale nie ma
odpowiadającego mu kodu-guarda ani ustalonej konwencji — użycie `test3`
jest spójne z istniejącym wzorcem, nie nowym wyborem. Uwaga:
`packages/mcp` NIE importuje stałej z `test3-guard.ts` (ten moduł jest
świadomie nieopublikowany poza testami `dba` — patrz jego własny
komentarz) — `identity.ts` niezależnie odtwarza ten sam repoGuid na żywo z
`users-list`.

## 6. Rozdzielenie odczytu i zapisu

- `cp_put_item`/`cp_create_item` są rejestrowane na serwerze **tylko**
  gdy `MCP_ALLOW_MUTATIONS=true` (i wymusza to dodatkowo
  `MCP_ENVIRONMENT=local` oraz `MCP_TEST_USERNAME=test3` —
  `config.ts`'s walidacja odmawia startu w innej kombinacji). Klient
  MCP w trybie odczytu nigdy nie zobaczy tych narzędzi w `tools/list`.
- Każde narzędzie ma `annotations.readOnlyHint`/`destructiveHint` zgodnie
  ze swoją semantyką (SDK MCP, `ToolAnnotations`).
- Opis narzędzia mutującego zaczyna się od `"MUTATES DATA"`.
- Brak masowego delete/replace/migracji — poza zakresem tego Story.

## 7. Transport: stdio

`packages/mcp/src/stdio.ts` — `StdioServerTransport` z oficjalnego SDK.
Cały logging idzie na **stderr** (`logging.ts`) — stdout jest zarezerwowany
wyłącznie dla protokołu JSON-RPC. **Ważna pułapka znaleziona realnym
testem Odyseusza:** `dotenv` (17.x) domyślnie pisze banner "injected env"
na **stdout**, co psuje kanał stdio — `config.ts` woła
`dotenv.config({ ..., quiet: true })` żeby to wyłączyć. Uruchomienie:
`pnpm mcp:stdio` (build + `node dist/stdio.js`) albo `pnpm mcp` (tsx, dev).

## 8. Transport: Streamable HTTP

`packages/mcp/src/http.ts` — `StreamableHTTPServerTransport` (aktualny
standard MCP, `2025-06-18`+; **nie** legacy HTTP+SSE — Odyseusz sam wspiera
Streamable HTTP, `src/mcp_manager.py`'s `_connect_http` →
`streamablehttp_client`, więc nie ma powodu kompatybilności wstecz).

Model auth **na ten etap**: pojedynczy statyczny bearer token
(`MCP_HTTP_AUTH_TOKEN`), wymagany na każdym requeście przed jakimkolwiek
przetworzeniem wiadomości MCP — brak anonimowego dostępu. To jawnie
**lokalny/dev zakres**, nie gotowość produkcyjna:

- jeden token = jedna tożsamość (ten sam `MCP_TEST_USERNAME` co stdio) —
  brak mapowania token → różni użytkownicy;
- brak rotacji/wygasania tokenu;
- brak TLS terminacji w samym serwerze (zakłada reverse proxy, jeśli
  wystawiane dalej niż `127.0.0.1`).

Zweryfikowane ręcznie (`curl`): request bez `Authorization` → `401`;
poprawny token → poprawna odpowiedź `initialize` (patrz
`backlog/stories/97/05_tasks_and_checklist.md`).

**Do zrobienia przed bezpiecznym wystawieniem do Internetu** (patrz §9) —
prawdziwy auth gateway (OAuth/per-token identity), TLS, rate limiting.

## 9. Konfiguracja Odyseusza (stdio)

Zob. `packages/mcp/.env.mcp.example` po pełną listę zmiennych. Kluczowe:

```
MCP_ENVIRONMENT=local
MCP_TEST_USERNAME=test3
MCP_ALLOW_MUTATIONS=true
DBA_PRIMARY_BACKEND=postgres
DBA_POSTGRES_ENABLED=true
DBA_MONGO_ENABLED=false
DBA_CONTENT_PROVIDER_ENABLED=false
POSTGRES_USER=chad
POSTGRES_DB=chad
POSTGRES_QNAP_PASSWORD=<z .env.local>
```

Odyseusz (`/Users/pawelfluder/03_synch/01_files_programming/11_other_python/odysseus`)
rejestruje serwery MCP w swojej własnej bazie SQLite
(`data/app.db`'s `mcp_servers`, `core/database.py`'s `McpServer`) —
zarządzane normalnie przez `POST /api/mcp/servers` (admin-only, wymaga
sesji), a w tym Story wstawione bezpośrednio przez ten sam model
SQLAlchemy (`register_chad_mcp.py`, zachowany lokalnie w repo Odyseusza —
patrz `backlog/stories/97/05_tasks_and_checklist.md` po pełny opis, wraz z
backupem bazy zrobionym przed zmianą). Wpis:

```
transport = "stdio"
command   = "node"
args      = ["<chad-repo>/packages/mcp/dist/stdio.js"]
env       = {}
```

`env` może zostać puste — `stdio.js` czyta własny `.env.mcp` bezpośrednio z
dysku (ścieżka wyliczona z `__dirname`, niezależnie od cwd/env procesu
nadrzędnego), nie z dziedziczonego env.

## 10. Przygotowanie do ChatGPT (Streamable HTTP)

**Nic z tego nie zostało wykonane w tym Story** — brak zgody
użytkownika na konfigurację jego konta ChatGPT/wystawienie publicznego
endpointu. Poniżej checklist dla kogoś, kto będzie to podłączał:

1. Uruchom transport HTTP: `pnpm mcp:http` (wymaga `MCP_TRANSPORT=http`,
   `MCP_HTTP_AUTH_TOKEN` ustawionego w `.env.mcp`).
2. Model auth wymagany przez ChatGPT: realny OAuth 2.1 (Dynamic Client
   Registration albo skonfigurowany klient) — **nie** ten Story'ego
   statyczny bearer token, który jest tylko lokalnym/dev zakresem (§8).
   SDK MCP ma wbudowane wsparcie dla auth providerów
   (`@modelcontextprotocol/sdk/server/auth/*`) — nieużyte w tym Story.
3. Adres endpointu (placeholder): `https://<twoja-domena>/mcp` — za reverse
   proxy z TLS (NPM na QNAP, per istniejąca wiedza projektu), nigdy
   bezpośrednio `127.0.0.1:8420` wystawione publicznie.
4. Checklist podłączenia klienta ChatGPT: zarejestruj connector w ustawieniach
   ChatGPT → wskaż `https://<domena>/mcp` → przejdź przez OAuth flow (do
   zaimplementowania) → zweryfikuj `tools/list` w UI ChatGPT.
5. Lista narzędzi i opisów: patrz §4 tej strony (opisy narzędzi są też
   widoczne w samym `tools/list`).
6. Smoke test niezależnym klientem MCP: oficjalny **MCP Inspector**
   (`npx @modelcontextprotocol/inspector`) — połącz się z
   `http://127.0.0.1:8420/mcp` + nagłówek `Authorization: Bearer <token>`,
   sprawdź `initialize`/`tools/list`/`chad_mcp_health`. (Nie zastępuje testu
   Odyseusza — patrz §11 — ale jest dobrym pierwszym krokiem diagnostycznym
   dla nowego klienta.)
7. Co zostaje do zrobienia przed bezpiecznym wystawieniem do Internetu:
   - prawdziwy OAuth/auth gateway z per-tożsamość mapowaniem na repoGuid
     (nie jedna serwerowa tożsamość `test3`);
   - TLS terminacja (reverse proxy);
   - rate limiting / abuse protection;
   - decyzja o tym, którego użytkownika dane ChatGPT w ogóle może czytać
     (na pewno nie `test3` produkcyjnie — to tożsamość testowa).

## 11. Testy

`pnpm mcp:test` (build + `vitest run packages/mcp/src`) — 9 plików, 79
testów, wszystkie PASS:

- **Unit** (bez sieci): `config.test.ts`, `logging.test.ts`,
  `cp-output.test.ts`, `errors.test.ts`, `identity.test.ts` (guard rails +
  anchoring cross-user check), `no-direct-provider-access.test.ts`
  (statyczny grep źródeł).
- **Protocol** (in-memory transport, bez sieci):
  `protocol-smoke.test.ts` — `initialize`, `tools/list` (w tym: brak
  narzędzi mutujących gdy `MCP_ALLOW_MUTATIONS` fałsz; brak parametru
  `repo*` w żadnym schemacie), `chad_mcp_health`, błędy walidacji.
- **Integration** (real QNAP Postgres, test3;
  `describe.skipIf` gdy brak `.env.mcp`): `integration.test.ts` — każde
  narzędzie odczytu, `cp_create_item`/`cp_put_item` + read-after-write,
  find-or-create bez nadpisania istniejącej treści, cross-user isolation
  (próba użycia realnego repoGuid `pawel_f` jako `loca` — odrzucona jako
  `VALIDATION`, strukturalnie, nie przez filtr runtime).
- **Real stdio** (spawn realnego procesu, oficjalny klient SDK):
  `stdio-smoke.test.ts`.
- **Realny Odyseusz** (nie vitest — patrz §12).

## 12. Realny test Odyseusza — dowód

Wykonany `src/mcp_manager.py`'s `McpManager` bezpośrednio (ten sam kod,
którego używa `routes/mcp_routes.py` w prawdziwej appce Odyseusza) —
skrypt `test_chad_mcp_from_odysseus.py` w repo Odyseusza. Pełny log i
wynik: `backlog/stories/97/05_tasks_and_checklist.md`. Skrót:

- connect (real stdio spawn) — OK;
- `tools/list` — 7 narzędzi, żadne bez parametru `repo*` — OK;
- `chad_mcp_health` — `dba.status: "ready"` — OK;
- `cp_get_item`/`cp_get_by_names` na znanym itemie test3 — OK;
- `cp_create_item` + `cp_put_item` + odczyt-po-zapisie — treść zgodna — OK;
- próba eskalacji poza repo test3 (realny GUID `pawel_f` jako `loca`) —
  zablokowana (`[VALIDATION]`) — OK;
- disconnect — OK.

W trakcie tego testu znaleziony i naprawiony realny bug (dotenv → stdout,
§7) — dowód, że to był faktyczny test protokołu, nie tylko happy-path.

## 13. Troubleshooting

- **`IDENTITY_NOT_CONFIGURED` na każdym `cp_*` tool call** — sprawdź
  `MCP_TEST_USERNAME=test3` w `.env.mcp`, i że `chad_admin/users/users-list`
  jest czytelne (sam `chad_mcp_health` to potwierdzi w polu `dba`).
- **`chad_mcp_health` zwraca `dba.status: "error"`** — zwykle brak/zły
  `POSTGRES_QNAP_PASSWORD` albo QNAP niedostępny przez Tailscale
  (`nc -z 100.117.139.83 12042`).
- **Klient stdio nie potrafi sparsować pierwszej wiadomości** — coś pisze
  na stdout przed startem transportu; sprawdź, czy nie doszła nowa
  zależność z własnym "friendly banner" (jak dotenv, §7) — dodaj opcję
  wyciszającą albo przekieruj jej output.
- **`cp_put_item` zwraca `VALIDATION` "Identity mismatch"** — to zamierzone
  zachowanie (§4.3), nie bug — sprawdź, czy `type`/`name` w argumentach
  faktycznie zgadzają się z aktualnym stanem itemu (`cp_get_item` najpierw).
