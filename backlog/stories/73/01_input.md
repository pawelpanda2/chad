# Story 73 — Input

## Input 1

CHAD — redesign izolacji danych Beeper per użytkownik

przeczytaj najpierw dokumentacjw ai-docs/begin_here

## Cel zadania

W obecnej wersji zakładki Beeper użytkownik `kamil_s` widzi dane kontaktów należące do `pawel_f`. Jest to krytyczny błąd izolacji danych. Obecne dane Beepera należą wyłącznie do użytkownika `pawel_f`; dane użytkownika `kamil_s` nie zostały jeszcze zaimportowane.

Chcę zmienić architekturę Beepera tak, aby każdy użytkownik CHAD korzystał z osobnej bazy MongoDB. Nie chcę wspólnych kolekcji z polem `ownerRepoGuid`. Nie chcę też prefiksowania nazw kolekcji GUID-em użytkownika.

## Wiążąca decyzja architektoniczna

Każdy użytkownik CHAD ma osobną bazę MongoDB o nazwie:

```text
beeper_<repoGuid>
```

Przykłady:

```text
beeper_21d11bdc-f1f4-44d1-b61a-3fa6b039c641
beeper_8b603669-f8e6-4224-bd78-a474998995fa
```

Pierwsza baza należy do:

```text
username: pawel_f
repoGuid: 21d11bdc-f1f4-44d1-b61a-3fa6b039c641
```

Druga baza należy do:

```text
username: kamil_s
repoGuid: 8b603669-f8e6-4224-bd78-a474998995fa
```

W każdej bazie pozostają zwykłe, nieprefiksowane nazwy kolekcji:

```text
contacts
channels
messages
timeline_events
beeper_events
sync_state
merge_suggestions
```

oraz wszystkie inne kolekcje używane przez pakiety Beepera.

Nie wolno stosować wariantu:

```text
<repoGuid>_contacts
<repoGuid>_messages
```

Nie wolno również dodawać pola:

```text
ownerRepoGuid
```

do dokumentów Beepera.

Izolacja ma wynikać z wyboru osobnej bazy MongoDB.

---

# 1. Najpierw wykonaj pełny audit

Przed zmianami w kodzie przejrzyj całe repozytorium i przygotuj raport obejmujący:

1. wszystkie miejsca otwierające połączenie do MongoDB dla danych Beepera;
2. wszystkie użycia `getBeeperMongoDb()`;
3. wszystkie bezpośrednie wywołania `client.db()` związane z Beeperem;
4. wszystkie kolekcje czytane i zapisywane przez:
   - `packages/dba/src/beeper-crm.ts`,
   - `packages/beeper-sync`,
   - `packages/beeper-ws`,
   - `packages/beeper-oplog`,
   - route'y `packages/dashboard/app/api/beeper-crm/**`,
   - skrypty migracyjne i administracyjne;
5. wszystkie indeksy tworzone dla danych Beepera;
6. wszystkie miejsca, które zakładają jedną globalną bazę `beeper`;
7. wszystkie miejsca, w których `repoGuid` lub użytkownik mogą być pominięte;
8. wszystkie procesy backgroundowe, które nie mają dostępu do sesji Dashboardu.

Najpierw pokaż audit i plan zmian. Nie zaczynaj od wdrożenia na QNAP PROD.

---

# 2. Centralny resolver bazy użytkownika

Dodaj jeden centralny mechanizm wyboru bazy Beepera.

Docelowo ma istnieć funkcja o semantyce:

```ts
export async function getBeeperMongoDb(
  repoGuid: string,
): Promise<Db>
```

Funkcja musi:

1. wymagać `repoGuid` jako jawnego argumentu;
2. walidować pełny format GUID;
3. zbudować nazwę bazy wyłącznie w jednym miejscu:

```ts
const databaseName = `beeper_${repoGuid}`;
```

4. używać wspólnego URI serwera MongoDB bez zahardkodowanej nazwy bazy;
5. zwracać odpowiedni uchwyt `Db`;
6. nie mieć fallbacku do `pawel_f`;
7. nie mieć fallbacku do starej bazy `beeper`;
8. rzucać czytelny błąd dla pustego albo niepoprawnego `repoGuid`;
9. cache'ować połączenie/uchwyt w sposób bezpieczny dla wielu baz użytkowników;
10. nie pozwalać callerowi przekazać dowolnej nazwy bazy.

Nazwa bazy ma być wyliczana wyłącznie z wcześniej zweryfikowanego `repoGuid`.

Przykładowy kierunek:

```ts
const beeperClients = new Map<string, Promise<MongoClient>>();

export async function getBeeperMongoDb(
  repoGuid: string,
): Promise<Db> {
  assertValidRepoGuid(repoGuid);

  const client = await getSharedBeeperMongoClient();
  return client.db(`beeper_${repoGuid}`);
}
```

Preferowany jest jeden `MongoClient` do jednego serwera Mongo i wiele uchwytów `Db`, o ile pasuje to do aktualnej konfiguracji drivera.

---

# 3. Dashboard i sesja użytkownika

Dashboard musi pobierać `repoGuid` wyłącznie z poprawnie zweryfikowanej sesji:

```ts
const user = await getCurrentUserFromCookies();
```

Następnie route ma wykonywać logikę w bezpiecznym kontekście użytkownika, jeżeli obecna architektura DBA korzysta z `AsyncLocalStorage`:

```ts
return runWithRepoContext(user, async () => {
  // Beeper CRM operation
});
```

Ważne zasady:

- `repoGuid` nie może pochodzić z query stringa;
- `repoGuid` nie może pochodzić z body requestu;
- `repoGuid` nie może pochodzić z nagłówka wysłanego przez przeglądarkę;
- nie wolno ufać surowej wartości z cookie bez `resolveCurrentUser()`;
- brak sesji ma zwracać `401`;
- kontakt z innej bazy ma być niewidoczny i zwracać `404`, nie `403`, aby nie ujawniać jego istnienia.

Wszystkie route'y `packages/dashboard/app/api/beeper-crm/**` mają zostać objęte tym mechanizmem.

---

# 4. `packages/dba/src/beeper-crm.ts`

Przerób wszystkie funkcje tak, aby nigdy nie pobierały globalnej bazy `beeper` bez kontekstu użytkownika.

Każda operacja ma używać aktualnego `repoGuid`, np.:

```ts
const repoGuid = getCurrentRepoGuid();
const db = await getBeeperMongoDb(repoGuid);
```

Dotyczy wszystkich funkcji:

- listy kontaktów;
- szczegółu kontaktu;
- wyszukiwania;
- statystyk;
- inboxu;
- timeline;
- kanałów;
- wiadomości;
- edycji kontaktu;
- tagów;
- merge kontaktów;
- merge suggestions;
- usuwania;
- SSE/change streams;
- tworzenia i usuwania timeline events.

Nie może pozostać ani jedna ścieżka odczytu/zapisu, która otwiera wspólną globalną bazę bez właściciela.

---

# 5. Procesy bez sesji: sync, ws i oplog

Procesy backgroundowe nie korzystają z sesji Dashboardu, dlatego muszą wymagać jawnej konfiguracji właściciela.

Dodaj obowiązkową zmienną:

```env
BEEPER_OWNER_REPO_GUID=...
```

Dla mojego Maca:

```env
BEEPER_OWNER_REPO_GUID=21d11bdc-f1f4-44d1-b61a-3fa6b039c641
```

Dla przyszłego urządzenia użytkownika `kamil_s`:

```env
BEEPER_OWNER_REPO_GUID=8b603669-f8e6-4224-bd78-a474998995fa
```

Każdy z pakietów:

```text
packages/beeper-sync
packages/beeper-ws
packages/beeper-oplog
```

musi:

1. odczytać `BEEPER_OWNER_REPO_GUID` przy starcie;
2. zwalidować pełny GUID;
3. zatrzymać proces przed jakimkolwiek odczytem/zapisem, jeśli zmiennej nie ma;
4. połączyć się tylko z bazą `beeper_<repoGuid>`;
5. nie używać starej globalnej bazy `beeper`;
6. nie mieć domyślnego użytkownika;
7. nie próbować wykrywać użytkownika na podstawie danych kontaktu;
8. logować bezpiecznie nazwę bazy i repoGuid na starcie, bez ujawniania hasła Mongo.

---

# 6. Indeksy

Ponieważ każdy użytkownik ma osobną bazę, obecne indeksy mogą pozostać logicznie takie same wewnątrz każdej bazy.

Przykładowo:

```ts
contacts.createIndex(
  { "identities.senderID": 1 },
  { unique: true },
);

channels.createIndex(
  { beeperChatID: 1 },
  { unique: true, sparse: true },
);

messages.createIndex(
  { beeperMessageID: 1, network: 1 },
  { unique: true },
);
```

Dodaj centralną funkcję, która idempotentnie tworzy wymagane indeksy dla wybranej bazy użytkownika:

```ts
ensureBeeperIndexes(repoGuid)
```

Nowa baza użytkownika musi móc zostać zainicjalizowana bez ręcznego tworzenia kolekcji.

---

