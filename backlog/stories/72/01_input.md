# Story 72 — Inputs

## Input 1

nadaj nowy numer dla nowej historyjki
przeczytam ai_docs/begin_here

# PROMPT STARTOWY DLA CLAUDE CODE
## Implementacja migracji Content Provider → MongoDB z konfigurowalnym primary/follower w `packages/dba`

Pracujesz w repozytorium:

```text
/Users/pawelfluder/03_synch/01_files_programming/08_nodejs/chad
```

Twoim zadaniem jest **rzeczywiście zaimplementować**, a nie tylko opisać, pierwszą działającą wersję warstwy TypeScript, która:

```text
1. zapisuje i odczytuje Itemy w MongoDB zgodnie z konwencją Content Providera;
2. zachowuje kontrakty funkcjonalne Content Providera;
3. pozwala konfiguracją włączyć MongoDB i/lub legacy Content Provider;
4. pozwala konfiguracją wybrać źródło prawdy;
5. wykonuje zapis do followera asynchronicznie, bez blokowania odpowiedzi primary;
6. zapisuje operacje followera do trwałej kolejki/outboxu;
7. umożliwi późniejsze odwrócenie zależności:
   Mongo primary → CP follower
   na
   CP primary → Mongo follower
   bez przepisywania funkcji biznesowych dba.
```

Nie zatrzymuj się na samym audycie ani planie. Po audycie wykonaj implementację, testy, dokumentację i raport.

---

# 1. Najpierw przeczytaj dokumentację projektu

Najpierw sprawdź aktualną strukturę repozytorium i obowiązujący indeks dokumentacji.

Pewny dokument wejściowy:

```text
documentation/ai-docs/what-and-where.md
```

Następnie znajdź i przeczytaj aktualne dokumenty dotyczące:

```text
Content Providera
MongoDB
packages/dba
konwencji endpointów
izolacji użytkowników
story standard
deploymentu
historii błędów i observability
```

Nie zakładaj istnienia ani nadrzędności plików:

```text
README.md
CLAUDE.md
AGENTS.md
```

dopóki aktualne repozytorium tego nie potwierdzi.

Przeczytaj również kompendium migracji CP→Mongo, jeżeli znajduje się w repo. Jeżeli go nie ma, użyj tego promptu jako nadrzędnej specyfikacji dla zadania.

Dokumentacja ma być przeczytana przed zmianą kodu.

---

# 2. Utwórz Story zgodnie z aktualnym standardem

Sprawdź najwyższy istniejący numer w:

```text
documentation/stories/
```

Utwórz kolejny numeryczny folder zgodnie z aktualnym standardem, np.:

```text
documentation/stories/<NEXT_NUMBER>/
├── 01_input.md
├── 02_plan.md
├── 03_knowledge.md
├── 04_todos.md
├── 05_report.md
└── 06_propositions.md
```

Nie zgaduj numeru. Ustal go z repozytorium.

W `01_input.md` zapisz wymagania z tego promptu. W `02_plan.md` zapisz plan techniczny, ale **nie czekaj na dodatkową akceptację**, jeżeli audyt kodu nie wykryje prawdziwego blokera. W `05_report.md` zapisz końcowy raport i wyniki testów.

---

# 3. Nadrzędna decyzja architektoniczna

Użytkownik chce prosty model konfiguracyjny:

```csharp
dba_function()
{
	if (config.mongoEnabled)
	{
		do_mongo_work();
	}

	if (config.contentProviderEnabled)
	{
		do_cp_work_async();
	}
}
```

Nie kopiuj jednak ręcznie tych dwóch `if` do każdej funkcji `dba`.

Zaimplementuj jeden wspólny router/provider layer, z którego korzystają funkcje `dba`.

Docelowy schemat:

```text
funkcja biznesowa dba
	↓
tworzy jeden gotowy command / jeden gotowy Item
	↓
DbaDataRouter
	├── wykonuje primary synchronicznie
	└── zapisuje zadanie followera do outboxu
			↓
		background worker
			↓
		follower wykonuje identyczną operację
```

Na pierwszym etapie:

```text
PRIMARY  = MongoDB
FOLLOWER = legacy Content Provider
```

Później, po ustabilizowaniu CP:

```text
PRIMARY  = legacy Content Provider
FOLLOWER = MongoDB
```

Odwrócenie ma wymagać zmiany konfiguracji, a nie przepisywania funkcji `dba`.

---

# 4. Konfiguracja

Najpierw sprawdź aktualną konwencję konfiguracji `packages/dba` i środowisk. Nie twórz nowego przypadkowego systemu env, jeżeli istnieje już centralna konfiguracja.

Zaimplementuj semantyczny odpowiednik:

```typescript
type DataBackendName = "mongo" | "content-provider";

interface DbaDataProvidersConfig {
	mongoEnabled: boolean;
	contentProviderEnabled: boolean;
	primaryBackend: DataBackendName;
	followerWritesEnabled: boolean;
	followerWritesAsync: true;
	failRequestOnFollowerError: false;
	shadowReadsEnabled: boolean;
}
```

