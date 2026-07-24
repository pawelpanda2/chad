# Audyt porównawczy: mechanizm historii zmian danych

**hiddengarden.events** vs **CHAD** — MongoDB, zapis danych, historia, audyt, eventy, oplog/Change Streams, outbox, testy.

Audyt czysto porównawczy — bez zmian w kodzie, bez commitów, bez wdrożeń.

Repozytoria:
- `hiddengarden.events` → `/Users/pawelfluder/03_synch/01_files_programming/08_nodejs/hiddengarden.events`
- `CHAD` (monorepo docelowe) → `/Users/pawelfluder/03_synch/01_files_programming/08_nodejs/chad`

Uwaga poboczna (nie dot. samego audytu): plik `hiddengarden.events/.env` zawiera w plaintext realnie wyglądający string połączenia MongoDB Atlas (`mongodb+srv://root:***@cluster0.5jsrogs.mongodb.net/...`). Plik jest poprawnie w `.gitignore` i nieśledzony przez git, więc to nie jest błąd higieny repo — ale warto samodzielnie sprawdzić, czy ten klaster/hasło nadal powinny być aktywne. Poświadczenie nie jest tu przytoczone.

---

## 0. Skrócona mapa architektury obu systemów

### hiddengarden.events (SvelteKit CRM + NATS JetStream + Mongo)

```
Beeper WS ──(nc.publish, fire-and-forget)──> NATS core subject
                                                    │
                                          hc.<org>.beeper.events.message_received
                                                    │
                     ┌──────────────────────────────┼───────────────────────────┐
                     ▼                              ▼                           ▼
              worker (JetStream                persister (JetStream        (inne konsumenty:
              pull consumer,                    durable consumer,           whatsapp UI SSE, itd.)
              explicit ack)                      explicit ack)
                     │                              │
              lead_events + leads              contacts/channels/messages
              (ręczny, aplikacyjny             (CRM projekcja)
               event log)
```

Równolegle: `beeper-ws/index.mjs` (starsza, dziś nieużywana wersja) kiedyś pisała surowe eventy do `beeper_events`, a `beeper-oplog/index.mjs` **nadal aktywnie** obserwuje `beeper_events` przez prawdziwy MongoDB Change Stream i projektuje je do `contacts`/`channels`/`messages`.

### CHAD (Next.js Dashboard + DBA + Mongo + Content-Provider mirror)

```
Dashboard UI/API
   → packages/dba (leads.ts, repo-context.ts, data-commands.ts,
                    data-router.ts, MongoCpProvider)
   → chad.cp_items  (MongoDB, single-node replica set rs0)
        │                                   │
        │ (Change Stream — oplog)           │ (Outbox — data_sync_outbox)
        ▼                                   ▼
  packages/history-worker            follower backend (Content Provider)
  (proces niezależny)                asynchroniczne lustro, retry/backoff
        │
  chad.cp_history / cp_history_state / cp_history_last_state
        │
  packages/dba/src/cp-history.ts → Dashboard API → History UI
```

---

# CZĘŚĆ A — hiddengarden.events

## A.1 Co jest źródłem prawdy (FAKTY)

- Domena CRM/leadów: kolekcja **`leads`** jest mutowalnym dokumentem bieżącego stanu (`orgId`, `currentStageId`, `funnelStatus`, `profile`, `metadata.stageAttempts`, `lockedAt`). Aktualizowana bezpośrednio przez `updateOne`/`$set` w wielu miejscach.
  - `packages/worker/index.ts:118` (upsert po `lead.track`)
  - `packages/worker/lib/agent.ts:208-213` (`metadata.stageAttempts`)
  - `packages/worker/lib/agent.ts:289-297` (`profile.*` z ekstrakcji LLM)
  - `packages/worker/lib/agent.ts:381-386`, `588-597` (eskalacja, zmiana etapu)
- Kolekcja **`lead_events`** to osobny, dopisywany (append-only) log zdarzeń domenowych, zapisywany **ręcznie w kodzie biznesowym** w wybranych miejscach — nie jest to log wyprowadzony z change streamu ani z warstwy zapisu.
- Domena CRM/wiadomości (kontakty/kanały/wiadomości): źródłem prawdy jest surowa kolekcja **`beeper_events`** (append-only, insert-only, nigdy nie modyfikowana) — `packages/beeper-ws/index.ts` już samo nie pisze do Mongo (patrz A.4), ale historycznie/koncepcyjnie to miejsce wejścia surowych danych. Kolekcje `contacts`/`channels`/`messages` to **projekcja materializowana** z `beeper_events` przez Change Stream w `packages/beeper-oplog/index.mjs`.

## A.2 Jak zapisywana jest historia create/update/delete (FAKTY)

Dla leadów zdarzenia zapisywane są **wybiórczo, ręcznie, przy konkretnych operacjach** — nie automatycznie dla każdej zmiany dokumentu:

