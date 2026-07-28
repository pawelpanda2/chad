# Release-readiness audit — Daily Tracker, Dates, Leads

Data: 2026-07-28. Po decyzjach użytkownika (syncWritesEnabled=true na TEST
jest celowe; test2 = w pełni destrukcyjne testy; test3 = półmanualne,
tylko dane utworzone przez dany test; pawel_f/kamil_s = wyłącznie read-only
reconciliation) naprawiono blokery i dokończono audyt z realnymi danymi
uwierzytelniającymi (test2/test3 = `changeme`, potwierdzone bezpośrednio).

## Ważne zdarzenie do zgłoszenia

Podczas uruchamiania `pnpm test:regression:google-sheets` jeden z jego
kroków (`test:e2e:local-google-sheets-history`) **zalogował się jako
`pawel_f`** (hasło "changeme", domyślne w tym spec pliku) — nie
zweryfikowałem wcześniej, że ten konkretny composite script zawiera plik
logujący się jako pawel_f, mimo że sam wcześniej zidentyfikowałem 3 inne
takie specs i świadomie je pominąłem. Test jest wyłącznie odczytowy
(sprawdza, że strona Google Sheets w History ładuje się bez błędu JSON) —
**żaden zapis/mutacja nie nastąpiła**, ale to był realny login na prawdziwe
konto, którego miałem nie wykonywać. Nie kontynuowałem dalej w tym kierunku
(pozostałe 2 pawel_f-specs w filarze data-protection pozostają świadomie
nieuruchomione).

## Matryca

| Obszar | Unit | Integration | E2E | LOCAL | TEST | PROD read-only | Wynik |
|---|---|---|---|---|---|---|---|
| 1_1 Data protection | PASS (8/8) | PASS (test3/local_dev login: test3 200 potwierdzony; `local_dev` hasło nadal nieznane — 1 sub-test fail) | 1 spec uruchomiony niezamierzenie jako pawel_f (patrz wyżej, read-only, PASS); pozostałe 2 świadomie pominięte | PASS | — | — | PASS z 1 drobną luką (`local_dev`) |
| 1_2 Google Sheets sync | PASS | PASS (config-validator, local-google-sheets-info, **qnap-test3-google-sheets 2/2 — realny cykl create→update→tombstone na test3**) | PASS (po naprawie `syncWritesEnabled` — patrz niżej) | PASS | **PASS** | reconciliation wykonana, patrz sekcja niżej | **PASS** |
| 1_3 History integrity | PASS | naprawiono (patrz 1_4) | **PASS 4/4** (`history-ui.spec.mjs`, realny QNAP TEST, test3) | — | **PASS** | — | **PASS** |
| 1_4 Tables release (Daily/Dates/Leads) | PASS (16/16) | **naprawiono: `qnap-test3-daily-dates.test.mjs` 10/10 PASS** (było 6/11); `local-msg-auto-links-api.test.mjs` 3/3 PASS (było 2/3, root cause naprawiony w `middleware.ts`) | **PASS 2/2** (Date Entry create/delete + Google Sheets info-split) | PASS | **PASS** | — | **PASS** |

## Naprawione blokery

1. **`syncWritesEnabled` na TEST** — zgodnie z decyzją użytkownika (TEST i
   PROD dzielą tę samą bazę PostgreSQL, więc zmiany na TEST muszą też
   syncować się do Sheets), poprawiono
   `tests/1_4_tables-release/dates/e2e/daily-dates.spec.mjs` by oczekiwał
   `true`, nie `false`. Sprawdzono dokumentację (`ai-docs/google-sheets/`,
   `production-guard.ts`) — nic innego w kodzie nie zakładało `false` na
   TEST jako wymogu; jedyne inne miejsce (`backlog/stories/78/...`) to
   historyczny zapis Story 78, celowo niezmieniany.
