# Audyt: czy `chad-dba` nadaje się jako baza publicznego/półpublicznego API dla zewnętrznego frontendu w PHP

Status: audyt zakończony, **nic nie zaimplementowano** — czeka na decyzję właściciela co do kierunku (2026-07-12).

## 0. Kontekst i pytanie wyjściowe

Właściciel ma działający dashboard CHAD (Next.js). Kolega ma napisać alternatywny frontend w PHP i potrzebuje dostępu do danych **wyłącznie przez stabilne HTTPS API** — bez bezpośredniego dostępu do MongoDB, Dropboksa, repozytoriów plikowych ani SSH do QNAP-a. Docelowy adres: `https://api.chad.biz.pl`. Pytanie: czy `chad-dba` (obecnie samodzielne repo `chad-dba`, w trakcie migracji do `chad/packages/dba` — patrz `chad-monorepo-migration` w pamięci projektu) nadaje się na bazę tego API.

## 1. Czym jest `chad-dba` dzisiaj

**Czysta biblioteka TypeScript (npm package), nie serwer.** `package.json`: `"name": "chad-dba"`, `"main": "dist/index.js"`, brak zależności typu express/fastify/http-server, brak nasłuchującego portu, brak routingu. Kompiluje się przez `tsc` do `dist/` i jest konsumowana jako lokalna zależność (`"chad-dba": "file:../chad-dba"`) przez:
- **`chad-console`** (`content-finder`) — CLI (`tsx src/cli.ts`), narzędzie deweloperskie.
- **`chad-dashbord`** — aplikacja Next.js 15 (App Router), jedyny istniejący serwer HTTP w tym ekosystemie.

## 2. Jakie dane zwraca i przez jakie warstwy

`chad-dba` → HTTP POST `/invoke` na .NET Content Provider API (`CONTENT_PROVIDER_API_URL`) → Content Provider czyta pliki (`config.yaml`/`body.txt`) z repozytoriów plikowych na Dropboksie (aktualnie `chad-content-provider-api` czytający `/share/Dropbox` na QNAP-ie). To jest **generyczny, RPC-owy passthrough**: `invokeContentProvider(args: string[])` (`src/client.ts`) wysyła surową tablicę argumentów w stylu `["IRepoService", "IItemWorker", "GetByNames"/"Put"/"PostParentItem"/..., repoId, ...]` i zwraca to, co odda Content Provider, bez żadnego kontraktu/schematu pośrodku.

Moduły domenowe zbudowane na tym kliencie: `leads.ts` (leady, statusy, kontakty, "msg workout"), `beeper.ts` (konwersacje WhatsApp/beeper), `reports.ts`, `ai-answer.ts`, `statuses-dashboard.ts`, `path-resolver.ts` (rozwiązywanie nazw → numeryczne "loca"), `headers-parser.ts` (parser formatu tekstowego, czysto lokalny), `trace.ts`/`trace-collector.ts` (debug/dev-panel).

## 3. Czy istnieje już API HTTP / routing / kontrolery

**Nie w `chad-dba`.** Istnieje natomiast w `chad-dashbord`: `app/api/**/route.ts` — 20 route handlerów Next.js (leads, statuses, beeper, forms, auth, admin/users itd.). To jest jedyna warstwa HTTP w całym ekosystemie i jest wewnętrzna/administracyjna, nie publiczna.

## 4. Czy logika jest odseparowana od CLI na tyle, by dało się jej użyć w API bez duplikacji

**Tak, i to bardzo dobrze.** `chad-dba` nie zawiera nic specyficznego dla CLI ani dla Next.js — same funkcje domenowe zwracające dane/Promise. Sam Next.js już to potwierdza wzorcem "thin wrapper" (komentarz w kodzie: *"All business logic is encapsulated in chad-dba public functions. This endpoint is just a thin wrapper"*) — np. `app/api/leads-dashboard/route.ts` to 20 linii wywołujące `getAllLeadsWithContacts()` z `chad-dba` i owijające wynik w `NextResponse.json()`. Ten sam wzorzec da się 1:1 powtórzyć dla PHP-owego frontendu.

## 5. Zależności