| Typ zdarzenia | Gdzie | Co zawiera |
|---|---|---|
| `MESSAGE_RECEIVED` | `packages/worker/index.ts:463-470` | `{leadId, messageId, orgId, type, delta:{text,sender}, timestamp}` |
| `MESSAGE_SENT` | `packages/worker/lib/agent.ts:366-374`, `:704`, `:719-723`; `packages/worker/index.ts:331,352,409` | `{leadId, delta:{text}, timestamp}` |
| `ESCALATED` | `packages/worker/lib/agent.ts:388-398` | `{leadId, delta:{reason, stageId}, timestamp}` |
| `STAGE_CHANGED` | `packages/worker/lib/agent.ts:599-605` | `{leadId, delta:{oldStage,newStage}, timestamp}` — **tylko nazwy etapów, nie pełny dokument** |
| dowolny `lead.track` event (formularz web) | `packages/worker/index.ts:94-100` | `{leadId, type:event, delta:data, timestamp}` |

**Luka faktyczna:** aktualizacje `profile.*` wynikające z ekstrakcji LLM (`agent.ts:281-300`) **nie generują żadnego wpisu w `lead_events`** — dane biznesowe leada (np. budżet, branża) zmieniają się w `leads` bez śladu w historii. To samo dotyczy `metadata.stageAttempts`.

Dla wiadomości/kontaktów/kanałów: nie ma żadnej historii zmian w ogóle. `beeper-oplog/index.mjs` robi `updateOne`/`insertOne` na `messages`/`contacts`/`channels` nadpisując poprzedni stan (np. `handleMessageUpserted`, linie 254-279; `handleMessageDeleted` robi tylko soft-delete `deletedAt`, linie 285-301) — brak jakiegokolwiek logu poprzednich wartości.

## A.3 Czy zapis danych i historii jest atomowy/transakcyjny (FAKTY)

```bash
grep -rniE "startSession|withTransaction|startTransaction" packages --include="*.ts" --include="*.js" --include="*.mjs"
# 0 wyników w całym repo
```

- **Brak jakichkolwiek transakcji MongoDB w całym repozytorium.**
- Wzorzec dla `STAGE_CHANGED` (`agent.ts:588-605`): najpierw `leads.updateOne(...)`, **potem, osobnym wywołaniem**, `lead_events.insertOne(...)`. Awaria procesu między tymi dwoma wywołaniami zostawia zmianę stanu bez odpowiadającego jej wpisu historii — i nic tego nie wykrywa ani nie naprawia.
- `packages/beeper-ws/index.ts` (aktywny plik, `pnpm dev` → `tsx watch index.ts`) **nie pisze już do Mongo w ogóle** — publikuje surowy event na `raw.beeper.upsert` (linia 180-181, `nc.publish`, fire-and-forget, **core NATS, nie JetStream `js.publish`** — brak potwierdzenia trwałości) i wzbogacony event na `hc.<org>.beeper.events.message_received` (linia 217-224, też `nc.publish`). Zapis do Mongo (`messages`/`contacts`/`channels`) dzieje się dopiero downstream w `packages/persister/index.ts`, po odebraniu z trwałego JetStream stream `EVENTS_<org>` z jawnym `ack_policy: Explicit` — `msg.ack()` wywoływane dopiero **po** udanym `persistCrmMessage(...)` (`persister/index.ts:86-89`), a błąd skutkuje `msg.nak()` (retry). To jest de facto poprawny wzorzec "at-least-once + ack-after-write", ale samo wejście do JetStream (`nc.publish` zamiast `js.publish`) nie ma potwierdzenia zapisu do strumienia.
- Starszy plik `packages/beeper-ws/index.mjs` (nieużywany w `dev`/`package.json`) faktycznie robił dual-write: `events.insertOne(doc)` do Mongo (linia 59) — bez żadnej korelacji/transakcji z publikacją do NATS.

## A.4 Czy używa Change Streams / event logu / audit collection / outbox (FAKTY)

| Mechanizm | Obecność | Gdzie |
|---|---|---|
| MongoDB Change Streams | **Tak, jeden realny przypadek** | `packages/beeper-oplog/index.mjs:326-353` — `eventsCol.watch([{$match:{operationType:"insert"}}], {fullDocument:"updateLookup"})` na `beeper_events`, projekcja do `contacts`/`channels`/`messages` |
| Change Streams (drugi przypadek) | Tak, ale wyłącznie jako "coś się zmieniło, odśwież" | `packages/dashboard/src/routes/api/events/+server.js:18` — `db.watch([], {...})` na **całej bazie**, tylko wysyła SSE `data: update` do UI (merge suggestions), fallback do pollingu co 5s przy błędzie |
| Domenowy event log (audit) | Tak, ręczny/aplikacyjny | `lead_events` — patrz A.2, ale **nie** jest to CDC/event-sourcing wyprowadzony ze zmian dokumentu |
| Outbox pattern | **Brak** | Grep po `outbox` nie znalazł żadnej dedykowanej kolekcji/mechanizmu retry-with-backoff; najbliższy odpowiednik to JetStream durable consumer + explicit ack w `persister` |
| Resume token dla Change Stream w `beeper-oplog` | **Brak** | Kod nie zapisuje ani nie odczytuje żadnego resume token/checkpointu — patrz A.6 |