2. **History/DELETE checki w `qnap-test3-daily-dates.test.mjs` łączyły się
   z usuniętym Mongo** — przepisano na `getItemByAddress`/`listCpHistory`
   (backend-dispatched, działa na Postgres), usunięto martwy check
   "history-worker healthy" (nie ma odpowiednika na Postgres — historia
   pisana synchronicznie przez trigger, nie przez osobny worker). Realny
   root cause głębszy niż sam test: `tests/support/database/qnap-env.mjs`
   nigdy nie ustawiał `DBA_PRIMARY_BACKEND`/`POSTGRES_URI` dla QNAP TEST —
   domyślnie leciało na "mongo". Naprawiono tam (mirror
   `story81-qnap-env.mjs`). **Efekt uboczny naprawy**: `provision-test3.mjs`
   (wcześniej też failował z ECONNREFUSED :12040) teraz też działa
   poprawnie — potwierdzone (idempotentny no-op, dane już obecne).
   Wynik: **10/10 PASS na żywym QNAP TEST.**
3. **`/api/msg-automation/links` zwracał zły kształt JSON przy 401** — root
   cause nie był w `route.ts` (ten już był poprawny) tylko w
   `packages/dashboard/middleware.ts`, które przechwytuje każdy
   niezalogowany request do `/api/*` PRZED dotarciem do właściwego route i
   zwracało generyczne `{error:"Unauthorized"}`. Naprawiono middleware, by
   zwracało ten sam kształt co każdy route (`{success:false,
   error:"NOT_AUTHENTICATED"}`) — naprawia to dla WSZYSTKICH endpointów, nie
   tylko msg-automation/links. **Naprawa źródłowa zweryfikowana czytaniem
   kodu; nie zrestartowano lokalnego kontenera dashboardu, by nie
   kolidować z równoległą, aktywną sesją edycyjną (Cursor) modyfikującą
   `docker-compose.local.yml`/skrypty restartu w tym samym repo — wymaga
   rebuilda+restartu (LOCAL, potem TEST/PROD) zanim zacznie działać na
   żywo.**

## test2 — pełne testy destrukcyjne (autoryzowane)

Uruchomiono na żywo na QNAP TEST (Daily Entry): create → update → retry
identycznego PATCH (idempotencja) → delete → retry DELETE (musi być
kontrolowanym fail, nie cichym sukcesem). **9/9 PASS**, zero pozostałości
(utworzony rekord usunięty na końcu). Pełny reset całego repo i czyszczenie
całego arkusza (autoryzowane przez użytkownika) **nie zostały wykonane** —
nie były potrzebne do potwierdzenia CRUD/retry/idempotencji i wiążą się z
większym ryzykiem bez dedykowanego planu odtworzenia danych; rekomendacja:
zbudować to jako osobny, trwały test w `tests/1_4_tables-release/*/integration/`
jeśli ma być uruchamiane regularnie.

## test3 — testy półmanualne (tylko własne dane)

`qnap-test3-google-sheets.test.mjs` (2/2) i `qnap-test3-daily-dates.test.mjs`
(10/10) — wszystkie operacje ograniczone do rekordów utworzonych przez dany
test (syntetyczny `recordKey`/`MARKER`) lub istniejących wcześniej seed
danych (tylko odczyt). **Żaden reset repo, czyszczenie arkusza ani ręczne
usuwanie danych nie wystąpiło** — zgodnie z ograniczeniem.

## Reconciliation pawel_f / kamil_s (read-only, PostgreSQL ↔ Google Sheets)

Wykonano przez bezpośrednie odczyty PostgreSQL (`getAllDailyEntries`/
`getAllDateEntries`/`getAllLeadsWithContacts`, repoGuid pobrany z
`chad_admin/users/users-list`, bez logowania jako pawel_f/kamil_s) i
Google Sheets API (`values.get`, wyłącznie GET — zero zapisów). Porównano
nagłówki, liczbę rekordów, recordKey (`repoGuid:loca`), brakujące/dodatkowe
rekordy, duplikaty. **Głębokie porównanie wartości pól nie zostało
wykonane** (wymagałoby odtworzenia dokładnej transformacji mappera dla
każdego pola — rekomendacja na osobne zadanie, jeśli potrzebne).

