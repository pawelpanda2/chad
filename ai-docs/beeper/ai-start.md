# Beeper docs — od czego zacząć

Status: utworzone 2026-07-19 (Story 73), razem z przeniesieniem
`architecture.md`/`migration.md`/`mongo-schema.md` z `human-docs/beeper/` do
tego katalogu (`ai-docs/beeper/`). Ten dokument jest **wyłącznie indeksem
kolejności czytania** dla `ai-docs/beeper/` — nie opisuje żadnego standardu
sam w sobie. Analogiczny do `ai-docs/deploy/ai-start.md` i
`ai-docs/begin_here/01_ai_start.md`, ale scoped do tematu Beepera
(`packages/beeper-sync`, `packages/beeper-ws`, `packages/beeper-oplog`,
`packages/dba/src/beeper-crm.ts`, `packages/dashboard/app/api/beeper-crm/**`).
Jeśli pracujesz nad czymkolwiek z tej listy — przeczytaj ten plik PRZED
czymkolwiek innym w tym katalogu.

**Nie mylić z `packages/dba/src/beeper.ts` / `app/api/beeper/*`** — to
zupełnie inny, starszy feature (dopasowywanie statycznego eksportu WhatsApp
z Content Providera do leadów randkowych), nic wspólnego z MongoDB ani z
tym katalogiem dokumentacji. Ten katalog dotyczy wyłącznie feature'u
"Beeper CRM" (`beeper-crm.ts`, `/api/beeper-crm/*`, zakładka **Beeper** w
dashboardzie).

## 0. Zanim zaczniesz — wiążąca decyzja architektoniczna (Story 73)

**Każdy użytkownik CHAD ma osobną bazę MongoDB, `beeper_<repoGuid>`** — nie
jedną wspólną bazę `beeper` z polem `ownerRepoGuid`, i nie prefiksowanie
nazw kolekcji GUID-em. To była krytyczna poprawka izolacji danych: przed
Story 73 `kamil_s` widział kontakty `pawel_f` w zakładce Beeper, bo cała
logika czytała/pisała do jednej globalnej bazy `beeper`, bez żadnego
wyboru per-użytkownik.

Konkretnie:

- `packages/dba/src/mongo.ts`'s `getBeeperMongoDb(repoGuid)` — jedyne
  miejsce, które wylicza nazwę bazy (`beeper_${repoGuid}`). Wymaga i
  waliduje pełny GUID, bez fallbacku do żadnego użytkownika ani do starej
  bazy `beeper`, bez możliwości przekazania dowolnej nazwy przez callera.