## A.5 Jak przechowuje before/after, patch, wersję, actor, requestId, timestamps (FAKTY)

- **Brak patcha/diffa w jakiejkolwiek formie.** `STAGE_CHANGED` zapisuje tylko `{oldStage, newStage}` — same nazwy etapów, nie pełny dokument przed/po.
- **Brak pełnego `before`/`after` snapshotu** dla żadnego typu zdarzenia.
- **Brak pola wersji** (`version`, sekwencji, ETag) na dokumentach `leads`/`lead_events`.
- **Brak `actor` w sensie operatora/człowieka.** `lead_events` ma `leadId`/`orgId`, ale nie ma pola typu "kto/co wykonało operację" (system, agent AI, konkretny użytkownik) poza domyślnym kontekstem — sam `sender`/`senderName` w `delta` to nadawca wiadomości, nie "actor zmiany rekordu".
- **Brak `requestId`/korelacji** między żądaniem a wpisem historii.
- **Timestamps:** `new Date()` w momencie insertu do `lead_events` (czas serwera Node, nie `clusterTime`/BSON Timestamp z oplogu) — brak gwarancji kolejności dla operacji w tej samej milisekundzie poza naturalną kolejnością insertów.
- Deduplikacja `MESSAGE_RECEIVED` po `messageId`: `leadEventsCol.findOne({type:"MESSAGE_RECEIVED", messageId})` przed insertem (`worker/index.ts:426`) — **sprawdzenie na poziomie aplikacji, nie unikalny indeks Mongo** → realne okno na race condition przy współbieżnym przetwarzaniu tego samego `messageId`.

## A.6 Seed/start historii, restart workera, utrata tokenu, luki (FAKTY)

- `packages/beeper-oplog/index.mjs` — Change Stream **bez zapisywanego resume token**. Restart procesu = `eventsCol.watch(...)` zaczyna nasłuchiwać od bieżącego momentu; wszystko co wydarzyło się podczas przestoju (insercje do `beeper_events`) nigdy nie trafi do projekcji `contacts`/`channels`/`messages`, chyba że ręcznie odtworzone. Surowe dane w `beeper_events` przetrwają (insert-only), ale nie ma żadnego mechanizmu "dogrania" zaległości.
- `lead_events`/`leads` (worker) — nie używają Change Streams w ogóle; ich "trwałość" po restarcie zależy wyłącznie od trwałości **JetStream** (durable consumer name `persister-inbound-crm` itd., `ack_policy: Explicit`), a nie od resume tokena Mongo. To działa poprawnie dla kolejki NATS, ale nie chroni przed lukami opisanymi w A.2/A.3 (np. zapisem `leads` bez odpowiadającego `lead_events`).
- Brak jakiegokolwiek mechanizmu wykrywania "utraty okna" (odpowiednika `ChangeStreamHistoryLost` w CHAD) ani ostrzeżenia o luce w historii.

## A.7 Ochrona przed bezpośrednim zapisem omijającym historię (FAKTY)

- **Brak.** Każdy fragment kodu z dostępem do `db` może zapisać `leads`/`messages`/`contacts`/`channels` bez przechodzenia przez żaden log — i faktycznie tak się dzieje (profile update w A.2). Nie ma warstwy pośredniej wymuszającej zapis do `lead_events` przy każdej zmianie `leads` — to świadoma decyzja programisty przy każdym miejscu w kodzie, nie własność systemu.
- `db.collection(...)` wywoływane bezpośrednio w wielu pakietach (`worker`, `dashboard`, `whatsapp`, `chat`, `beeper-sync`) — brak jednej warstwy dostępu do danych analogicznej do CHAD-owego DBA.

## A.8 Testy integralności i regresji (FAKTY)

- Jeden plik: `packages/worker/tests/e2e.test.ts` (Vitest) — uruchamia prawdziwy proces workera + prawdziwy NATS, publikuje symulowaną wiadomość web-chat i WhatsApp, sprawdza **logikę biznesową** (whitelist kanałów dla auto-odpowiedzi) przez zliczenie `lead_events` z `type: MESSAGE_SENT`. To **nie jest** test integralności historii — nie sprawdza atomowości, replay, unikalności, ani zachowania po restarcie.
- Brak testów: replay historii → odtworzenie stanu; unikalność `messageId`/idempotencja na poziomie DB; zachowanie Change Streamu w `beeper-oplog` po restarcie/utracie tokenu; izolacja multi-tenant na poziomie `lead_events`/`orgId`.
- Indeksy: `lead_events` ma tylko `{timestamp:-1}`, tworzony przez Dashboard (`packages/dashboard/src/lib/db.js:35`), **nie przez worker, który faktycznie pisze** do tej kolekcji — brak indeksu na `leadId`, `messageId` czy `type` mimo że są to główne pola zapytań (`agent.ts:219-226`, `index.ts:426`).