# 7. Migracja istniejących danych

Wszystkie obecne dane w starej bazie:

```text
beeper
```

należą wyłącznie do użytkownika:

```text
pawel_f
21d11bdc-f1f4-44d1-b61a-3fa6b039c641
```

Przenieś wszystkie kolekcje i indeksy do:

```text
beeper_21d11bdc-f1f4-44d1-b61a-3fa6b039c641
```

Dla `kamil_s` docelowa baza:

```text
beeper_8b603669-f8e6-4224-bd78-a474998995fa
```

ma być pusta. Nie kopiuj tam żadnych kontaktów, kanałów ani wiadomości Pawła.

Migracja musi objąć wszystkie realnie używane kolekcje, nie tylko trzy główne.

Przed migracją:

1. zrób pełny backup starej bazy `beeper`;
2. wypisz listę kolekcji;
3. wypisz count każdej kolekcji;
4. wypisz indeksy;
5. zapisz raport do pliku.

Podczas migracji:

1. skopiuj kolekcje do nowej bazy Pawła;
2. odtwórz indeksy;
3. porównaj county źródło/cel;
4. wykonaj próbki dokumentów i kluczowych zapytań;
5. nie usuwaj starej bazy przed pełną weryfikacją.

Po migracji:

1. przełącz local na nową bazę per-user;
2. uruchom testy;
3. przełącz QNAP TEST;
4. zweryfikuj live;
5. dopiero po mojej osobnej zgodzie usuń starą bazę `beeper`;
6. nie wdrażaj na PROD bez osobnej zgody.

---

# 8. Oczekiwane zachowanie po zmianie

Dla `pawel_f`:

```text
contacts > 0
channels > 0
messages > 0
```

Dla `kamil_s`:

```text
contacts = 0
channels = 0
messages = 0
```

`kamil_s` nie może:

- zobaczyć listy kontaktów Pawła;
- otworzyć kontaktu Pawła po `_id`;
- zobaczyć kanału Pawła;
- zobaczyć wiadomości Pawła;
- edytować kontaktu Pawła;
- usuwać lub scalać kontaktu Pawła;
- zobaczyć statystyk Pawła;
- otrzymać danych Pawła przez SSE;
- wpłynąć na bazę Pawła przez swój sync.

---

# 9. Testy obowiązkowe

Dodaj testy automatyczne i smoke testy:

1. login jako `pawel_f` zwraca istniejące kontakty;
2. login jako `kamil_s` zwraca pustą listę;
3. ręczne wywołanie endpointu szczegółu kontaktu Pawła jako Kamil zwraca `404`;
4. statystyki są różne i izolowane;
5. wyszukiwanie nie przecieka;
6. merge suggestions nie przeciekają;
7. timeline i messages nie przeciekają;
8. sync Pawła zapisuje wyłącznie do bazy Pawła;
9. sync Kamila zapisuje wyłącznie do bazy Kamila;
10. brak `BEEPER_OWNER_REPO_GUID` zatrzymuje proces;
11. niepoprawny GUID zatrzymuje proces;
12. równoległe requesty Pawła i Kamila nie mieszają baz;
13. restart procesu nie zmienia wybranego właściciela;
14. indeksy powstają w obu bazach;
15. stara baza `beeper` nie jest już używana po przełączeniu.

---

# 10. Dokumentacja

Dodaj dokument opisujący:

- dlaczego wybrano osobną bazę per użytkownik;
- format nazwy `beeper_<repoGuid>`;
- sposób wyboru bazy w Dashboardzie;
- konfigurację procesów backgroundowych;
- procedurę dodania nowego użytkownika;
- procedurę migracji;
- procedurę backupu i restore pojedynczego użytkownika;
- zasady bezpieczeństwa;
- zakaz fallbacku do innego użytkownika.

Zaktualizuj istniejącą dokumentację izolacji danych CHAD i architekturę Beepera.

---

# 11. Kolejność pracy

Wykonaj zadanie w etapach:

1. audit;
2. plan;
3. centralny resolver bazy;
4. refaktor DBA;
5. refaktor Dashboard API;
6. refaktor beeper-sync;
7. refaktor beeper-ws;
8. refaktor beeper-oplog;
9. testy lokalne;
10. backup starej bazy;
11. migracja danych Pawła;
12. inicjalizacja pustej bazy Kamila;
13. QNAP TEST;
14. testy izolacji na żywo;
15. raport końcowy;
16. zatrzymaj się przed PROD.

Nie wykonuj skrótowej poprawki tylko w UI. Problem ma być rozwiązany na poziomie wyboru bazy dla wszystkich odczytów i zapisów.