Pierwszy etap:

```text
mongoEnabled=true
contentProviderEnabled=true
primaryBackend=mongo
followerWritesEnabled=true
followerWritesAsync=true
failRequestOnFollowerError=false
shadowReadsEnabled=true
```

Po odwróceniu:

```text
mongoEnabled=true
contentProviderEnabled=true
primaryBackend=content-provider
followerWritesEnabled=true
followerWritesAsync=true
failRequestOnFollowerError=false
shadowReadsEnabled=true
```

Obsłuż również tryby:

```text
mongoEnabled=true
contentProviderEnabled=false
primaryBackend=mongo
```

oraz:

```text
mongoEnabled=false
contentProviderEnabled=true
primaryBackend=content-provider
```

Walidacja konfiguracji ma zatrzymać startup, gdy primary jest wyłączone. Nie pozwól uruchomić systemu bez aktywnego primary.

---

# 5. Kanoniczny model Itemu

Nadrzędna decyzja:

```text
jeden dokument MongoDB = jeden Item Content Providera
```

Item:

```text
Item
├── config
└── body
```

Model MongoDB:

```json
{
  "_id": "cb7bc372-781c-4ba6-b7b2-cb9ed60e0202",
  "config": {
    "id": "cb7bc372-781c-4ba6-b7b2-cb9ed60e0202",
    "address": "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/04/02/84",
    "type": "Text",
    "name": "84",
    "created": "260718_120000",
    "modified": "260718_120500"
  },
  "body": "dokładna treść body"
}
```

Bezwzględnie obowiązuje:

```text
_id == config.id
config.address jest unikalne
```

Nie dodawaj redundantnie:

```text
repositoryId
repoId
repoGuid
loca
parentAddress
parentId
remaining_config
remaining_settings
```

Repo GUID i loca są już w `config.address`.

Pełny `config` ma być zachowany jako jeden obiekt. Nie wolno gubić customowych pól. `body` ma pozostać surową treścią.

---

# 6. Najpierw ustal faktyczny model CP z kodu

Przed napisaniem serializacji i adaptera wykonaj audyt:

```text
packages/net-content-provider
```

Sprawdź faktyczne implementacje i kontrakty:

```text
ItemModel
RepoModel
PathWorker
ConfigWorker
BodyWorker
IRepoService
IItemWorker
IManyItemsWorker
IMethodsWorker
GetItem
GetByNames
GetByNames2
Put
PostParentItem
```

Ustal z kodu:

```text
1. czy aktualny plik nazywa się body, czy body.txt;
2. jakie pola configu są naprawdę obowiązkowe;
3. jak Folder Item przechowuje mapę dzieci;
4. jak generowany jest kolejny numeryczny adres dziecka;
5. jak CP wykrywa duplikat nazwy;
6. jaki jest dokładny shape requestów i odpowiedzi;
7. jakie błędy są obecnie zwracane;
8. które metody są faktycznie używane przez CHAD.
```

Nie zmieniaj przy okazji standardu pliku body. Jeżeli repo wspiera historycznie `body.txt` i obecnie `body`, adapter odczytu ma być zgodny z aktualną dokumentacją i rzeczywistymi danymi. Nie zgaduj.

---

# 7. TypeScript — wspólne kontrakty

Zaimplementuj w `packages/dba` wspólne typy niezależne od backendu. Dopasuj nazwy i lokalizację do istniejącej struktury repo, ale semantycznie potrzebne są:

```typescript
type CpItemType = "Folder" | "Text" | string;

interface CpItemConfig {
	id: string;
	address: string;
	type: CpItemType;
	name: string;
	created?: string;
	modified?: string;
	[key: string]: unknown;
}

interface CpItem {
	_id: string;
	config: CpItemConfig;
	body: string;
}
```

Dodaj centralną walidację:

```text
- item._id istnieje;
- item.config istnieje;
- item._id == item.config.id;
- config.address istnieje;
- config.name istnieje;
- config.type istnieje;
- body jest stringiem;
- address ma format zgodny z aktualnym CP.
```

Nie duplikuj walidacji w providerach.

---

# 8. Command model

Logika biznesowa ma wykonać się tylko raz.

Funkcja `dba` nie może osobno generować Itemu dla Mongo i osobno dla CP.

Musi powstać jeden gotowy command zawierający ostateczne:

```text
operationId
id
address
name
type
created
modified
config
body
```

Przykładowo:

```typescript
interface DataCommandBase {
	operationId: string;
	createdAt: string;
}

interface PutItemCommand extends DataCommandBase {
	kind: "put-item";
	item: CpItem;
}

interface CreateChildItemCommand extends DataCommandBase {
	kind: "create-child-item";
	parentItemId: string;
	parentAddress: string;
	item: CpItem;
}

type DataWriteCommand = PutItemCommand | CreateChildItemCommand;
```