## A.9 Koszt dla oploga, dysku i wydajności (FAKTY + kontekst)

- Produkcyjny `MONGODB_URI` w `.env` wskazuje na **MongoDB Atlas** (`mongodb+srv://...cluster0.5jsrogs.mongodb.net/...`) — zarządzany klaster, z definicji zawsze replica set/sharded cluster. Change Streams (`beeper-oplog`) działają "za darmo" infrastrukturalnie — nie trzeba było nigdzie ręcznie inicjalizować `rs0`, generować keyfile ani liczyć rozmiaru oploga na współdzielonym, słabym sprzęcie (to zadanie zrobił Atlas).
- `RAW_EVENTS` JetStream stream w `persister/index.ts:30-38`: `storage: File`, `max_bytes: 500MB`, `max_age: 7 dni`, `discard: Old` — jawnie ograniczony koszt dyskowy dla surowych eventów.
- Brak w repo jakiegokolwiek pomiaru/dokumentu opisującego koszt oploga Atlasa dla tego workloadu (nie było takiej potrzeby — Atlas zarządza tym transparentnie, w przeciwieństwie do zadania z CHAD Story 74, które musiało to mierzyć ręcznie na QNAP).

---

# CZĘŚĆ B — CHAD

## B.1 Co jest źródłem prawdy (FAKTY)

- **`chad.cp_items`** — jedyne źródło prawdy dla danych CP (Daily Tracker, Dates, Views, itd.). Pojedynczy dokument na `_id`/`config.address`, zapisywany atomowo przez `MongoCpProvider.putItem`/`createChild`/`deleteItem` (`packages/dba/src/data-providers/mongo-cp-provider.ts:285-370`).
- `chad.cp_history` / `cp_history_state` / `cp_history_last_state` to **wyłącznie read-side, pochodne** kolekcje — nigdy nie są zapisywane przez Dashboard/DBA, tylko przez `packages/history-worker` na podstawie Change Streamu z `cp_items` (`ai-docs/history/how-it-works.md:1-25`, potwierdzone kodem `history-worker/index.mjs:77-79`).
- Osobno: `chad.data_sync_outbox` (`packages/dba/src/data-outbox.ts`) — trwały outbox dla asynchronicznego lustrzenia zapisu do "follower backendu" (Content Provider), niezwiązany z historią, ale będący kolejnym legitymowanym mechanizmem trwałości zapisu.

## B.2 Jak zapisywana jest historia create/update/delete (FAKTY)

- **Automatycznie, dla każdej zmiany `cp_items`**, bez wyjątków i bez ręcznego wybierania miejsc w kodzie biznesowym — mechanizm nasłuchuje na poziomie kolekcji (`itemsCol.watch([], {fullDocument:"updateLookup"})`, `history-worker/index.mjs:178`), a nie na poziomie wywołań aplikacyjnych.
- Mapowanie zdarzenia na dokument historii jest czystą funkcją: `buildHistoryDocument(change, cached)` (`packages/history-worker/lib/history-event-mapper.mjs:31-92`):
  - `insert`/`update`/`replace` → `after = change.fullDocument`
  - `delete` → brak `fullDocument` (ograniczenie change streamu, nie tego kodu) → `after = null`, ale `address`/`actor` odzyskiwane z **cache'u ostatniego znanego stanu** (`cached`), nie z samego eventu
  - diff configu: strukturalny JSON-patch-podobny (`op/path/oldValue/newValue`, rekurencyjnie po zagnieżdżonych obiektach) — `packages/history-worker/lib/config-diff.mjs`
  - diff body: line-based diff (`diffLines` z pakietu `diff`) — `packages/history-worker/lib/body-diff.mjs`
- Każdy typ operacji (`insert`/`update`/`delete`) generuje dokładnie jeden dokument `cp_history` per event ze streamu — nie ma "cichych" operacji pomijających historię, bo zapis do historii nie zależy od tego, *które* miejsce w kodzie wykonało zapis.

## B.3 Czy zapis danych i historii jest atomowy/transakcyjny (FAKTY)