- **Content Provider**: twardy wymóg — `CONTENT_PROVIDER_API_URL` musi być ustawiony, inaczej `client.ts` rzuca wyjątkiem już przy imporcie modułu.
- **MongoDB**: brak — potwierdzone wcześniej grepem w trakcie migracji do monorepo, `chad-dba`/`chad-dashbord` jej jeszcze nie używają w kodzie.
- **Dropbox**: pośrednio, przez Content Provider (chad-dba nie zna ścieżek plikowych, operuje na "loca"/adresach logicznych).
- **Lokalne ścieżki**: brak w `chad-dba` — to jest jego zaleta, jest "czysty".
- **Zmienne środowiskowe**: tylko `CONTENT_PROVIDER_API_URL` (przez `dotenv`).
- **QNAP**: brak bezpośredniej zależności — łączy się tylko przez URL do Content Providera, gdziekolwiek ten działa.

## 6. Czy kod jest bezpieczny do wystawienia poza sieć lokalną

**Nie, w obecnej formie zdecydowanie nie.** Kluczowy problem: `invokeContentProvider(args: string[])` to surowy, niekontrolowany kanał do generycznego RPC Content Providera. Gdyby ktoś (nawet nieumyślnie, np. przez błąd w warstwie API) przepuścił dowolne argumenty użytkownika do tej funkcji, otworzyłby dostęp do całego API Content Providera — łącznie z operacją `Put` (zapis dowolnej treści pod dowolnym "loca") i `FindRecursively` (przeszukiwanie całego drzewa repozytorium). `chad-dba` samo w sobie nie ma żadnej warstwy walidacji ani ograniczeń dostępu — ufa w 100% temu, co Content Provider dostanie.

## 7. Operacje administracyjne / destrukcyjne / zbyt szerokie

Tak, i jest ich sporo, np.:
- `putStatusContent`, `saveBeeperContactContent`, `saveDateEntry`, `saveDailyEntry`, `SaveAiAnswerToMsgWorkout` — **operacje zapisu** (`Put`) do repozytorium treści.
- `postItemByNames`, `createStatusForLead`, `createMsgWorkoutForLead` — **tworzenie nowych elementów** w drzewie (`PostParentItem`).
- Sam `invokeContentProvider` jako taki jest operacją "zbyt szeroką" — pozwala wywołać dowolną metodę dowolnego workera Content Providera (`IRepoService`/`IItemWorker`/`IManyItemsWorker`/`IMethodWorker`, dowolna metoda: `Get*`, `Post*`, `Put`, `FindRecursively`...). To jest de facto zdalne wykonanie dowolnej operacji na bazie danych, opakowane w JS.

Poza `chad-dba`, w `chad-dashbord` jest też `app/api/admin/users/route.ts` — zarządzanie kontami użytkowników dashboardu (bcryptjs + prisma/SQLite) — to zdecydowanie nie powinno być dostępne z zewnątrz.

## 8. Istniejące mechanizmy bezpieczeństwa

W `chad-dba`: **żadnych.** Brak autoryzacji, uwierzytelniania, walidacji wejścia, rate limitingu, CORS, wersjonowania. Jedyny "bezpiecznik" to hardcodowany `SHARED_REPO_ID` w kilku funkcjach domenowych (ale nie w samym `invokeContentProvider`).

W `chad-dashbord`: jest auth, ale **oparty o sesję cookie** (`middleware.ts`: sprawdza tylko *obecność* ciasteczka `session` dla ścieżek `/api/*`, weryfikacja treści dzieje się głębiej), logowanie hasłem (`bcryptjs`), zarządzanie użytkownikami. To jest model "przeglądarka + zalogowany człowiek", **nie** model "aplikacja kliencka z kluczem API" — nie ma tu koncepcji scope'ów, ról read-only, ani osobnych kont serwis-do-serwisu. CORS i rate limiting nigdzie nie widać skonfigurowanych.

## 9. Wystawić `chad-dba` wprost / dodać cienką warstwę HTTP / wydzielić `chad-api` / użyć istniejącego API

**Rekomendacja: dodać cienką, nową warstwę HTTP w stylu już istniejącego wzorca (`app/api/**/route.ts`), NIE wystawiać `chad-dba` bezpośrednio i NIE tworzyć od zera osobnego `chad-api`.**