Dostosuj commandy do faktycznych metod CP.

Najważniejsze:

```text
Mongo i CP dostają ten sam GUID,
ten sam address,
ten sam config,
to samo body,
te same created/modified.
```

Follower nie może sam ponownie wybierać kolejnego numeru dziecka.

---

# 9. Wspólny provider interface

Zaimplementuj wspólny kontrakt, np.:

```typescript
interface CpCompatibleDataProvider {
	readonly name: "mongo" | "content-provider";
	getItem(input: GetItemInput): Promise<CpItem | null>;
	getByNames(input: GetByNamesInput): Promise<CpItem | null>;
	getByNames2(input: GetByNames2Input): Promise<CpItem[]>;
	executeWrite(command: DataWriteCommand): Promise<DataWriteResult>;
}
```

Nie narzucaj tej dokładnej sygnatury, jeżeli obecny kod ma lepsze istniejące typy. Zachowaj jedną wspólną semantykę dla obu providerów.

Implementacje:

```text
MongoCpProvider
LegacyContentProviderAdapter
```

`LegacyContentProviderAdapter` ma korzystać z obecnej warstwy CP dostępnej z `packages/dba`, a nie tworzyć bezpośrednich wywołań w dashboardzie.

---

# 10. MongoCpProvider — rzeczywista implementacja

Napisz rzeczywisty kod TypeScript zapisujący i odczytujący Itemy z MongoDB. Nie twórz mocka ani samego interfejsu.

## Kolekcja

Użyj bazy zgodnej z aktualną konfiguracją CHAD i kolekcji:

```text
items
```

Jeżeli repo ma już centralne nazewnictwo kolekcji, dopasuj się do niego.

## Indeksy

Zapewnij:

```text
_id — unikalne natywnie
config.address — unique
```

Tworzenie indeksu ma być idempotentne.

## getItem

Obsłuż odczyt zgodnie z kontraktem CP:

```text
po trwałym id
lub
po pełnym config.address
```

Nie zgaduj, który wariant odpowiada obecnej metodzie `GetItem` — sprawdź kod.

## getByNames / getByNames2

Muszą działać w konwencji CP. Nie implementuj ich jako globalnego `find({"config.name": name})`, bo nazwa nie jest globalnie unikalna.

Ścieżka nazw ma być rozwiązywana hierarchicznie w kontekście właściwego repo/root parenta. Najpierw ustal model Folder → dzieci z kodu CP.

## put

```text
- waliduje _id == config.id;
- zachowuje created przy aktualizacji;
- aktualizuje modified zgodnie z konwencją;
- zapisuje config i body jako jeden dokument;
- nie tworzy duplikatu address;
- jest idempotentny;
- zwraca wynik zgodny z kontraktem CP.
```

Użyj atomowej operacji MongoDB zgodnej z semantyką.

## PostParentItem / create child

Operacja musi:

```text
- znaleźć rodzica;
- wykryć istniejące dziecko o danej nazwie;
- zachować find-or-create;
- przy istniejącym zwrócić istniejący Item;
- przy nowym wygenerować finalny GUID i address tylko raz;
- uniknąć race condition;
- być idempotentna;
- nie tworzyć dwóch dzieci o tej samej nazwie u jednego rodzica.
```

Jeżeli potrzebne są transakcje, sprawdź aktualną konfigurację Mongo single-node replica set i użyj ich tam, gdzie to konieczne.

---

# 11. DbaDataRouter

Zaimplementuj centralny router.

Oczekiwana semantyka:

```typescript
class DbaDataRouter {
	async executeWrite(command: DataWriteCommand): Promise<DataWriteResult> {
		const primary = this.resolvePrimaryProvider();
		const primaryResult = await primary.executeWrite(command);

		if (this.shouldWriteToFollower()) {
			await this.outbox.enqueueFollowerOperation({
				command,
				primaryBackend: primary.name,
				followerBackend: this.resolveFollowerProvider().name,
			});
		}

		return primaryResult;
	}
}
```

Ważne:

```text
- primary jest wykonywane synchronicznie;
- request kończy się sukcesem tylko po sukcesie primary;
- follower nie jest wykonywany bezpośrednio przez await w request path;
- follower jest zapisany do trwałego outboxu;
- błąd followera nie zmienia sukcesu primary;
- brak aktywnego followera nie tworzy jobu;
- tylko jeden backend działa bez outboxu;
- funkcje biznesowe nie znają nazw Mongo/CP.
```

---

# 12. Asynchroniczny follower — bez prostego fire-and-forget

Nie rób tylko:

```typescript
void contentProvider.executeWrite(command);
```

Taki zapis zniknie przy restarcie, crashu, deploymencie lub braku sieci.

Zaimplementuj trwały outbox w MongoDB, np. kolekcję:

```text
data_sync_outbox
```