- Zapis do `cp_items` jest **pojedynczą, atomową operacją na jednym dokumencie** (`updateOne`/`insertOne` z `upsert`, `mongo-cp-provider.ts:304-317`, `:356-361`) — nie wymaga sesji/transakcji Mongo, bo dotyczy jednego dokumentu.
- Historia **nie jest zapisywana w tej samej operacji** — jest wyprowadzana asynchronicznie z oplogu przez Change Stream. To eliminuje klasyczny "dual-write problem" w inny sposób niż transakcja: **istnieje tylko jeden zapis** (do `cp_items`); historia jest zawsze *pochodną* tego zapisu, czytaną z tego samego, atomowego źródła (oplog), więc nie może "wyprzedzić" ani "zgubić się względem" zapisu w sposób niezależny od niego — może się jedynie opóźnić lub (przy utraconym resume tokenie) nie nadążyć, ale nigdy nie zapisze historii bez odpowiadającej jej realnej zmiany danych.
- Idempotencja zapisu do `cp_history`: `_id` dokumentu historii = `change._id?._data` (opaque resume-token data danego eventu, unikalny i stabilny) → retry tego samego eventu = błąd duplikatu klucza (`code 11000`), łapany i ignorowany (`history-worker/index.mjs:124-135`) — nie trzeba osobnego sprawdzenia dedup.
- Kolejność zapisywania stanu jest jawnie zaprojektowana pod odporność na awarię: dopiero **po** udanym (lub zduplikowanym) zapisie `cp_history` aktualizowany jest cache `lastKnownState`/`cp_history_last_state`, a dopiero potem resume token w `cp_history_state` (`index.mjs:137-155`, komentarz "Order here matters for crash-safety").

## B.4 Czy używa Change Streams / event logu / audit collection / outboxa (FAKTY)

| Mechanizm | Obecność | Gdzie |
|---|---|---|
| MongoDB Change Streams | Tak, jedyny mechanizm napędzający historię | `history-worker/index.mjs:178`, wymaga single-node replica set `rs0` (Story 74) |
| Dedykowana kolekcja audytu | Tak | `cp_history` (eventy), `cp_history_state` (checkpoint/health workera), `cp_history_last_state` (trwały "before"-cache per item, dodany w Story 78) |
| Outbox pattern | Tak, ale do **innego** celu | `packages/dba/src/data-outbox.ts` — `data_sync_outbox`, kolejka dla replikacji zapisu do CP-follower (retry backoff 1m/5m/15m/1h/6h, `RETRY_BACKOFF_MS`), **nie** do historii |
| Resume token / checkpoint | Tak, trwały | `cp_history_state._id:"cp_history_worker"` — `resumeToken`, `status`, `watchStatus`/`watchOpenedAt` (Story 78), `lastHeartbeatAt`, `lastEventAt`, `lastError`, `historyGapAt` |

## B.5 Jak przechowuje before/after, patch, wersję, actor, requestId, timestamps (FAKTY)

Struktura dokumentu `cp_history` (`history-event-mapper.mjs:67-91`, typy w `cp-history.ts:92-112`):

```js
{
  _id: <resume-token data, string>,
  sourceCollection: "cp_items",
  sourceId: <cp_items _id>,
  address: <cp_items config.address>,
  operationType: "insert" | "update" | "replace" | "delete",
  changedAt: Date,                 // z BSON clusterTime (sekundy)
  orderSeconds, orderIncrement,    // Story 78 — clusterTime (sec, increment) pełne, stabilna kolejność w tej samej sekundzie
  actor: { username, repoGuid } | null,
  beforeUnknown: boolean,          // jawna, honestly-reported flaga zamiast fabrykowania "before"
  changes: {
    config: [{op, path, oldValue, newValue}, ...],  // strukturalny diff, nie pełny before/after snapshot
    body: [{added, removed, value}, ...] | null,    // line diff
  }
}
```