- Dashboard: `repoGuid` wyłącznie z `getCurrentUserFromCookies()`
  (`packages/dashboard/lib/session.ts`, już zweryfikowany przeciw realnej
  liście użytkowników), przekazywany przez istniejący mechanizm
  `runWithRepoContext`/`getCurrentRepoGuid()`
  (`packages/dba/src/repo-context.ts`, `AsyncLocalStorage` — ten sam, którego
  już używają `leads.ts`/`reports.ts`/`statuses-dashboard.ts`; Beeper CRM był
  jedynym feature'em, który go nigdy nie przyjął). Wszystkie 14 route'ów
  `packages/dashboard/app/api/beeper-crm/**` owijają swoje handlery w
  `runWithRepoContext(user, ...)`.
- Procesy bez sesji Dashboardu (`beeper-sync`, `beeper-ws`, `beeper-oplog`)
  wymagają jawnej zmiennej `BEEPER_OWNER_REPO_GUID` — brak albo zły format
  zatrzymuje proces przed jakimkolwiek połączeniem z Mongo
  (`packages/<pakiet>/{lib/,}owner-db.mjs` — trzy niezależne kopie tej samej
  małej logiki, zgodnie z tym, jak te trzy pakiety już duplikują własną
  obsługę połączenia Mongo).
- Stara, wspólna baza `beeper` **nie została usunięta** — zostaje jako
  backup (lokalnie i na QNAP) do czasu osobnej zgody użytkownika na jej
  usunięcie, po pełnej weryfikacji. Pełny zapis: `backlog/stories/73/`.

## 1. Kolejność czytania

1. **[architecture.md](architecture.md)** — GŁÓWNY dokument. Sekcja "Update
   (2026-07-19, Story 73)" na górze opisuje bieżący model izolacji; reszta
   pliku to architektura runtime (Mac/QNAP topologia, odpowiedzialność
   pakietów, znane ograniczenia — media proxy, replica set dla
   `beeper-oplog`, itd.), wciąż aktualna poza samym modelem bazy.
2. **[mongo-schema.md](mongo-schema.md)** — kształt kolekcji
   (`contacts`/`channels`/`messages`/`timeline_events`/`sync_state`/
   `beeper_events`/`merge_suggestions`), indeksy, relacje. Aktualne
   **wewnątrz bazy każdego użytkownika** — sama treść kolekcji się nie
   zmieniła, zmieniło się tylko to, w której bazie żyją.
3. **[migration.md](migration.md)** — historia migracji ze standalone
   projektu `contacts` (Story 59) PLUS krótka notka Story 73 o drugiej,
   niezależnej migracji (`beeper` → `beeper_<repoGuid>`) nałożonej na tę
   pierwszą. Czytaj głównie dla kontekstu historycznego / jeśli coś nie
   zgadza się z bieżącym stanem.

## 2. Kod, nie tylko dokumentacja — gdzie faktycznie żyje ta logika

- `packages/dba/src/mongo.ts` — `getBeeperMongoDb(repoGuid)`,
  `assertValidRepoGuid`, jeden `MongoClient` do serwera Beeper Mongo, wiele
  uchwytów `Db` (jeden per repoGuid).
- `packages/dba/src/beeper-crm.ts` — cała logika domenowa (kontakty,
  kanały, wiadomości, merge, statystyki, SSE); wszystkie funkcje wołają
  `getCurrentRepoGuid()` przez 4 helpery kolekcji (`contactsCol`,
  `channelsCol`, `messagesCol`, `timelineEventsCol`) i `ensureBeeperIndexes(repoGuid)`.
- `packages/dba/src/repo-context.ts` — `runWithRepoContext`/
  `getCurrentRepoGuid`, wspólne z resztą `dba` (nie tylko Beeper).
- `packages/dashboard/app/api/beeper-crm/**` — 14 cienkich route'ów,
  wszystkie: `getCurrentUserFromCookies()` → 401 jeśli brak sesji →
  `runWithRepoContext(user, ...)`.
- `packages/beeper-sync/lib/owner-db.mjs`,
  `packages/beeper-ws/owner-db.mjs`, `packages/beeper-oplog/owner-db.mjs` —
  `resolveOwnerRepoGuid()` (wymaga `BEEPER_OWNER_REPO_GUID`, `process.exit(1)`
  jeśli brak/zły format), `ownerDatabaseName(repoGuid)`, `redactMongoUri(uri)`.
- Testy: `packages/dba/src/beeper-crm.test.ts` (izolacja na realnym lokalnym
  Mongo, dwa jednorazowe testowe repoGuid, nigdy prawdziwe dane) i
  `packages/beeper-sync/lib/owner-db.test.mjs` (zachowanie startowe
  procesów backgroundowych, przez realny subproces).
- Migracja/backup: `bash-scripts/mongo/migrate-beeper-to-per-user.mjs`
  (dry-run domyślnie, `--apply` żeby faktycznie pisać),
  `bash-scripts/mongo/backup-beeper-json.mjs` (JSON-owy fallback backupu,
  gdy `bash-scripts/mongo/backup.sh`'owy `docker exec mongodump` nie jest
  możliwy — np. QNAP bez dostępu SSH/docker z bieżącej sesji).

## 3. Powiązana dokumentacja poza tym katalogiem

- `human-docs/dashboard/common/features/chad-user-data-isolation.md` —
  ogólny standard izolacji danych CHAD (Content Provider/repoGuid); Story
  73 rozszerzyła tę samą zasadę na Beeper CRM (patrz notka Story 73 w tym
  pliku).
- `ai-docs/deploy/2026-07-10_decision-beeper-mac-qnap-architecture.md` —
  starsza decyzja o topologii środowisk Mac/QNAP dla Beepera (porty,
  konwencja test/prod) — wciąż aktualna, niezależna od modelu bazy.
- `ai-docs/deploy/2026-07-10_mongodb-replica-set-migration-plan.md` — plan
  migracji na replica set (potrzebny dla `beeper-oplog`'owych change
  streams) — nadal nie wdrożony, niezależny temat od Story 73.
- `backlog/stories/73/` — pełna historia tego zadania (input, plan, wiedza,
  checklist, raport końcowy).