- Wystawienie `chad-dba` "wprost" nie ma sensu — to nie jest serwer, nie ma czego wystawiać bez napisania warstwy HTTP.
- Osobny serwis `chad-api` (nowy proces, nowy deployment, nowy port, nowy kontener) to nadmiarowa robota na start — duplikowałby to, co `chad-dashbord` już ma (Next.js route handlers, middleware, env, Docker/QNAP setup). Ma sens **później**, jeśli PHP-owy frontend się rozrośnie i zacznie wymagać osobnego SLA/skalowania niezależnego od dashboardu.
- Najlepsza ścieżka: nowy zestaw **wersjonowanych, dedykowanych endpointów** (`/api/v1/public/...`, wystawionych pod `api.chad.biz.pl`) w `chad-dashbord`, chronionych **inną, nową warstwą auth** (API key/Bearer) niezależną od cookie-session middleware, wołających te same funkcje z `chad-dba`. Zero duplikacji logiki domenowej.

## 10. Potrzebne endpointy dla PHP

Startowy, bezpieczny zestaw (patrz sekcja 15) dałoby się zmapować na istniejące funkcje `chad-dba` niemal 1:1, np.:
- `GET /api/v1/leads` → `getAllLeadsWithContacts()` (odpowiednik `getStatusesDashboardList()` dla statusów)
- `GET /api/v1/leads/{leadKey}` → `getLeadDetailsWithWorkouts(leadName, leadLoca)`
- `GET /api/v1/leads/{leadKey}/contacts` → `getLeadContacts(leadName)`
- `GET /api/v1/leads/{leadKey}/beeper` (chat) → `chad_FindConversationByLeadName(leadName)`
- `GET /api/v1/reports` / `GET /api/v1/reports/{name}` → `GetReports()` / `GetReportByName()`
- `GET /api/v1/media/{id}` — **nie istnieje dziś nic równoważnego**, patrz sekcja 11.

Wszystkie wymagałyby nowego, cienkiego kontrolera — analogicznego do `app/api/leads-dashboard/route.ts` — ale z inną autoryzacją niż cookie session.

## 11. Multimedia z QNAP-a bez surowych ścieżek

Dziś **nie ma w ogóle mechanizmu serwowania mediów** w `chad-dba` ani w `chad-dashbord` (grep po `fs.`, `readFile`, `Dropbox`, `/share` w `app/`/`lib/` dashboardu — pusto). Content Provider zwraca body jako tekst (YAML/tekst), nie strumienie plików binarnych. Jeśli PHP ma dostawać zdjęcia/pliki, trzeba by:
- sprawdzić, czy .NET Content Provider (`packages/net-content-provider` — **poza zakresem tego audytu, obecnie w trakcie przepisywania**, patrz `project-net-content-provider-rewrite` w pamięci projektu) w ogóle ma dziś endpoint do pobierania surowej zawartości pliku;
- jeśli nie, dodać w nowej warstwie API endpoint `GET /api/v1/media/{id}`, który **proxuje** strumień z Content Providera (nigdy nie zwraca ścieżki na dysku ani linku bezpośrednio do Dropboksa/QNAP-a), z krótko żyjącym podpisanym URL-em lub tokenem jednorazowym, jeśli pliki są duże.

## 12. Osobny dostęp dla kolegi

Rekomendacja: **API key jako Bearer token**, osobna, statyczna tabela/konfiguracja kluczy (nie to samo co konto w systemie `admin/users` dashboardu), ze scope'em **read-only** na start, przypisany do jednej "aplikacji" (nie do człowieka). Trzymany po stronie PHP w zmiennej środowiskowej/configu, nigdy w repo. To najprostszy model, który nie miesza się z istniejącym systemem logowania-hasłem dla ludzi.

## 13. Wdrożenie na QNAP + istniejący Nginx Proxy Manager