Przykład dokumentu:

```json
{
  "_id": "operation-guid:content-provider",
  "operationId": "operation-guid",
  "commandKind": "put-item",
  "primaryBackend": "mongo",
  "followerBackend": "content-provider",
  "command": {},
  "status": "pending",
  "attempts": 0,
  "createdAt": "2026-07-18T12:00:00.000Z",
  "updatedAt": "2026-07-18T12:00:00.000Z",
  "nextAttemptAt": "2026-07-18T12:00:00.000Z",
  "lockedAt": null,
  "lockedBy": null,
  "completedAt": null,
  "lastError": null
}
```

Statusy co najmniej:

```text
pending
processing
retry
synced
failed
conflict
```

Klucz jobu ma być unikalny dla:

```text
operationId + followerBackend
```

---

# 13. Atomowość primary + outbox

Na pierwszym etapie MongoDB jest primary.

Prawidłowy sukces requestu powinien oznaczać:

```text
Item zapisany w Mongo
+
job followera zapisany w outboxie
```

najlepiej w jednej transakcji MongoDB.

Sprawdź, czy aktualny klient i replica set pozwalają na transakcje. Jeżeli tak:

```text
transaction:
	- primary write do items
	- insert/upsert outbox job
commit
```

Nie wykonuj CP wewnątrz tej transakcji.

Jeżeli transakcja nie może zostać użyta:

```text
1. udokumentuj przyczynę;
2. dodaj repair/reconciliation;
3. nie ukrywaj ryzyka utraty jobu.
```

---

# 14. Worker followera

Dodaj background worker w odpowiednim procesie backendowym zgodnie z architekturą CHAD.

Worker:

```text
1. pobiera pending/retry z nextAttemptAt <= now;
2. atomowo rezerwuje job;
3. ustawia processing + lock;
4. wykonuje command na followerze;
5. przy sukcesie ustawia synced;
6. przy błędzie zwiększa attempts;
7. zapisuje sanitized error;
8. wyznacza nextAttemptAt;
9. po limicie ustawia failed;
10. odzyskuje stale lock po crashu.
```

Zastosuj backoff zgodny z projektem albo np.:

```text
1 min
5 min
15 min
1 h
6 h
```

Worker musi być idempotentny i nie może przetwarzać jednego jobu równolegle w dwóch instancjach.

---

# 15. Idempotencja i konflikty

Każdy command ma `operationId`.

Ponowne wykonanie nie może:

```text
- tworzyć drugiego Itemu;
- zmieniać GUID;
- wybierać nowego numeru;
- zmieniać address;
- duplikować dziecka;
- niepotrzebnie zmieniać modified;
- uszkadzać mapy dzieci.
```

Replay tego samego finalnego stanu powinien zwrócić sukces/already-applied.

Jeżeli follower ma inny stan pod tym samym id/address, oznacz job jako:

```text
conflict
```

i zapisz różnicę diagnostyczną. Nie nadpisuj ślepo bez polityki.

---

# 16. Read path i shadow read

Przy `primaryBackend=mongo` odczyt użytkownika pochodzi z MongoDB. Przy `primaryBackend=content-provider` z CP.

Nie mieszaj wyników primary i followera w jednym normalnym odczycie.

Shadow read:

```text
1. zwróć użytkownikowi wynik primary;
2. asynchronicznie pobierz to samo z followera;
3. porównaj;
4. zapisz mismatch;
5. nie zmieniaj odpowiedzi użytkownika.
```

Kategorie różnic:

```text
missing-in-primary
missing-in-follower
id-mismatch
address-mismatch
config-mismatch
body-mismatch
type-mismatch
name-mismatch
```

Nie loguj całego body w zwykłych logach produkcyjnych.

---

# 17. Diagnostyka synchronizacji

Dodaj kolekcję albo wykorzystaj istniejący system backend errors do zapisu:

```text
operationId
itemId
address
primaryBackend
followerBackend
status
attempts
error type
error message
timestamp
mismatch category
```

Nie zapisuj bez potrzeby całego body, sekretów ani tokenów.

Błąd followera ma być widoczny później w Dev Panelu/diagnostyce, ale nie może blokować requestu primary.

---

# 18. Migrator CP → Mongo

Dodaj narzędzie TypeScript w istniejącej konwencji repozytorium, które:

```text
- odczytuje Itemy przez kontrakt CP;
- mapuje jeden Item na jeden dokument Mongo;
- robi dry-run;
- nie usuwa danych;
- jest idempotentne;
- może zostać wznowione;
- raportuje postęp i błędy;
- waliduje _id == config.id;
- waliduje unikalność address;
- zachowuje custom fields;
- zachowuje body.
```

Tryby:

```text
--dry-run
--apply
--validate-only
```

Jeżeli istnieje system commandów w `packages/console`, użyj go zamiast osobnego przypadkowego skryptu.

Raport:

```text
repos scanned
items scanned
items valid
items imported
items unchanged
items conflicting
items failed
duplicate ids
duplicate addresses
missing config
missing body
```

Nie automatyzuj jeszcze Delete ani Move bez potwierdzonej semantyki.

---

# 19. Kolejność wdrożenia funkcji

Najpierw faktycznie używane operacje:

```text
GetItem
GetByNames
GetByNames2
Put
PostParentItem / find-or-create child
```

Delete i Move:

```text
- najpierw audyt;
- osobna jawna semantyka;
- osobne testy;
- brak zgadywania.
```

---

# 20. Przerobienie funkcji dba

Znajdź call-site'y CP w `packages/dba`.

Nie zmieniaj każdej funkcji na ręczne:

```typescript
if (mongoEnabled) { ... }
if (contentProviderEnabled) { ... }
```

Zamiast tego:

```text
1. funkcja domenowa przygotowuje command;
2. wywołuje DbaDataRouter;
3. router wybiera primary;
4. router dodaje follower do outboxu.
```

Przykład:

```typescript
export async function saveDailyEntry(input: DailyEntryInput) {
	const command = await buildSaveDailyEntryCommand(input);
	return dataRouter.executeWrite(command);
}
```

Nie wywołuj dwa razy logiki biznesowej.

---

# 21. Izolacja użytkowników

Zachowaj:

```text
jeden użytkownik = jedno repo
```

Repo context wynika z bezpiecznego kontekstu serwera/sesji. Nie przyjmuj dowolnego repo GUID z frontendu.

Mongo provider musi respektować repo zawarte w `config.address` i zweryfikowany kontekst użytkownika. Użytkownik nie może pobrać Itemu z innego repo przez podanie `_id`.

---

# 22. Daty i generowanie wartości

`created` i `modified` muszą być zgodne z aktualną konwencją CP. Historycznie:

```text
YYMMDD_HHMMSS
```

Sprawdź aktualny helper i użyj wspólnej implementacji.

```text
- created generowane tylko raz;
- modified generowane tylko raz dla commandu;
- oba backendy dostają te same wartości;
- follower nie generuje nowych dat;
- follower nie generuje nowego GUID;
- follower nie wybiera nowego address.
```

---

# 23. Foldery i adresy

`config.address` jest źródłem położenia.

Nie dodawaj osobnego `repositoryId` ani `loca` do dokumentu Mongo tylko dla wygody.

Przy tworzeniu dziecka:

```text
- primary wyznacza finalny address;
- ten sam address trafia do followera;
- follower nie wykonuje ponownie algorytmu kolejnego numeru.
```

Przy `GetByNames` użyj rzeczywistego modelu drzewa CP. Nie zakładaj, że samo prefix matching wystarczy.

---

# 24. Testy

Dodaj testy co najmniej dla:

## Model

```text
poprawny Item
brak id
brak address
_id != config.id
body nie jest stringiem
custom fields nie są tracone
```

## Mongo provider

```text
insert
update
zachowanie created
aktualizacja modified
unique config.address
odczyt po id
odczyt po address
GetByNames
GetByNames2
idempotentny replay
konflikt id/address
```

## Router

```text
tylko Mongo
tylko CP
oba aktywne, Mongo primary
oba aktywne, CP primary
follower wyłączony
błędna konfiguracja primary
sukces primary + enqueue follower
błąd primary
błąd followera nie zmienia sukcesu primary
```

## Outbox

```text
unikalny job per operationId/follower
pending → processing → synced
retry
failed
odzyskanie stale lock
replay
brak równoległego przetwarzania jednego jobu
```

## Integracja Mongo → CP

```text
ten sam id
ten sam address
ten sam config
to samo body
te same daty
brak duplikatu po retry
```

## Round-trip

```text
CP → Mongo → CP
Mongo → CP → Mongo
```

Porównuj semantykę danych, nie format YAML bajt w bajt.

---

# 25. Testy nie mogą używać danych użytkownika

Użyj temporary fixtures i temporary repo roots.

Nie zapisuj testów do:

```text
/Users/pawelfluder/Dropbox/repos
/Volumes/Dropbox/kamilgame042/repos
/share/Dropbox/...
```

Test duplikatu GUID między rootami ma używać dwóch katalogów tymczasowych i potwierdzać błąd z obiema ścieżkami.

---

# 26. Bezpieczeństwo i rollback

Przed uruchomieniem na realnych danych:

```text
- dry-run;
- backup CP;
- backup Mongo;
- raport liczby Itemów;
- brak automatycznego kasowania;
- możliwość wznowienia;
- możliwość Mongo → CP.
```

Nie wykonuj destrukcyjnego cutoveru w ramach tego zadania.

Celem jest zbudowanie warstwy, testów, migratora i konfiguracji.

---

# 27. Zakres zmian

Preferowane miejsca:

```text
packages/dba
packages/console — tylko jeśli wymaga tego istniejący standard
documentation/stories/<N>
konfiguracja środowiska — tylko konieczne flagi
```