- **`before`/`after` nie są przechowywane jako pełne snapshoty** — świadoma decyzja ze Story 74 ("Nie zapisuj niepotrzebnie pełnej kopii całego dokumentu... jeżeli można bezpiecznie zapisać patch", `backlog/stories/74/01_input.md:158`). Zamiast tego: strukturalny diff configu z `oldValue`/`newValue` inline na poziomie pola (wystarcza do pokazania before/after bez replayu łańcucha patchy) + line diff body.
- **Wersja/kolejność**: nie ma pojedynczego pola `version`, ale `orderSeconds`/`orderIncrement` (surowe składowe BSON `clusterTime` Timestamp z oplogu) dają **deterministyczną, monotoniczną kolejność** nawet dla kilku operacji w tej samej sekundzie (Story 78, `history-event-mapper.mjs:57-65`, sortowanie w `cp-history.ts:166`).
- **Actor**: `{username, repoGuid}`, zapisywany na `cp_items` jako `_lastActor` w momencie zapisu (`mongo-cp-provider.ts:81,306,360`, źródło: `repo-context.ts`'s `tryGetCurrentActor()`), odczytywany przez worker z `change.fullDocument._lastActor`. Dla `delete` (brak `fullDocument`) — fallback na `cached?.actor` z `lastKnownState`/`cp_history_last_state` (`history-event-mapper.mjs:55`, `:88`).
- **`requestId`**: brak jawnego pola requestId korelującego żądanie HTTP z wpisem historii (nie znaleziono w modelu `cp_history`) — potencjalna luka względem specyfikacji Story 74 (`01_input.md` sugerował to jako "przykład, nie sztywny wymóg").
- **`beforeUnknown: true`**: jawna, uczciwa flaga zamiast fabrykowania "before" — ustawiana zawsze gdy worker nie ma jeszcze cache'owanego stanu dla danego `sourceId` (pierwszy event po starcie/restarcie dla danego itemu, zanim shadow-state go objął).

## B.6 Seed/start historii, restart workera, utrata tokenu, luki (FAKTY)

- **Nigdy nie ma bootstrapu z pełnego skanu `cp_items` przy starcie** — świadomie, bo zafałszowałoby to diff "before" przy nadganianiu zaległości (`history-worker/index.mjs:38-43`, komentarz).
- **Resume token trwały** w `cp_history_state.resumeToken`; przy starcie: jeśli token istnieje → `resumeAfter`, inaczej start "od teraz" (`index.mjs:158-167`).
- **Utrata okna oploga** (`ChangeStreamHistoryLost`) jest jawnie wykrywana (`isResumeTokenLost`, `index.mjs:218-223`) → worker **nie fabrykuje** brakującej historii, tylko zapisuje `historyGapAt`, `status:"error"`, `lastError`, i startuje od "teraz" (`index.mjs:180-195`).
- **Trwały "shadow state"** (`cp_history_last_state`, dodany w Story 78) — `lib/shadow-state.mjs` — jedno per `sourceId`, odczytywane do cache'u w pamięci **przed** otwarciem streamu (`index.mjs:230-234`), więc restart workera nie gubi `address`/`actor`/`before` dla itemów, które już mają realną historię.
- **Readiness signal** (`watchStatus: "opening" → "ready"`, `watchOpenedAt`) dodany w Story 78 właśnie po to, by orchestrator/test mógł czekać na "stream naprawdę otwarty", a nie zgadywać po samym `status:"running"` (`index.mjs:174,199`).
- Zweryfikowane end-to-end w testach: `packages/history-worker/worker-process.test.mjs` — realny `node index.mjs` proces, prawdziwy restart (`SIGTERM` + nowy proces), potwierdzone `beforeUnknown:false` i poprawny `address`/`actor` po restarcie, dokładnie `+2` nowe dokumenty historii (brak duplikatu wcześniejszego insertu).

## B.7 Ochrona przed bezpośrednim zapisem omijającym historię (FAKTY)

- Historia **strukturalnie nie może być pominięta** dla zapisów przez `cp_items`, bo nie zależy od tego, które miejsce w kodzie wykonało zapis — słucha na poziomie kolekcji/oplogu, nie na poziomie wywołań.
- Ryzyko rezydualne (udokumentowane wprost w `ai-docs/history/how-it-works.md:184-197`, sekcja "Rollback"): worker jest **czystym konsumentem read-side** — jeśli ktoś napisze bezpośrednio do `cp_items` z pominięciem `MongoCpProvider` (np. ręczny skrypt administracyjny, `mongosh`), Change Stream i tak to złapie (bo obserwuje kolekcję, nie kod aplikacji) — ale taki zapis nie będzie miał `_lastActor`, więc trafi do historii z `actor: cached?.actor ?? null` (czyli poprzednim znanym aktorem albo `null`), nie z prawdziwym wykonawcą. To jedyna furtka: **actor można "zgubić"**, ale sam fakt zmiany **nie może zniknąć** z historii.

## B.8 Testy integralności i regresji (FAKTY)

- `packages/dba/src/cp-history.test.ts` — 21 testów (real Mongo, dedykowana testowa baza, hand-rolled runner kompilowany przez `tsc`): izolacja repo (w tym regresja na "GUID będący string-prefixem innego GUID"), addressPrefix, paginacja, resolveDailyTracker/DateEntries, sortowanie `orderSeconds`/`orderIncrement`, status workera.
- `packages/history-worker/worker-process.test.mjs` — realny proces `node index.mjs` przeciw prawdziwemu lokalnemu `rs0` (nie mock): readiness signal, przetrwanie restartu z zachowaniem before/address/actor, stabilna kolejność kilku szybkich operacji w tej samej sekundzie.
- `packages/history-worker/lib/history-event-mapper.test.mjs` — czyste testy jednostkowe mapowania zdarzenie→dokument historii (bez Mongo).
- Story 78 **wprost udokumentowała, czego NIE przetestowano** (`backlog/stories/78/05_tasks_and_checklist.md:243-266`, Task 7 = `PARTIAL`, Task 8 = `NOT DONE`):
  - brak drugiego prawdziwego fixture-usera do potwierdzenia cross-user izolacji na realnych danych (tylko syntetyczny nieistniejący `loca`);
  - brak niezależnie przetestowanego scenariusza "utrata resume tokenu" i "crash między insertem historii a zapisem resume tokenu" w tej konkretnej sesji (kod na to istnieje ze Story 74, ale nie ma dedykowanego nowego testu Story 78 dla tych dwóch ścieżek);
  - Playwright pokrywa "golden path" (Dates + Sheets-info), nie pełną macierz z `01_input.md` (np. brak własnego przebiegu Daily Tracker przez UI, brak asercji na widoku szczegółów diffu w History).
- Ogółem: **znacznie głębsze i bardziej ukierunkowane na integralność danych** testy niż w hiddengarden.events (replay, restart, kolejność, izolacja per-repo są explicite testowane), ale ze świadomie udokumentowanymi lukami, nie z fałszywym "PASS".

## B.9 Koszt dla oploga, dysku i wydajności (FAKTY)

- Uruchomienie Change Streams wymagało (Story 74) ręcznego wdrożenia **single-node replica set `rs0`** na słabym sprzęcie: QNAP s12, Intel Celeron N5095, brak AVX, MongoDB 4.4 (najnowsza wersja bez wymogu AVX) — `backlog/stories/74/01_input.md:56-73`.
- `--oplogSize 1024` (MB) — jawnie wybrana wartość zamiast auto-sizingu (~5% wolnego dysku, co na 2.8TB wolnego miejsca dałoby nieproporcjonalnie duży oplog): `docker-compose.qnap.shared.yml:113-118`. Lokalnie (`docker-compose.local.yml:23`): identycznie, `mongod --replSet rs0 --oplogSize 1024`.
- Oplog jest **współdzielony między wszystkie bazy na tym samym `mongod`** — w tym `beeper_<repoGuid>` per-user (Beeper), co jawnie odnotowano jako ryzyko w `01_input.md:544-550`.
- Dodatkowe kolekcje na dysku: `cp_history` (rośnie z każdym zapisem `cp_items`, bez TTL/retencji w kodzie), `cp_history_state` (1 dokument, singleton), `cp_history_last_state` (1 dokument per item — rośnie proporcjonalnie do liczby unikalnych itemów, nie do liczby zmian).
- Indeksy jawnie tworzone przez worker przy starcie: `{address:1, changedAt:-1}`, `{sourceId:1, changedAt:-1}`, `{changedAt:-1}` (`history-worker/index.mjs:81-83`).
- W repo brak (poza samym faktem istnienia `--oplogSize 1024` i komentarza) opublikowanego, zmierzonego raportu liczb (CPU/RAM/oplog window przed/po) z faktycznego przebiegu testu wydajnościowego Story 74 na QNAP w plikach, do których miałem dostęp — jeśli taki plik istnieje pod inną nazwą, warto go dołączyć ręcznie przy wklejaniu do ChatGPT.

---

# CZĘŚĆ C — Wnioski (oddzielone od faktów)

1. **CHAD ma architekturalnie mocniejszy mechanizm historii** dla dokładnie tego zestawu problemów, o które pytasz: opiera się na Change Data Capture (Change Streams czytające oplog) zamiast na ręcznym, aplikacyjnym dual-write. To eliminuje całą klasę błędów, które istnieją w hiddengarden.events (pominięte zdarzenia `profile.*`, możliwy rozjazd `leads`/`lead_events` przy awarii między dwoma zapisami).
2. **hiddengarden.events nie próbuje w ogóle rozwiązać tego problemu tak systemowo** — `lead_events` to bardziej "log zdarzeń domenowych na potrzeby UI/analityki/promptu LLM" niż "audit trail integralności danych". To nie jest błąd projektowy w kontekście ich właściwego use case'u — ale nie nadaje się jako wzorzec do skopiowania 1:1 dla CHAD.
3. Jedyny element w hiddengarden.events wart bezpośredniego zainteresowania to **`beeper-oplog`'owy wzorzec Change-Stream-jako-projekcja** — koncepcyjnie bardzo blisko tego, co CHAD już robi dla `cp_items → cp_history`, tyle że bez trwałego resume tokena. To akurat **potwierdza**, że kierunek CHAD jest słuszny, a nie sugeruje zmiany kierunku.
4. Największa **realna, udokumentowana przez samych autorów** luka w CHAD to nie architektura, tylko zakres testów: brak drugiego prawdziwego fixture-usera do E2E cross-user, brak dedykowanego nowego testu na "resume token lost" i "crash między insert-historii a zapisem tokenu" w Story 78. To małe, punktowe braki na solidnym fundamencie, nie fundamentalna wada.
5. `requestId`/korelacja żądanie→wpis historii nie jest zaimplementowana w żadnym z dwóch systemów — jeśli zależy Ci na łączeniu wpisu historii z konkretnym żądaniem HTTP/API, to jest to wspólna luka do rozważenia jako rozszerzenie CHAD, nie coś do przeniesienia z hiddengarden.events.
6. Koszt infrastrukturalny: hiddengarden.events "kupuje sobie" Change Streams za darmo dzięki Atlasowi; CHAD musiał to zbudować ręcznie na słabym NAS-ie. To nie czyni rozwiązania CHAD gorszym technicznie — pokazuje tylko, że decyzja "self-hosted single-node rs0 na QNAP" niesie realny koszt operacyjny, którego hiddengarden.events nie musiał ponosić.

---

# CZĘŚĆ D — Tabela końcowa

| Obszar | hiddengarden.events | CHAD | mocniejsze rozwiązanie | co warto przenieść |
|---|---|---|---|---|
| Źródło prawdy | `leads` (mutowalny) + ręczny `lead_events`; `beeper_events` (append-only) → projekcja | `cp_items` (mutowalny), jedyne źródło; historia w pełni pochodna | CHAD | — |
| Mechanizm rejestracji historii | Ręczne, wybiórcze `insertOne` w kodzie biznesowym (`lead_events`) | Automatyczny CDC — Change Stream na kolekcji, niezależny od miejsca zapisu | CHAD | Nic — kierunek CHAD jest strukturalnie lepszy |
| Atomowość zapis+historia | Brak transakcji; 2 niezależne zapisy (`leads` + `lead_events`), realna luka (profile update bez eventu) | 1 atomowy zapis do `cp_items`; historia zawsze pochodna z oplogu, nigdy niezależna | CHAD | — |
| Change Streams | Tak, ale tylko dla CRM-projekcji (`beeper-oplog`), **bez trwałego resume token** | Tak, z trwałym resume token + wykrywaniem utraty okna (`historyGapAt`) | CHAD | Rozważ dodanie resume-tokena do `beeper-oplog` w hiddengarden.events (odwrotny kierunek transferu) |
| Outbox / trwała kolejka async | Brak dedykowanego outboxa; JetStream durable consumer + explicit ack jako substytut | `data_sync_outbox` — pełny outbox z retry/backoff dla CP-follower (osobny cel niż historia) | CHAD | — |
| before/after/patch | Brak patcha; `STAGE_CHANGED` ma tylko `{oldStage,newStage}` | Strukturalny diff config (JSON-patch-like) + line diff body, bez zbędnych pełnych snapshotów | CHAD | — |
| Wersja / kolejność zdarzeń | `new Date()` per insert, brak porządku sub-sekundowego | `orderSeconds`/`orderIncrement` z BSON `clusterTime`, deterministyczna kolejność w tej samej sekundzie | CHAD | — |
| Actor | Brak pola "kto wykonał zmianę rekordu" | `_lastActor` na dokumencie źródłowym + fallback z cache dla delete | CHAD | — |
| requestId / korelacja | Brak | Brak | Remis (brak w obu) | Rozważ dodanie w CHAD jako nowe rozszerzenie, nie transfer |
| Restart workera bez utraty stanu | Brak trwałego resume tokena w `beeper-oplog`; JetStream chroni tylko kolejkę NATS, nie stan diffu | Trwały resume token + trwały shadow-state (`cp_history_last_state`) + readiness signal (Story 78) | CHAD | — |
| Ochrona przed obejściem historii | Brak — bezpośrednie zapisy `db.collection()` wszędzie, brak wspólnej warstwy dostępu | Strukturalna (CDC na poziomie kolekcji) — obejście możliwe tylko co do `actor`, nie co do samego faktu zmiany | CHAD | — |
| Testy integralności/regresji | 1 test e2e logiki biznesowej (whitelist), zero testów replay/restart/dedup na poziomie danych | 21+ testów izolacji/paginacji/sortowania + realne testy restartu procesu, świadomie udokumentowane luki (Task 7/8 w Story 78) | CHAD | — |
| Koszt infrastruktury dla Change Streams | Zero — Atlas to zarządzany replica set | Wysoki — ręczny single-node `rs0` na słabym QNAP, współdzielony oplog z Beeperem, keyfile, idempotentna inicjalizacja | hiddengarden.events (niższy koszt), ale to efekt innego hostingu, nie lepszej architektury | Jeśli QNAP kiedyś stanie się wąskim gardłem, rozważ migrację Mongo CHAD na zarządzany serwis (Atlas/podobny) zamiast rezygnacji z Change Streams |

---

**Uwaga metodologiczna:** wszystkie fragmenty kodu i liczby linii pochodzą z lokalnych plików w momencie audytu (2026-07-23); Story 78 wprowadziła znaczną część mocnych stron CHAD (`watchStatus`, `cp_history_last_state`, `orderSeconds`/`orderIncrement`) i sama jawnie oznacza pozostałe luki jako `PARTIAL`/`NOT DONE` — nie jako fałszywe „gotowe".