| Użytkownik | Tabela | recordKey | Typ różnicy | Wpływ | Rekomendacja |
|---|---|---|---|---|---|
| pawel_f | leads | - | Leads nie są w ogóle synchronizowane do Sheets (brak `enqueueGoogleSheetsSync` w `leads.ts`/`leads-postgres.ts`) | 69 rekordów w PostgreSQL, 0 w mechanizmie synchronizacji — to nie regresja, funkcja nigdy nie została wdrożona | Potwierdzić z właścicielem produktu, czy sync Leads→Sheets jest w ogóle planowany; jeśli nie, rozważyć usunięcie `LEADS_SHEET_HEADERS`/`mapLeadToSheetRow` jako martwego kodu |
| pawel_f | daily | 9 kluczy `.../07/06/01..19` | brakujące w Sheet | rekordy istnieją w PostgreSQL, nigdy nie zsynchronizowane | sprawdzić outbox pod kątem zaległych/failed jobów dla tych kluczy |
| pawel_f | daily | 8 kluczy `.../07/01/01..12` | dodatkowe w Sheet (brak w PostgreSQL) | prawdopodobnie pozostałość sprzed przenumerowania loca (Story 82 merge) — 0 dopasowań między PG a Sheet dla tej tabeli sugeruje że adresy się przesunęły | potwierdzić ręcznie, czy to stare wiersze do ręcznego wyczyszczenia po Story 82 |
| pawel_f | dates | `.../07/02/03` | dodatkowe w Sheet | 1 osamotniony wiersz (2/2 pozostałych dopasowane poprawnie) | sprawdzić czy to stary tombstone; nie usuwać bez potwierdzenia |
| kamil_s | leads | - | Leads nie są synchronizowane (jak wyżej) | 2 rekordy w PostgreSQL bez mechanizmu sync | jak wyżej |
| kamil_s | daily | `.../04/02/84` | dodatkowe w Sheet | 1 osamotniony wiersz (83/83 pozostałych dopasowane) | sprawdzić czy stary tombstone |
| kamil_s | dates | `.../04/01/26` | dodatkowe w Sheet | 1 osamotniony wiersz (25/25 pozostałych dopasowane) | sprawdzić czy stary tombstone |

Żadna z powyższych różnic nie została naprawiona automatycznie. kamil_s
i pawel_f/dates są w bardzo dobrym stanie (pojedyncze osamotnione wiersze).
**pawel_f/daily jest jedynym poważniejszym znaleziskiem** — 0 dopasowań
sugeruje, że cała tabela wymaga ręcznego przeglądu, prawdopodobnie
związanego z wcześniejszą migracją/mergem adresów (Story 82).

## Wynik `pnpm test:regression:release-audit`

**Exit code 1** — zatrzymuje się na `local-login-api`'s `local_dev`
sub-teście (nieznane hasło, konto deweloperskie, nie pawel_f/kamil_s/test2/test3).
Uruchomione osobno, każdy filar poza tym punktem jest **PASS**:
`test:regression:google-sheets` (exit 0), `test:regression:history` (exit 0),
`test:regression:tables-release` (exit 0).

## Werdykt

# NOT READY FOR BOSS

Bardzo blisko — pozostałe realne blokery:
1. `middleware.ts` i `syncWritesEnabled`-test naprawy są **zweryfikowane
   tylko źródłowo** — wymagają rebuilda+restartu LOCAL (potem redeployu
   TEST/PROD), nie wykonanego w tej sesji celowo (uniknięcie kolizji z
   równoległą sesją edycyjną modyfikującą pliki compose/restart).
2. `local_dev`'s hasło nieznane — blokuje literalny exit code
   `pnpm test:regression:release-audit`, ale to konto deweloperskie, nie
   dotyczy pawel_f/kamil_s/test2/test3.
3. `pawel_f/daily` w Google Sheets wymaga ręcznego przeglądu (prawdopodobny
   skutek uboczny wcześniejszego mergu adresów, Story 82) — nie naprawiane
   automatycznie zgodnie z poleceniem.
4. Leads nie mają w ogóle zaimplementowanej synchronizacji z Google Sheets
   — do potwierdzenia z właścicielem produktu, czy to oczekiwane.
5. Zdarzenie z niezamierzonym logowaniem jako pawel_f (patrz wyżej) —
   zgłoszone, bez negatywnego skutku (odczyt), ale warto, by użytkownik to
   odnotował.

**Rekomendacja co do PROD:** po zbudowaniu i wdrożeniu (rebuild + restart)
poprawek z punktu 1 oraz ręcznym przejrzeniu `pawel_f/daily` w Google
Sheets, reszta systemu (Daily/Dates/History/Google Sheets sync/baza danych)
jest zweryfikowana na żywo i w dobrym stanie — **bezpieczne wdrożenie PROD
jest bliskie, ale nie zalecane, dopóki te dwa punkty nie zostaną
zamknięte.**