`packages/net-content-provider`:

```text
- czytaj w celu poznania kontraktu;
- zmieniaj tylko, gdy konieczne;
- przy zmianie submodule zastosuj osobny commit i poprawny workflow.
```

Nie modyfikuj niezwiązanych:

```text
dashboard UI
deployment scripts
portów
registry
Beeper
Dropbox History
```

chyba że minimalna zmiana jest bezpośrednio wymagana.

---

# 28. Jakość kodu

```text
- TypeScript strict;
- brak any, chyba że wyjaśnione i ograniczone;
- jawne typy publicznych kontraktów;
- małe moduły;
- dependency injection zgodne z repo;
- brak singletonów ukrywających konfigurację;
- błędy z operationId/itemId/address;
- brak logowania sekretów i body;
- testowalny clock i generator GUID;
- brak duplikacji flag w wielu funkcjach.
```

Nie buduj wielkiej abstrakcji bez realnego użycia.

---

# 29. Minimalny oczekiwany przepływ

```typescript
const command = await buildPutItemCommand(input);
const result = await dataRouter.executeWrite(command);
return result;
```

Mongo primary:

```text
1. zapis Itemu;
2. zapis outbox job dla CP;
3. commit;
4. odpowiedź użytkownika.
```

Później worker wykonuje ten sam command w CP.

Niepoprawne:

```typescript
await mongoSave(buildMongoItem(input));
await cpSave(buildCpItem(input));
```

Poprawne:

```typescript
const command = buildOneFinalCommand(input);
await primary.executeWrite(command);
await outbox.enqueue(command);
```

---

# 30. Warunki akceptacji

Zadanie jest ukończone dopiero, gdy:

```text
1. istnieje rzeczywisty MongoCpProvider w TypeScript;
2. potrafi zapisać Item w standardzie CP;
3. potrafi odczytać Item;
4. działa _id == config.id;
5. config.address jest unikalne;
6. custom config fields nie są tracone;
7. funkcje dba używają wspólnego routera;
8. konfiguracja włącza/wyłącza oba backendy;
9. konfiguracja wybiera primary;
10. follower jest trwały i asynchroniczny;
11. request nie czeka na CP, gdy Mongo jest primary;
12. błąd CP nie zmienia sukcesu Mongo;
13. outbox ma retry i idempotencję;
14. istnieje pierwszy migrator CP → Mongo z dry-run;
15. istnieją testy routera, Mongo providera i outboxu;
16. istnieje test integracyjny zgodności Mongo/CP;
17. istnieje dokumentacja konfiguracji;
18. istnieje raport zmian i wyników testów;
19. nie wykonano destrukcyjnego usunięcia danych;
20. nie wprowadzono niezwiązanych zmian.
```

---

# 31. Weryfikacja praktyczna

Po implementacji wykonaj:

```text
lint
typecheck
unit tests
integration tests
build zmienionych pakietów
migrator --dry-run na fixture
test Mongo primary + CP follower
test niedostępnego CP
test sukcesu odpowiedzi primary
test retry po restarcie workera
```

Nie twierdź, że coś działa bez pokazania komendy i wyniku.

Jeżeli test CP wymaga kontenera, użyj oficjalnych skryptów repo i danych testowych.

---

# 32. Git

Przed zmianami:

```text
git status --short
```

Nie nadpisuj cudzych zmian.

Commity rozdziel logicznie. Jeżeli zmienisz submodule CP:

```text
commit + push w repo CP
→ aktualizacja pointera
→ commit w CHAD
```

---

# 33. Raport końcowy

W odpowiedzi końcowej i `05_report.md` podaj:

```text
1. numer Story;
2. przeczytane dokumenty;
3. wykryty kontrakt CP;
4. decyzję body vs body.txt;
5. utworzone moduły TypeScript;
6. sposób konfiguracji flag;
7. działanie primary/follower;
8. model outboxu;
9. kolekcje i indeksy Mongo;
10. zmienione funkcje dba;
11. migrator i tryby;
12. testy i dokładne wyniki;
13. nierozwiązane problemy;
14. ryzyka;
15. commity;
16. czego świadomie nie wdrożono.
```

---

# 34. Najważniejsze zakazy

```text
- nie kończ na samym planie;
- nie rób ręcznych if Mongo/CP w każdej funkcji dba;
- nie wykonuj followera jako nietrwałego void promise;
- nie blokuj requestu niestabilnym CP, gdy Mongo jest primary;
- nie generuj GUID/address/daty osobno dla backendów;
- nie dodawaj repositoryId ani loca do dokumentu Mongo;
- nie rozbijaj Itemu na osobne dokumenty config/body;
- nie pozwalaj followerowi wybierać nowego numeru dziecka;
- nie używaj realnych danych użytkownika w testach;
- nie wykonuj Delete/Move bez potwierdzonej semantyki;
- nie usuwaj danych CP;
- nie mieszaj tego zadania z UI i Dropbox History;
- nie zgaduj kontraktu — sprawdź kod CP.
```