Nie trzeba nic nowego budować infrastrukturalnie — na QNAP-ie już działa Nginx Proxy Manager (patrz `qnap-nginx-proxy-manager` w pamięci projektu), który obsługuje `chad.biz.pl` → `chad-dashboard-prod` (127.0.0.1:12030) i `test.chad.biz.pl` → `chad-dashboard-test` (127.0.0.1:12020). `api.chad.biz.pl` to po prostu **nowy host w NPM wskazujący na ten sam kontener dashboardu** (bo to te same route'y Next.js, inny prefiks/inna autoryzacja) — albo, jeśli zdecydujemy się na osobny proces, nowy kontener + nowy wpis w NPM, tym samym sprawdzonym flow co przy poprzednich domenach.

## 14. Test vs prod

Naturalnie po istniejącej konwencji (patrz `qnap-ports-and-tailscale` w pamięci projektu): `test.chad.biz.pl`/`api-test.chad.biz.pl` → kontener na porcie z zakresu 12020–12029, `api.chad.biz.pl` (prod) → 12030–12039. Zero nowej koncepcji do wymyślania — trzeba tylko dodać obsługę nowych route'ów do już istniejących kontenerów test/prod.

## 15. Ryzyka i najprostsza bezpieczna ścieżka

Główne ryzyko to **nie** "czy `chad-dba` się nada", tylko **żeby ktoś w nowej warstwie HTTP przez pomyłkę przepuścił surowe argumenty do `invokeContentProvider`** (np. wystawiając "generyczny" endpoint zamiast zestawu wąskich, dedykowanych). Drugie ryzyko: pomieszanie nowego mechanizmu API-key z istniejącym systemem kont/cookie — nie mieszać tych dwóch światów. Najprostsza bezpieczna ścieżka: wąski, jawnie wymieniony zestaw **read-only** endpointów, każdy wołający jedną konkretną, już istniejącą funkcję z `chad-dba` (nigdy `invokeContentProvider` bezpośrednio), za osobnym middleware sprawdzającym Bearer token.

## 16. Rekomendacja: TAK — `chad-dba` jako baza logiki (ale nie jako coś, co się "wystawia wprost")

`chad-dba` jest dobrze odseparowaną warstwą logiki domenowej, gotową do ponownego użycia bez duplikacji. Problemem nigdy nie było *to*, tylko brak jakiejkolwiek warstwy HTTP/autoryzacji nad nią — a to da się dodać tanio, bo wzorzec ("thin wrapper" route handler) już jest sprawdzony w `chad-dashbord`.

### Proponowana architektura

```
PHP frontend (kolega)
   │  HTTPS + Authorization: Bearer <api-key>
   ▼
api.chad.biz.pl  ──(NPM, istniejące)──►  chad-dashboard-{test|prod} (Next.js)
   │
   ├─ NOWE: middleware api-key (osobne od middleware sesji cookie)
   ├─ NOWE: app/api/v1/public/**/route.ts  (wąskie, dedykowane, read-only na start)
   │        każdy route = 1 istniejąca funkcja z chad-dba, zero invokeContentProvider bezpośrednio
   ▼
chad-dba (bez zmian w rdzeniu, może +1-2 nowe wąskie funkcje "dla API")
   ▼
Content Provider API (.NET) ──► Dropbox/QNAP pliki
```

### Minimalny plan wdrożenia (kroki)

1. Zdefiniować i spisać dokładny, wąski kontrakt endpointów (sekcje 10/15) — bez zapisu na start.
2. Dodać w `chad-dashbord` middleware weryfikujący `Authorization: Bearer <klucz>` dla prefiksu `/api/v1/public/*`, niezależny od cookie-session middleware.
3. Dodać `app/api/v1/public/**/route.ts` — po jednym cienkim route na endpoint, każdy wołający istniejącą funkcję `chad-dba`.
4. Wygenerować pierwszy klucz API dla kolegi, przechować go poza repo.
5. Dodać hosta `api.chad.biz.pl` (i `api-test.chad.biz.pl`) w NPM, wskazujący na te same kontenery co dziś.
6. Przetestować end-to-end z realnym żądaniem z PHP (albo curl) na test.
7. Dopiero po akceptacji: prod.

### Pliki/moduły do zmiany (gdy przejdziemy do implementacji)

- `chad-dashbord/middleware.ts` — nowa gałąź auth dla `/api/v1/public/*`.
- Nowy katalog `chad-dashbord/app/api/v1/public/**/route.ts`.
- Nowa tabela/config kluczy API (np. Prisma model albo plik konfiguracyjny — do ustalenia).
- Ewentualnie 1-2 nowe, wąskie funkcje w `chad-dba/src/` jeśli istniejące nie mapują się 1:1 na potrzeby PHP (np. do mediów).
- Konfiguracja NPM (przez jego API/UI, nie plik w repo).

### Czego NIE wolno udostępnić

- `invokeContentProvider` / jakikolwiek generyczny passthrough do Content Providera.
- Wszystkiego, co robi `Put`/`PostParentItem`/zapis (dopóki nie ma jawnej decyzji o rozszerzeniu poza read-only).
- `app/api/admin/users/**`, `app/api/auth/**` — zarządzanie kontami i sesjami dashboardu.
- Surowych ścieżek plikowych/Dropbox/QNAP.
- Bezpośredniego dostępu do MongoDB, SSH, plików repo Content Providera.

### Proponowany pierwszy, bezpieczny zakres read-only dla PHP

- `GET /api/v1/public/leads`
- `GET /api/v1/public/leads/{leadKey}`
- `GET /api/v1/public/leads/{leadKey}/contacts`
- `GET /api/v1/public/leads/{leadKey}/beeper` (treść konwersacji, bez mediów na start)
- `GET /api/v1/public/reports` / `GET /api/v1/public/reports/{name}`

Bez zapisu, bez endpointów admin/auth, bez mediów binarnych — te dwie ostatnie rzeczy dopiero po ustaleniu osobnego mechanizmu.

## 17. Uzupełnienie: architektura A (klienci → Content Provider bezpośrednio) vs B (klienci → warstwa na `chad-dba` → Content Provider)

Dodatkowe pytanie właściciela (2026-07-12): czy bezpieczniejszym rozwiązaniem byłoby niewystawianie Content Providera bezpośrednio do Internetu, i porównanie dwóch architektur:

```
A)                          B)
PHP / AI / Dashboard        PHP / AI / Dashboard
        ↓                           ↓
Content Provider            chad-dba (a właściwie: nowa cienka
                             warstwa HTTP osadzająca chad-dba,
                             patrz sekcja 16 — chad-dba samo
                             w sobie nie nasłuchuje na porcie)
                                     ↓
                             Content Provider
```

### Kluczowe odkrycie: Content Provider dziś nie ma żadnych zabezpieczeń

Sprawdzone w kodzie `packages/net-content-provider/api_charp/SharpContainerApi/Preparers/DefaultPreparer.cs` (`ConfigureWebApp()`) — to jedyny fakt-check w obrębie `net-content-provider` w tym audycie, celowo ograniczony do samego pytania o bezpieczeństwo ekspozycji, bez audytowania/proponowania zmian w tym mid-rewrite'owanym kodzie:

- **CORS: `AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()`** — dosłownie każda domena może wołać to API z przeglądarki.
- **Zero autoryzacji/uwierzytelniania** — brak `AddAuthentication`, `[Authorize]`, jakiegokolwiek middleware sprawdzającego cokolwiek. `POST /invoke` przyjmuje surowe `string[] args` i bezpośrednio wykonuje `argsService.Invoke(args)` — bez żadnego filtra, jednakowo łatwo dla operacji odczytu jak i zapisu (`Put`, `PostParentItem`).
- **Wycieki informacji przy błędach** — globalny error handler zwraca w JSON pełny `exceptionType`, `message`, **`stackTrace`** (łącznie z `innerException`) na każdy nieobsłużony wyjątek.
- **`GET /health`** ujawnia wewnętrzne ścieżki plikowe (`NoSqlRepoSearchPaths`) i ich dostępność na dysku.
- **Logowanie tylko przez `Console.WriteLine`** — trafia do logów kontenera Docker, bez struktury, bez tożsamości wołającego (bo nie ma auth) — nie da się odpowiedzieć na pytanie "kto to zrobił".

Wniosek: Content Provider w obecnej formie jest zaprojektowany jako usługa czysto wewnętrzna, zero-trust-unfriendly. To nie jest usterka do naprawienia w tym audycie — jest świadomie poza zakresem, w trakcie przepisywania — tylko fakt, który przechyla wybór architektury jednoznacznie.

### Porównanie A vs B

| Kryterium | A: bezpośrednio do Content Providera | B: przez warstwę na `chad-dba` |
|---|---|---|
| **Bezpieczeństwo** | Krytycznie złe — zero auth, otwarty CORS, `stackTrace` w błędach ujawnia strukturę kodu/ścieżek. | Content Provider zostaje osiągalny wyłącznie z zaufanej sieci wewnętrznej (Docker/QNAP), nigdy z Internetu; powierzchnia ataku to wąski, kontrolowany zestaw endpointów. |
| **Kontrola uprawnień** | Niemożliwa do zrobienia sensownie bez zmian wewnątrz CP, którego kod jest właśnie przepisywany (ruchomy cel). | Naturalna — uprawnienia i scope'y żyją w nowej warstwie Node/Next.js, niezależnie od cyklu życia CP. |
| **Zmiany w CP bez psucia klientów** | Brak izolacji — każda zmiana kształtu `/invoke`, nazw workerów/metod natychmiast psuje PHP/AI/dashboard. Szczególnie ryzykowne teraz, gdy CP jest przepisywane. | `chad-dba` + nowa warstwa to bufor kontraktu — zmiany wewnętrzne w CP (nawet rewrite) da się wchłonąć w jednym miejscu bez dotykania klientów. |
| **Wersjonowanie API** | Brak koncepcji wersji w CP (`/invoke` to jeden płaski endpoint RPC). | Wersjonowanie (`/api/v1/...`) naturalnie żyje w nowej warstwie HTTP, niezależnie od CP. |
| **Wydajność** | Teoretycznie o jeden hop mniej, ale marginalne — dashboard i tak dziś przechodzi przez `chad-dba`/Node. | Jeden dodatkowy hop w sieci wewnętrznej, pomijalne opóźnienie; otwiera możliwość agregacji wielu wywołań CP w jedną odpowiedź (mniej round-tripów dla PHP). |
| **Cache'owanie** | Brak jakiegokolwiek cache w CP — każdy klient uderza bezpośrednio w odczyt plików za każdym razem. | Naturalne miejsce na cache (w pamięci procesu, później Redis) dla danych rzadko zmienianych, bez modyfikowania CP. |
| **API Key / Bearer / poziomy uprawnień** | Musiałyby powstać wewnątrz CP — ryzykowna zmiana w kodzie mid-rewrite, poza bieżącym zakresem. | Naturalne miejsce: middleware w nowej warstwie (sekcja 16), całkowicie odseparowane od CP. |
| **Ograniczenie do read-only** | Niemożliwe do wymuszenia z zewnątrz — `/invoke` jednakowo łatwo przyjmuje `Get*` i `Put`/`PostParentItem`. | Trywialne — nowa warstwa świadomie implementuje tylko wybrane funkcje `chad-dba` bez zapisu, nigdy nie przekazuje surowych argumentów dalej. |
| **Logowanie i audyt wywołań** | Tylko `Console.WriteLine` w CP, bez tożsamości wołającego. | `chad-dba` już ma gotowy fundament: `trace.ts`/`trace-collector.ts` (per-request trace z `AsyncLocalStorage`: worker/method/args/duration/success), dziś używany do dev-panelu — naturalna baza pod pełny audyt "kto, co, kiedy", bo nowa warstwa zna tożsamość wołającego z klucza API. |

### Rekomendacja: **B — nigdy nie wystawiać Content Providera bezpośrednio do Internetu**

Content Provider ma dziś zero mechanizmów bezpieczeństwa (otwarty CORS, brak auth, surowy RPC przyjmujący też zapis, wycieki stack trace) i jest w trakcie przepisywania — dodawanie tam czegokolwiek teraz jest ryzykowne i nietrwałe. Wariant B kosztuje tyle samo co "dodanie cienkiej warstwy HTTP" (sekcja 16) — to ta sama rekomendowana architektura, z twardym potwierdzeniem, że wariant A nie jest realną opcją, tylko ryzykiem bezpieczeństwa.

## 18. Kolejny krok

Właściciel ma potwierdzić kierunek: rozszerzenie `chad-dashbord` o nowy prefiks `/api/v1/public/*` z osobnym auth (rekomendowane) vs. osobny serwis `chad-api`. Dopiero po decyzji — implementacja.
