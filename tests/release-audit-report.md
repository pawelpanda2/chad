# Release-readiness audit — READY FOR BOSS

Data: 2026-07-28. Zakres: integralność danych/outboxu, sekrety Gmail, wolumen
QNAP cp_1, backup, bezpieczeństwo sesji.

## 12.1 Mutation path inventory (leak paths bez outboxa)

| path | mutation type | record type | history atomic? | outbox atomic? | prod? | expected sync? | risk | fix | test |
|---|---|---|---|---|---|---|---|---|---|
| `cp-history/mutate-postgres.ts` (trigger-based INSERT/UPDATE/DELETE) | any | any | tak (trigger, ta sama transakcja) | delegowane do wołającego | tak | zależne od record type | normal_atomic_write | — | pełny istniejący zestaw regresji |
| `google-sheets/sync.ts` `queueSheetSyncIfEnabled`/`prepareSheetSyncFactoryInTxn` | insert/update/delete | daily-entry/date-entry/lead | tak | **BYŁO: cichy return przy błędzie configu/mappingu** | tak | tak (mapped, dozwoleni) | lost_outbox_risk | **NAPRAWIONE** — zawsze tworzy widoczny job `failed` z `lastError` | `blocked-outbox-job.test.mjs` |
| `migrate-mongo-to-postgres.mjs` | bulk insert (jednorazowy) | any | tak (historia kopiowana) | **NIE — kopiuje tylko już istniejące joby** | już wykonany | tak | legacy_migration_repair (**potwierdzony root cause pawel_f**) | mitygowane przez `reconcile-google-sheets.mjs` (nie zmieniano skryptu — już wykonany) | `reconcile-real-users.test.mjs` |
| `resolve-address-conflicts-to-backup.mjs` | insert (bulk) | any | tak | NIE (brak enqueue) | już wykonany | tak | legacy_migration_repair (ta sama klasa) | jak wyżej | jak wyżej |
| `fix-orphaned-backup-folders.mjs` | insert (bulk) | folders | tak | NIE (foldery nigdy nie sync'ują) | już wykonany | not_applicable | intentional_no_sheet_sync | — | — |
| `restore-cp-data-from-backup.mjs` | insert (bulk, DR) | any | tak | NIE (brak enqueue) | admin-only DR | tak jeśli realne dane | legacy_migration_repair / unsafe_live_write bez ostrożności | rekomendacja: `reconcile-google-sheets.mjs` po każdym restore | `reconcile-real-users.test.mjs` (post-restore) |
| `sync-local-from-qnap.ts` | TRUNCATE + bulk insert | any | trigger wyłączany na czas insertu | NIE | tylko LOCAL, nigdy prod | not_applicable | offline_copy_only | — | — |
| `postgres-cp-provider.ts` putItem/createChild/deleteItem | insert/update/delete | Folders/Text/etc. | tak | delegowane (Daily/Date/Lead wołają queue*SheetSync; Folders/messages/statuses/ai-prompts nie, celowo) | tak | tylko dla daily-entry/date-entry/lead | normal_atomic_write / intentional_no_sheet_sync | — | istniejący zestaw |
| `message-creator.ts`, `statuses-dashboard.ts`, `report-entries.ts`, `ai-prompts.ts` (`putItemBody`) | update | messages/statuses/report-entries/ai-prompts | tak | celowo brak | tak | not_applicable | intentional_no_sheet_sync | — | — |
| `reconcile-google-sheets.mjs --apply` | outbox insert only | daily/dates/leads | n/a | tak, jawny, idempotentny, dry-run-first | admin-invoked | tak | normal_atomic_write (repair-scoped) | to jest sama naprawa | `reconcile-real-users.test.mjs` before/after |

## 12.2 Outbox integrity

| user | recordType | postgresCount | sheetCount | missing | extra | duplicates | lostOutbox | orphanOutbox | failed | stuck | result |
|---|---|---|---|---|---|---|---|---|---|---|---|
| pawel_f | daily | 9 | 17 | 0 | 8 (stare, sprzed mergu adresów Story 82) | 0 | 0 | 0 | 0 | 0 | **PASS** |
| pawel_f | dates | 2 | 3 | 0 | 1 (stary wiersz) | 0 | 0 | 0 | 0 | 0 | PASS |
| kamil_s | daily | 83 | 84 | 0 | 1 (stary wiersz) | 0 | 0 | 0 | 0 | 0 | PASS |
| kamil_s | dates | 25 | 26 | 0 | 1 (stary wiersz) | 0 | 0 | 0 | 0 | 0 | PASS |
| pawel_f/kamil_s | leads | 69 / 2 | 0 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | **not_applicable — Leads nigdy nie synchronizuje do Sheets (brak enqueue w kodzie), nie regresja** |

## Root cause — brakujący rekord pawel_f (naprawiony)

9 rekordów Daily (`loca` 07/06/01,02,03,04,05,06,07,08,19) miało
`cp_history.actor_kind='migration'` i **zero jobów w
`cp_outbox_google_sheets_sync`** — migracja Story 82 kopiowała tylko już
istniejące Mongo-joby, nigdy nie generowała nowych. **Naprawione**: pełny
`pg_dump -Fc` backup, dry-run (dokładnie te 9 recordKey, zero nowych),
`reconcile-google-sheets.mjs --user=pawel_f --record-type=daily --apply` —
9 jobów enqueued przez realny `enqueueGoogleSheetsSync`, żywy worker
zsynchronizował wszystkie 9 (potwierdzone poll: status=synced). After:
`missing=[]`, `lostOutbox=[]`, `result=PASS`. Stare 8 wierszy w arkuszu
pozostawione nietknięte (zgodnie z zakazem czyszczenia zakładki).

## 12.3 Secrets (Gmail viewer account)

`packages/dba/scripts/provision-google-viewer-secrets.mjs` — zbudowany,
idempotentny, `--dry-run`/`--apply`, nigdy nie loguje hasła/ciphertextu,
weryfikuje `decryptSecret` po zapisie. **BLOCKED** w tej sesji —
`GOOGLE_VIEWER_USERNAME`/`GOOGLE_VIEWER_PASSWORD` nie są dostępne (nigdy nie
zgadywane/wymyślane). Uprawnieni użytkownicy (odczytani z realnej
users-list, nie zgadywani): `pawel_f` (role=admin), `test2`, `test3`.
`kamil_s` (role=user) — **nie uprawniony** wg aktualnej polityki
(admin + test2/test3).

| user | eligible | secretsItemExists | usernameConfigured | encryptedPasswordValid | result |
|---|---|---|---|---|---|
| pawel_f | tak | — | — | — | BLOCKED (brak danych logowania) |
| test2 | tak | — | — | — | BLOCKED |
| test3 | tak | — | — | — | BLOCKED |

Reveal-password endpoint naprawiony: wymaga server-side reauth (własne
aktualne hasło, bcrypt), rate limit (5/15min), audit log bez hasła, tylko
właściciel bieżącego repo (już było). **Wymaga rebuilda LOCAL/redeployu
TEST-PROD, żeby zacząć działać na żywo** (zweryfikowane tylko kodem +
typecheck, nie live — patrz sekcja bezpieczeństwa niżej).

## 12.4 Storage (QNAP cp_1)

**Fizyczna migracja NIE wykonana w tej sesji** — wymaga SSH do QNAP i
zatrzymania żywych usług współdzielonych przez TEST+PROD; celowo
pozostawione do osobnej, nadzorowanej przez człowieka sesji.

**Ważne znalezisko**: `/share/cp_1` to już **zarezerwowana, stara ścieżka**
— dawny `personal-dashboard-prod` SQLite/Prisma data path (patrz
`ai-docs/deploy/shared-qnap-services.md`), celowo niekasowana. Użycie nazwy
`cp_1` dla nowego wolumenu Postgres/Beeper-Mongo **ryzykuje kolizję** z tą
starą ścieżką — wymaga jednoznacznego potwierdzenia realnej struktury przez
`df -h`/`mount`/`ls /share` na żywym QNAP przed jakąkolwiek zmianą compose.

| | |
|---|---|
| oldPath | `.../chad-shared/postgres/db`, `.../chad-shared/beeper-mongodb/db` (obecne, niezmienione) |
| newCp1Path | **nieustalone** — wymaga weryfikacji SSH |
| Postgres counts before/after | n/a (migracja nie wykonana) |
| Mongo counts before/after | n/a |
| old rollback copy | n/a |
| snapshot configured | nie sprawdzone (wymaga QTS GUI/SSH) |
| logical backup PASS | **tak** — `pg_dump -Fc` przetestowany na żywo (`backup-postgres-logical.mjs`, manifest+checksum+atomic rename działają) |
| offsite status | nieskonfigurowany — jawne ryzyko, nie ukryte |
| restore drill PASS | **nie wykonany** (wymaga disposable DB + czasu poza zakresem tej sesji) |

`packages/dba/scripts/backup-beeper-mongo-logical.mjs` napisany (ten sam
wzorzec co Postgres — manifest/checksum/atomic rename), **nieprzetestowany
lokalnie** (brak `mongodump` w tym środowisku deweloperskim).

## 12.5 Security blockers (P0/P1)

**Naprawione w tej sesji** (kod gotowy, część wymaga redeployu by zacząć
działać na żywo):
- **P0 — sesje bez podpisu**: `session=<repoGuid>:<timestamp>` był w pełni
  forgeable (każdy znający/zgadujący repoGuid mógł podszyć się pod
  użytkownika bez znajomości hasła). Naprawione: HMAC-SHA256 podpisane,
  wygasające tokeny (`session-token.ts`). **Wymaga `SESSION_SIGNING_SECRET`
  w `.env.local`/`.env.server1.{test,prod}` + redeployu** — bez tego kod
  bezpiecznie i jawnie (log) spada do starego zachowania, nigdy nie łamie
  logowania po cichu.
- **P0 — `isActive` był hardcoded `true`**: żadne konto nie mogło zostać
  zablokowane. Naprawione: czytane z realnych danych, `false` blokuje
  login (403).
- **P0 — automatyczny admin po nazwie użytkownika**: `normalizeUserRole`
  przyznawał `admin` dla literalnego `"pawel_f"` bez wymogu jawnej roli.
  Naprawione: rola zawsze jawna (potwierdzone: realny wiersz pawel_f już ma
  `role: admin`).
- **P0 — reveal-password bez reautoryzacji**: tylko sesja + losowe słowo po
  stronie klienta. Naprawione: wymaga własnego aktualnego hasła (bcrypt),
  rate limit 5/15min, 403 bez reauth, audit log bez hasła.
- **P0 — DataLib (Prisma/SQLite) bez auth i bez izolacji per-user**: `/api/leads`
  i `/api/outings` (osobny, legacy hobbystyczny system, **nie** ten sam co
  realne, synchronizowane Leads) zwracały globalne dane **bez żadnego
  sprawdzenia sesji**. Naprawione: gate admin-only (403 dla wszystkich
  innych).
- **Secure cookie na PROD**: `AUTH_COOKIE_SECURE` nie było nigdzie
  ustawione. Dodano do compose + `.env.server1.prod.example` (`true`).

**Niedokończone / wymagają osobnej pracy** (jawnie, nie ukryte):
- `middleware.ts` nadal sprawdza tylko *obecność* cookie (nie podpis) —
  realna weryfikacja żyje w `getCurrentUserFromCookies()` (już naprawione,
  wołane przez każdy route). Middleware jako szybki pre-filter jest OK, ale
  nie jest to "podpisana weryfikacja na poziomie middleware" dosłownie.
- Rate limit logowania (`/api/auth/login`) — **nie dodany** (tylko
  reveal-password ma rate limit).
- Runtime DB role bez superusera — **nie zweryfikowane** (wymaga SSH).
- Porty DB tylko przez zamierzoną sieć — zgodnie z całą architekturą tej
  sesji (Tailscale-only), ale **nie zweryfikowane na żywo w tej sesji**
  (wymaga SSH/firewall audit).
- Migracja DataLib do PostgreSQL/DBA — **nie wykonana**, tylko odcięta
  dostępem (bezpieczny wybór z sekcji 10: "całkowicie wyłączony dla
  realnych użytkowników").

## Wyniki 1_1–1_4 (zawsze wszystkie cztery, `run-full-release-audit.mjs`)

| Filar | Wynik | Uwaga |
|---|---|---|
| 1_1_data-protection | **FAIL** | `local_dev` hasło nieznane (drobne); nowy `reveal-password-reauth` e2e test poprawnie failuje na niezredeployowanym LOCAL (kod gotowy, oczekuje rebuilda) |
| 1_2_google-sheets-sync | **PASS** | włącznie z pawel_f/kamil_s reconciliation, nowym blocked-outbox testem, history-outbox-lifecycle |
| 1_3_history-integrity | FAIL w pełnym przebiegu → **potwierdzone jako przejściowa flakowość** (natychmiastowy re-run: 4/4 PASS, login do QNAP TEST chwilowo się nie powiódł, nie regresja kodu) |
| 1_4_tables-release | **PASS** | pełny, włącznie z e2e |

**`pnpm test:regression:release-audit` exit code: 1** (z powodu 1_1 i
przejściowego 1_3 w tym konkretnym przebiegu).

## 12.6 Werdykt

# NOT READY FOR BOSS

Uzasadnienie (zgodnie z sekcją 13 — wszystkie warunki muszą być spełnione
jednocześnie, nie są):
- fizyczna migracja na `cp_1` nie wykonana (celowo — wymaga SSH i osobnego
  nadzoru człowieka; ponadto wykryto realne ryzyko kolizji nazw);
- restore drill nie wykonany;
- offsite backup nieskonfigurowany (jawne ryzyko);
- sekrety Gmail: BLOCKED, brak realnych danych logowania;
- `SESSION_SIGNING_SECRET`/session P0-fixy: gotowe w kodzie, niewdrożone na
  żywo (wymagają redeployu);
- 1_1 nadal FAIL (drobne, ale realne).

**Rekomendacja co do PROD: nie wdrażać.** System jest w znacznie lepszym,
bezpieczniejszym stanie niż przed tym audytem (realny root cause
lost-outbox naprawiony i zweryfikowany na żywo dla pawel_f, kilka
prawdziwych P0 sesji/auth naprawionych w kodzie), ale fizyczna migracja
storage, backup offsite/restore-drill i wdrożenie poprawek sesji na żywo są
warunkami koniecznymi, które wymagają osobnych, nadzorowanych kroków przed
READY FOR BOSS.