---

# 35. Finalne polecenie

Zacznij od dokumentacji i audytu aktualnego kodu, następnie utwórz Story i wykonaj implementację.

Priorytetem jest działający przepływ:

```text
DBA function
	↓
jeden finalny CP-compatible command
	↓
MongoDB primary
	├── zapis do items
	└── trwały outbox dla CP
			↓
		asynchroniczny worker
			↓
		legacy Content Provider
```

Kod ma być gotowy do późniejszego odwrócenia konfiguracji:

```text
Content Provider primary
	↓
MongoDB follower
```

bez przepisywania logiki biznesowej `dba`.

## Input 2 (follow-up session — Daily Tracker reported empty)

Story 72 nie jest jeszcze zakończone funkcjonalnie.

Na uruchomionym dashboardzie widok Daily Tracker nie pokazuje żadnych danych:

- tabela jest pusta;
- licznik pokazuje `0 of 0`;
- request wygląda, jakby cały czas się ładował;
- dane nie pojawiają się w panelu.

Nie interesuje mnie teraz samo stwierdzenie, że testy jednostkowe lub integracyjne przechodzą. Musisz uruchomić prawdziwy playground i sprawdzić cały przepływ od dashboardu do DBA, a następnie do MongoDB lub Content Providera.

Dane logowania do lokalnego dashboardu:

login:
pawel_f

hasło:
changeme

### Cel

Doprowadź aktualny lokalny system do stanu, w którym po zalogowaniu i otwarciu Daily Tracker dane rzeczywiście wyświetlają się w tabeli.

Nie kończ pracy na testach backendowych. Zweryfikuj działanie w przeglądarce.

### Co masz zrobić

1. Najpierw przeczytaj obowiązującą dokumentację projektu zgodnie z aktualną strukturą repozytorium.

2. Uruchom właściwy lokalny playground całego systemu:
   - dashboard;
   - DBA;
   - MongoDB;
   - Content Provider, jeżeli jest potrzebny w aktualnej konfiguracji primary/follower.

3. Zaloguj się przez UI danymi:

   pawel_f / changeme

4. Otwórz widok Daily Tracker i odtwórz problem widoczny na screenshotcie:
   - pusta tabela;
   - `0 of 0`;
   - trwające ładowanie;
   - brak danych.

5. Użyj narzędzi przeglądarkowych lub Playwrighta i sprawdź:
   - requesty wysyłane przez frontend;
   - statusy HTTP;
   - odpowiedzi JSON;
   - błędy w konsoli;
   - błędy DBA;
   - błędy MongoDB;
   - błędy Content Providera;
   - konfigurację routera primary/follower;
   - czy istniejące endpointy DBA zostały faktycznie przepięte na nową warstwę danych.

6. Znajdź rzeczywistą przyczynę braku danych.

7. Napraw przepływ tak, aby Daily Tracker wyświetlał istniejące dane.

8. Nie twórz sztucznych danych tylko po to, żeby tabela przestała być pusta, chyba że jawnie potwierdzisz, że w źródle nie ma żadnych danych. Najpierw sprawdź istniejące dane użytkownika `pawel_f`.

9. Sprawdź, czy problem wynika z jednej z wcześniej niewykonanych rzeczy ze Story 72:
   - istniejące funkcje DBA nie korzystają jeszcze z `DbaDataRouter`;
   - worker outboxa nie jest uruchomiony;
   - provider jest skonfigurowany, ale nieużywany;
   - frontend nadal odpytuje stary endpoint;
   - odpowiedź nowego providera ma inny kontrakt niż oczekuje tabela;
   - migracja CP → MongoDB nie została wykonana dla prawdziwego repo użytkownika.

10. Jeżeli MongoDB jest primary, ale nie zawiera danych Daily Trackera:
    - wykonaj najpierw bezpieczny dry-run migracji dla właściwego repo użytkownika;
    - pokaż wynik;
    - następnie wykonaj migrację tylko po potwierdzeniu, że źródło i mapowanie są poprawne;
    - nie testuj na przypadkowym fixture zamiast prawdziwego repo.

11. Po naprawie ponownie otwórz Daily Tracker i potwierdź przez UI:
    - tabela zawiera wiersze;
    - licznik nie pokazuje `0 of 0`, jeżeli dane istnieją;
    - loading się kończy;
    - nie ma błędów w konsoli;
    - request zwraca poprawne dane;
    - dane są zgodne ze źródłem.

### Zmiana dotycząca config (PutItemConfig)

Problem polegający na tym, że Content Provider przy zwykłym zapisie generuje nowy GUID i gubi niestandardowe pola config, rozwiążemy przez osobną metodę `PutItemConfig`, dodaną do wspólnego kontraktu i zaimplementowaną w Content Providerze oraz w warstwie MongoDB:

- `PutItem` — zapisuje lub aktualizuje Item i body zgodnie z jego podstawowym kontraktem;
- `PutItemConfig` — zapisuje pełny config Itemu; zachowuje przekazane `config.id`; zachowuje wszystkie niestandardowe pola config; nie generuje nowego GUID, jeżeli ID zostało przekazane; umożliwia followerowi CP odtworzenie tego samego Itemu, który powstał w MongoDB.

Sygnatura ma używać osobnych parametrów repo i loca, bez tuple. Zaprojektować zgodnie z aktualnym wspólnym modelem CpItem i istniejącą konwencją interfejsów, bez tworzenia równoległego, niespójnego modelu config.

### Warunki zakończenia

Nie uznawaj zadania za zakończone, dopóki: nie uruchomisz rzeczywistego playgroundu; nie zalogujesz się przez UI; nie odtworzysz problemu; nie naprawisz rzeczywistego przepływu danych; Daily Tracker nie pokaże danych; nie zweryfikujesz poprawnego requestu i odpowiedzi; nie dodasz oraz nie przetestujesz PutItemConfig; nie opiszesz dokładnie, jaka była przyczyna; nie zapiszesz screenshotu lub wyników Playwrighta potwierdzających działanie.

Na końcu podaj: rzeczywistą przyczynę pustej tabeli; zmienione pliki; sposób podłączenia istniejących funkcji DBA do routera; źródło danych używane po naprawie; wynik prawdziwego testu w UI; testy dla PutItemConfig; rzeczy, które nadal pozostały niedokończone; commity; informację, czy zmiany zostały wypchnięte na GitHub.

Nie restartuj bez potrzeby współdzielonych kontenerów. Jeżeli restart jest konieczny, najpierw sprawdź ich aktualny stan i używane mounty. Nie używaj przypadkowego katalogu fixture zamiast rzeczywistej konfiguracji `.env.local`.

Dołączony też kompendium migracji wcześniej przygotowane: `ai-docs/26-07-11_content-provider-mongodb-final-item-model.md` (zapisane w tej sesji).

## Input 3 (mid-turn, while investigating)

jak procentowo oceniasz ukonczenie

## Input 4 (mid-turn, root-cause hint)

jezeli content provider wolno odpowiada mozesz sam przejsc te sciezki:
/Volumes/Dropbox/kamilgame042/repos/21d11bdc-f1f4-44d1-b61a-3fa6b039c641/07

## Input 5 (mid-turn, correction)

ale to co jest w /Volumes/Dropbox/kamilgame042/repos/21d11bdc-f1f4-44d1-b61a-3fa6b039c641/07 to jest volume qnapowy zamontowany na mac tam nie ma odpalonego dropbox na mac do tego miejsca. co najwyzej hbs dziala tam na qnap ale to sie dzieje tu lokallnie na mac

## Input 6 (mid-turn, priority pivot after PutItemConfig was pushed)

skup sie na tym zeby dane byly przemigrowane i zadzialala ta czesc z mongo db jak masz problem z ta druga z cp to nie jest to tak istotnie bedziemy to poprawiac. teraz wazne zeby zadzialalo to wszystko na mongo i dane byly zmigrowane mozesz nawet ustawic ta flage false zeby nie dziala ta czesc zwianazna z cp

## Input 7 (explicit priority list)

Priorytet na teraz:

1. MongoDB ma działać jako jedyne aktywne źródło danych.
2. Wyłącz tymczasowo follower Content Providera:
   - ustaw odpowiednią flagę na false;
   - nie blokuj działania MongoDB błędami CP;
   - nie próbuj teraz kończyć synchronizacji Mongo → CP.
3. Zmigruj prawdziwe dane użytkownika pawel_f z CP do MongoDB.
4. Nie testuj tylko na fixture ani mockach.
5. Po migracji ustaw MongoDB jako primary.
6. Podepnij istniejący endpoint Daily Tracker do DbaDataRouter/MongoCpProvider.
7. Uruchom dashboard i zaloguj się:
   login: pawel_f
   hasło: changeme
8. Sprawdź w Playwright/browserze, że:
   - Daily Tracker przestaje się kręcić;
   - request kończy się poprawnym statusem;
   - tabela pokazuje rzeczywiste dane;
   - licznik nie pokazuje 0 of 0, jeżeli dane istnieją;
   - nie ma błędów w konsoli ani DBA.
9. Dopiero po tym zajmuj się PutItemConfig i zgodnością followera CP.

Nie uznawaj zadania za zakończone tylko dlatego, że testy backendowe przechodzą.

Minimalny warunek sukcesu:
- prawdziwe dane są w MongoDB;
- aplikacja czyta je z MongoDB;
- Daily Tracker pokazuje je w UI.

Jeżeli część CP przeszkadza, wyłącz ją bezpiecznie flagą i zostaw dokładnie opisaną jako dalsze zadanie.
