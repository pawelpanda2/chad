# Prompt dla Cline / Claude – stopniowa migracja Content Providera do MongoDB, QNAP, kompatybilność CP i zakładka Folders

Ten prompt jest samodzielną instrukcją dla Cline/Claude. Ma zawierać w sobie wymagania dotyczące migracji Content Provider ↔ MongoDB, kompatybilności, QNAP, backupów, dashboardu oraz nowych feature'ów tabelowych do trackowania `daily habits` i `dates`.

Jeżeli w repozytorium jest dostępne `26-07-10_cp_compedium.md`, przeczytaj je jako dodatkowe źródło kontekstu. Ten prompt jednak nie zakłada, że osobny dokument kompatybilności MongoDB jest dołączony — wymagania kompatybilności są wpisane bezpośrednio tutaj.

---

## 0. Ustalenia z rozmowy i wywiad architektoniczny

Ta sekcja jest częścią promptu, a nie luźnym komentarzem. Traktuj ją jako zapis decyzji użytkownika z wywiadu architektonicznego. Nie pytaj ponownie o rzeczy, które są tu rozstrzygnięte.

### 0.1 Najważniejsze odpowiedzi użytkownika

| Pytanie / temat | Odpowiedź użytkownika / decyzja |
|---|---|
| Jak ma nazywać się nowe monorepo? | Nowe monorepo ma nazywać się `chad`. |
| Gdzie są projekty lokalnie? | Projekty są w `/Users/pawelfluder/03_synch/01_files_programming/08_nodejs`. |
| Czy modyfikować repo kolegi? | Nie. Repo kolegi `hiddengarden.events` jest wzorcem do analizy, ale nie wolno go modyfikować. Wszystkie zmiany mają iść do nowego `chad`. |
| Jaki package manager? | Standardem ma być `pnpm`. |
| Jak nazywać pakiety? | Skracamy nazwy wszystkich pakietów. Docelowe krótkie nazwy: `packages/dba`, `packages/console`, `packages/dashboard`, `packages/contacts`, `packages/content-provider`. Te nazwy są OK. |
| Co z `content-provider`? | `content-provider` ma być dołączony do nowego monorepo jako Git subtree. Historia starych repo nie jest ważna. |
| Czy `contacts` ma być uruchamiane w pierwszej wersji? | Nie. W pierwszej wersji nie ma uruchamiać aplikacji/paczki `contacts`, ale dashboard ma mieć nową zakładkę / integrację, która będzie w stanie korzystać z `contacts`. |
| Co z `console`? | `console` jest na razie osobnym programem / CLI. Później użytkownik może chcieć przenieść ją do dashboardu, ale to dalsza przyszłość. Teraz nie przenosić logiki konsoli do dashboardu ani do `dba`. |
| Jak uruchamiać projekt lokalnie? | Projekt kolegi korzysta z `tmuxinator`. Lokalnie mają powstać skrypty, które odpalają różne packages/usługi w `tmuxinator`. Lokalnie powinny istnieć zarówno wygodne skrypty startowe, jak i konfiguracja `tmuxinator` dla multi-package dev. |
| Czy `tmuxinator` ma działać na QNAP? | Nie jako docelowy runtime. Na QNAP system ma działać przez `docker-compose`. Nie projektować QNAP wokół `tmuxinator`. |
| Czy lokalnie może istnieć Docker Compose? | Tak, lokalnie może istnieć też wariant Docker Compose / closer-to-prod, jeśli pasuje do repo, ale lokalny workflow developerski ma uwzględniać `tmuxinator`, bo tak działa wzorzec kolegi. |
| Jak ma działać QNAP? | QNAP ma uruchamiać usługi przez `docker-compose`, z trwałymi bind mountami/volume na katalogach QNAP. |
| Co z MongoDB na QNAP? | MongoDB działa w kontenerze, ale dane nie mogą być w warstwie kontenera. Dane mają być zapisane w katalogu QNAP, np. `/share/ContainerData/chad/mongodb/...`, i objęte backupem/snapshotem. |
| Czy MongoDB zastępuje CP od razu? | Nie. Migracja ma być stopniowa. Istniejące dane CP pozostają kompatybilne, ale nowe feature'y tabelowe, szczególnie `daily habits` i `dates`, mają iść Mongo-first. |
| Co jest najważniejsze dla kompatybilności MongoDB z CP? | Jeden dokument Mongo odpowiada jednemu plikowi CP. Klucz kompatybilności to `address + fileName`. Dla jednego itemu CP są dwa dokumenty Mongo: `config.yaml` i `body.txt`. |
| Czy `cp_files` to pojęcie z Content Providera? | Nie. `cp_files` to tylko przykładowa nazwa kolekcji MongoDB. Preferowana neutralna nazwa może być `content_provider_files`. Najważniejszy jest model `address + fileName`, nie nazwa kolekcji. |
| Czy używać `settings` czy `config`? | `settings` to stara / legacy nazwa. Aktualna nazwa to `config`. Dodatkowe pola idą do `remaining_config`, nie `remaining_settings`. |
| Czy `repoGuid` i `loca` mają być głównymi polami w Mongo? | Nie. `repoGuid`, `loca`, `parentAddress`, `physicalKey`, `depth`, `ancestors` mogą być cache/derived fields wyliczane z `address`, ale source of truth to `address + config.yaml + body.txt`. |
| Co z zakładką `Folders`? | W dashboardzie ma być zakładka `Folders`, która pokazuje człowiekowi strukturę danych podobnie jak stary Blazor UI czytający Content Provider API. Ma pokazywać logical names oraz techniczne adresowanie (`address`, wyliczone `loca`) bez mylenia ich z filesystem path. |
| Jak dokumentować feature'y i bugi? | Feature'y dokumentować w `architecture/[project]/features/[feature].md`, bugi w `architecture/[project]/bugs/[bug].md`. |
| Jaka ma być pierwsza faza pracy Cline/Claude? | Pierwsza faza to analiza i plan. Nie implementować od razu bez przeczytania dokumentacji, kodu, podobnych feature'ów i bugów. |

### 0.2 Matryca uruchamiania: lokalnie vs QNAP

Nie mieszaj tych środowisk.

```txt
Local Mac / dev:
    pnpm monorepo
    krótkie packages w packages/*
    skrypty developerskie
    tmuxinator do uruchamiania wielu paczek/usług
    opcjonalnie local docker-compose dla infrastruktury / closer-to-prod, jeśli repo to uzasadnia

QNAP / test-prod-prod:
    docker-compose
    kontenery
    trwałe bind mounty na /share/ContainerData/...
    backup / restore
    bez tmuxinator jako runtime
```

W praktyce przygotuj albo popraw:

- lokalny skrypt startujący przez `tmuxinator`, np. zgodnie z konwencją repo (`03_scripts/...` albo `scripts/...` po sprawdzeniu kodu),
- lokalną konfigurację `.tmuxinator.yml` albo odpowiednik istniejącego wzorca,
- QNAP `docker-compose.yml` / `docker-compose.qnap.yml` / `docker-compose.prod.yml`, zależnie od istniejącej struktury,
- osobne `.env.example` / `.env.local.example` / `.env.qnap.example`, bez sekretów.

Nie zakładaj nazw plików na ślepo. Najpierw sprawdź, jak są nazwane w repo kolegi i w obecnym repo. Ale decyzja środowiskowa jest stała: lokalnie `tmuxinator` ma być obsłużony, QNAP ma działać przez Docker Compose.

### 0.3 Repo kolegi jako wzorzec, nie cel modyfikacji

Repo `hiddengarden.events` ma być użyte tylko jako wzorzec architektury i uruchamiania. Szczególnie sprawdź tam:

- `pnpm` monorepo,
- `packages/*`,
- `.tmuxinator.yml`,
- `docker-compose.yml`,
- `docker-compose.prod.yml`,
- sposób startowania wielu procesów lokalnie,
- sposób rozdzielenia usług developerskich i produkcyjnych.

Nie przenoś bezmyślnie nazw domenowych z projektu kolegi. Adaptuj wzorzec do ekosystemu `chad` i Content Providera.

---

## Rola

Jesteś głównym architektem i programistą dla ekosystemu Chad / Content Provider.

Masz pomóc wdrożyć MongoDB na QNAP oraz przygotować integrację z dashboardem tak, żeby:

1. obecne dane Content Providera można było importować do MongoDB,
2. dane z MongoDB można było odtworzyć jako plikową strukturę Content Providera (`config.yaml` + `body.txt`),
3. dashboard miał zakładkę `Folders`, która pokazuje strukturę danych człowiekowi podobnie do starego Blazor UI czytającego Content Provider API,
4. nowe feature'y tabelowe, szczególnie `daily habits` i `dates`, były projektowane już w kierunku MongoDB,
5. mimo przechodzenia na MongoDB zachowana była kompatybilność z Content Providerem.

Nie zgaduj architektury. Najpierw dokumentacja, potem kod.

---

# 1. Kontekst projektowy

Projekty w ekosystemie:

- `Content Provider` / `.NET` – obecna plikowa baza danych i API.
- `chad-dba` / TypeScript – wspólna paczka do dostępu do Content Providera / danych.
- `chad-dashboard` / Next.js – dashboard webowy.
- `chad-console` / TypeScript CLI – konsola i logika CLI.
- `content-finder` – CLI/tester wywołań `/invoke`.
- `plugin_nodejs` – pomocniczy plugin do otwierania plików/folderów/terminala.

Najważniejsza zasada:

> Nie wolno stworzyć MongoDB jako drugiego, niekompatybilnego modelu danych. MongoDB ma być stopniowym następcą / trwałym store / read-modelem, ale musi zachować możliwość importu z Content Providera i eksportu do struktury Content Providera.

---

# 2. Kierunek strategiczny: powolne przechodzenie z Content Providera na MongoDB

Chcemy powoli przechodzić z Content Providera na MongoDB.

Nie robimy jednorazowego przepisywania całego systemu. Etapy mają być bezpieczne:

1. **Etap 1 – kompatybilny mirror/import:** MongoDB potrafi przechowywać dane Content Providera w modelu bezstratnym.
2. **Etap 2 – dashboard czyta część danych z MongoDB:** szczególnie zakładka `Folders` i podgląd struktury.
3. **Etap 3 – nowe feature'y powstają Mongo-first:** szczególnie tabele do trackowania `daily habits` i `dates`.
4. **Etap 4 – stare dane CP mogą być dalej importowane/eksportowane:** nie tracimy dostępu do Dropbox/filesystem CP.
5. **Etap 5 – CP może stać się warstwą kompatybilności / eksportu, a Mongo głównym storage dla nowych funkcji.**

Dla nowych feature'ów tabelowych nie projektuj już rozwiązania wyłącznie pod stare API Content Providera, jeśli MongoDB jest dostępne. Projektuj je Mongo-first, ale z obowiązkową kompatybilnością:

- musi istnieć mapping/projection do modelu CP-compatible,
- dane muszą być widoczne w `Folders`,
- musi istnieć możliwość eksportu do `config.yaml` + `body.txt`,
- nie wolno stworzyć domenowego modelu, którego nie da się powiązać z `address + fileName`.

---

# 3. Dokumenty, które musisz najpierw przeczytać

Zanim zrobisz jakiekolwiek zmiany, przeczytaj:

1. `26-07-10_cp_compedium.md`, jeśli jest dostępny.
2. `architecture/chad-dba/project-goal.md`
3. `architecture/chad-dba/import-dba.md`
4. `architecture/chad-dba/data-access.md`
5. `architecture/chad-dba/cp-paths.md`
6. `architecture/chad-dba/resolve-paths.md`
7. `architecture/chad-dba/post-parent-item.md`
8. `architecture/ai-docs/feature-documentation-rules.md`
9. istniejące dokumenty w:
   - `architecture/chad-dashboard/features`
   - `architecture/chad-dashboard/bugs`
   - `architecture/chad-dba/features`
   - `architecture/chad-dba/bugs`

Jeśli któryś plik nie istnieje, zapisz to w analizie i znajdź najbliższy aktualny odpowiednik.

Nie zaczynaj implementacji, dopóki nie wypiszesz:

- jakie dokumenty przeczytałeś,
- jakie istniejące rozwiązania znalazłeś,
- jakie podobne bugi/feature'y mogą mieć znaczenie.

---

# 4. Najważniejsze założenia Content Providera

Content Provider jest plikową bazą danych.

Założenia:

- pliki są source of truth,
- brak SQL,
- offline-first,
- synchronizacja przez Dropbox,
- backend jest cienką warstwą HTTP,
- wiele aplikacji korzysta z tych samych danych.

Każdy `Item` jest w praktyce folderem/węzłem z metadanymi i body.

Typowa struktura plikowa:

```txt
01/
    config.yaml
    body.txt
    01/
    02/
```

`config.yaml` zawiera metadata:

- `id`
- `type`
- `name`
- `address`
- `created`
- inne pola configu

`body.txt` / `Body` zawiera treść itemu.

Dla folderów `Body` często jest mapą dzieci:

```json
{
  "01": "contacts",
  "02": "status"
}
```

Dla itemów `Text`, `Body` jest finalną treścią tekstową.

Fizyczne foldery muszą być numeryczne:

```txt
01
02
03
001
002
```

Niepoprawne fizyczne foldery:

```txt
status
contacts
msg workout
msg planner
leads
```

Jeżeli fizycznie powstaje folder `status`, `contacts`, `msg workout`, `msg planner`, `leads`, repo jest uszkodzone. To są logical names, a nie physical folder names.

---

# 5. Logical names, repo, loca, address

Nie myl tych pojęć.

Przykład:

```txt
repoGuid = 21d11bdc-f1f4-44d1-b61a-3fa6b039c641
loca = 03/21/05
address = 21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/21/05
```

Ścieżka:

```txt
leads / msg planner / 26-06-19
```

to nie jest filesystem path.

To jest sekwencja logical names z `config.yaml`.

Poprawny flow:

1. `GetByNames(repoGuid, "leads", "msg planner")`
2. z response pobrać `Settings.address` albo `Config.address`
3. wyciągnąć numeric `loca`
4. dopiero wtedy używać `GetItem`, `Put`, `FindRecursively`, `PostParentItem`

Nie wolno robić:

```txt
/path/to/repo/leads/msg planner/26-06-19
```

---

# 6. API Content Providera – `/invoke`

Publiczny pattern `/invoke`:

```txt
IRepoService -> Worker -> Method -> args
```

Najważniejsze workery:

- `IItemWorker`
- `IManyItemsWorker`
- `IMethodWorker`

Przykłady:

```json
[
  "IRepoService",
  "IItemWorker",
  "GetByNames",
  "21d11bdc-f1f4-44d1-b61a-3fa6b039c641",
  "leads",
  "all items"
]
```

```json
[
  "IRepoService",
  "IItemWorker",
  "GetItem",
  "21d11bdc-f1f4-44d1-b61a-3fa6b039c641",
  "03/21/05"
]
```

```json
[
  "IRepoService",
  "IItemWorker",
  "Put",
  "21d11bdc-f1f4-44d1-b61a-3fa6b039c641",
  "03/21/05",
  "Text",
  "26-06-19",
  "...content..."
]
```

```json
[
  "IRepoService",
  "IItemWorker",
  "PostParentItem",
  "21d11bdc-f1f4-44d1-b61a-3fa6b039c641",
  "03/06/79",
  "Text",
  "msg workout"
]
```

```json
[
  "IRepoService",
  "IManyItemsWorker",
  "GetManyByName",
  "21d11bdc-f1f4-44d1-b61a-3fa6b039c641",
  "03/06",
  "status"
]
```

```json
[
  "IRepoService",
  "IMethodWorker",
  "FindRecursively",
  "21d11bdc-f1f4-44d1-b61a-3fa6b039c641",
  "03/06",
  "//todo"
]
```

Jeżeli API zwraca `error:`, nie maskuj tego pustą listą. Pokaż błąd diagnostycznie i napraw przyczynę.

---

# 7. Cel zadania

Masz przygotować architekturę i implementację dla:

1. MongoDB uruchamianego w Dockerze na QNAP.
2. Trwałego przechowywania danych poza kontenerem.
3. Backupów MongoDB na QNAP.
4. Modelu danych MongoDB kompatybilnego z Content Providerem.
5. Adaptera/importera/exportera między Content Providerem i MongoDB.
6. Zakładki `Folders` w `chad-dashboard`, pokazującej strukturę danych człowiekowi podobnie do starego Blazor UI.
7. Kierunku migracji nowych feature'ów tabelowych (`daily habits`, `dates`) na MongoDB.
8. Lokalnego workflow developerskiego z `tmuxinator` dla wielu paczek/usług.
9. QNAP runtime przez `docker-compose`, bez `tmuxinator` jako runtime na QNAP.
10. Dokumentacji feature'a/bugfixów w `architecture/...`.

---

# 8. MongoDB na QNAP – wymagania infrastrukturalne

MongoDB ma działać w Dockerze, ale dane nie mogą być zapisane tylko w warstwie kontenera.

Wymagany trwały storage:

```txt
/share/ContainerData/chad/mongodb/db:/data/db
/share/ContainerData/chad/mongodb/configdb:/data/configdb
/share/ContainerData/chad/mongodb/backups:/backups
```

Możesz dostosować dokładne ścieżki po sprawdzeniu istniejących konwencji w repo, ale zasada jest obowiązkowa:

> Dane MongoDB mają być w bind mount / volume na QNAP, nie w ephemeral container layer.

Przygotuj `docker-compose.yml` albo dopisz usługę do istniejącego compose, zależnie od aktualnej architektury.

Przykładowy kierunek:

```yaml
services:
  mongodb:
    image: mongo:7
    container_name: chad-mongodb
    restart: unless-stopped
    ports:
      - "${MONGODB_PORT:-27017}:27017"
    environment:
      MONGO_INITDB_ROOT_USERNAME: "${MONGO_ROOT_USERNAME}"
      MONGO_INITDB_ROOT_PASSWORD: "${MONGO_ROOT_PASSWORD}"
    volumes:
      - /share/ContainerData/chad/mongodb/db:/data/db
      - /share/ContainerData/chad/mongodb/configdb:/data/configdb
      - /share/ContainerData/chad/mongodb/backups:/backups
```

Nie commituj sekretów.

Przygotuj:

- `.env.example`
- instrukcję `.env.qnap.example`, jeśli projekt ma już taki pattern
- dokumentację uruchomienia
- dokumentację backup/restore

W `.env.example` użyj tylko placeholderów:

```env
MONGODB_PORT=27017
MONGO_ROOT_USERNAME=change_me
MONGO_ROOT_PASSWORD=change_me
MONGODB_URI=mongodb://change_me:change_me@localhost:27017/chad?authSource=admin
```

## 8.1 Strategia uruchamiania: local scripts, tmuxinator, docker-compose

Wymaganie środowiskowe jest rozdzielone:

### Lokalnie na Macu

Lokalnie projekt ma wspierać workflow podobny do projektu kolegi, który uruchamia wiele paczek/usług przez `tmuxinator`.

Przygotuj albo popraw:

- `.tmuxinator.yml` albo plik zgodny z istniejącą konwencją,
- skrypt startowy local-dev, który odpala `tmuxinator` z katalogu root monorepo,
- jasny opis, jakie panes/procesy są uruchamiane,
- komendy `pnpm --filter ... dev` albo odpowiedniki po sprawdzeniu rzeczywistych nazw pakietów,
- osobny skrypt stop/restart, jeśli pasuje do repo.

Przykładowy kierunek, nie kopiuj bez sprawdzenia nazw pakietów:

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
tmuxinator start -c .
```

W `.tmuxinator.yml` panele powinny odpowiadać realnym paczkom i usługom. Na start nie uruchamiaj `contacts` jako osobnej aplikacji, jeśli pierwsza wersja ma tylko przygotować dashboard pod integrację z contacts.

### Lokalnie przez Docker Compose

Lokalnie może też istnieć wariant Docker Compose, szczególnie dla infrastruktury typu MongoDB albo closer-to-prod testu. Nie zastępuje to wymagania `tmuxinator` dla local dev.

### QNAP

Na QNAP nie używaj `tmuxinator` jako runtime. QNAP ma mieć `docker-compose`:

- MongoDB,
- dashboard,
- potrzebne API/usługi,
- persistent volumes/bind mounts,
- backup/restore,
- env file dla QNAP.

Jeśli istnieją osobne pliki compose dla `dev`, `test`, `prod`, zachowaj ten podział zamiast robić jeden chaotyczny plik.

---

# 9. Backup MongoDB na QNAP

Przygotuj skrypt backupu, np.:

```bash
#!/usr/bin/env bash
set -euo pipefail

DATE="$(date +%Y-%m-%d_%H-%M-%S)"
BACKUP_DIR="/backups/$DATE"

mkdir -p "$BACKUP_DIR"

mongodump \
  --uri="$MONGODB_URI" \
  --out="$BACKUP_DIR"

echo "MongoDB backup created: $BACKUP_DIR"
```

Jeżeli backup ma być uruchamiany z hosta QNAP, dostosuj skrypt do `docker exec`.

Przygotuj też restore script:

```bash
mongorestore --uri="$MONGODB_URI" /backups/<backup-folder>
```

W dokumentacji napisz jasno:

- sam `docker stop` nie usuwa danych,
- `docker rm` nie usuwa danych, jeśli bind mount zostaje,
- usunięcie katalogu `/share/ContainerData/chad/mongodb/db` usuwa dane,
- backup logiczny `mongodump` jest bezpieczniejszy niż kopiowanie aktywnych plików bazy,
- snapshoty QNAP mogą być dodatkowym zabezpieczeniem, ale nie zastępują testowanego restore.

Test obowiązkowy:

1. uruchom MongoDB,
2. zapisz testowy dokument,
3. zatrzymaj kontener,
4. usuń kontener,
5. uruchom kontener ponownie z tym samym mountem,
6. sprawdź, że testowy dokument nadal istnieje.

---

# 10. Model MongoDB kompatybilny z Content Providerem

## 10.1 Najważniejsza korekta

MongoDB ma odwzorowywać **pliki Content Providera**, a nie tworzyć od razu nowy model domenowy typu:

```txt
leads
contacts
statuses
msgPlanner
dailyHabits
dates
```

Rdzeniem kompatybilności ma być zapis plików CP.

Content Provider ma strukturę:

```txt
item folder
    config.yaml
    body.txt
```

MongoDB ma to odwzorować tak, że:

> jeden dokument MongoDB odpowiada jednemu plikowi Content Providera.

Czyli dokument ma mieć:

```yaml
fileName: "config.yaml"
```

albo:

```yaml
fileName: "body.txt"
```

Dla jednego itemu CP mamy więc dwa dokumenty MongoDB:

```txt
[address] + config.yaml
[address] + body.txt
```

## 10.2 `cp_files` nie jest pojęciem Content Providera

Bardzo ważne doprecyzowanie:

`cp_files` nie jest istniejącym pojęciem w Content Providerze.

To jest tylko proponowana nazwa kolekcji MongoDB, która ma przechowywać pliki Content Providera.

Content Provider nadal ma strukturę:

```txt
item folder
    config.yaml
    body.txt
```

MongoDB ma to odwzorować tak, że jeden dokument Mongo odpowiada jednemu plikowi CP.

Kolekcja może się nazywać np.:

```txt
cp_files
content_provider_files
item_files
cp_documents
```

Nazwa kolekcji jest drugorzędna.

Preferowana neutralna nazwa na tym etapie:

```txt
content_provider_files
```

Jeżeli w istniejącym kodzie albo dokumentacji pojawi się `cp_files`, traktuj to jako skrót / nazwę technicznej kolekcji MongoDB, a nie jako element Content Providera.

Najważniejszy model to:

```txt
address + fileName
```

Unikalność:

```js
db.content_provider_files.createIndex(
  { address: 1, fileName: 1 },
  { unique: true }
)
```

Nie chodzi o to, że Content Provider ma coś o nazwie `cp_files`.

Chodzi o to, że MongoDB potrzebuje kolekcji, w której zapiszemy pliki Content Providera w sposób zgodny z CP.

## 10.3 Przykład dokumentu dla `config.yaml`

```js
{
  fileName: "config.yaml",

  id: "8b603669-f8e6-4224-bd78-a474998995fa",
  type: "Folder",
  name: "kamil_s",
  address: "8b603669-f8e6-4224-bd78-a474998995fa",
  created: "26-07-14__17-30-20",

  remaining_config: {},

  rawYaml: `id: "8b603669-f8e6-4224-bd78-a474998995fa"
type: "Folder"
name: "kamil_s"
address: "8b603669-f8e6-4224-bd78-a474998995fa"
created: "26-07-14__17-30-20"
`
}
```

Wymagane pola `config.yaml`:

```yaml
id: "8b603669-f8e6-4224-bd78-a474998995fa"
type: "Folder"
name: "kamil_s"
address: "8b603669-f8e6-4224-bd78-a474998995fa"
created: "26-07-14__17-30-20"
```

Dla itemu repo/root:

```txt
id == address
```

Dla itemu niżej:

```yaml
id: "e6e187dd-97dd-49c1-8a53-1306b8bd7043"
type: "Text"
name: "26-06-19"
address: "8b603669-f8e6-4224-bd78-a474998995fa/01/03/05"
created: "26-07-14__17-30-20"
```

Tutaj:

```txt
address = repoAddress + numeric path
```

Pierwszy segment `address` wskazuje repo.

Nie trzeba dodawać osobnego pola `repoGuid` jako source of truth.

## 10.4 Ważna zmiana nazewnictwa: `settings` → `config`

Wcześniej w rozmowach i części starszego kodu pojawiała się nazwa:

```txt
settings
```

To jest stara / nieaktualna nazwa.

Aktualnie poprawna nazwa pojęcia to:

```txt
config
```

Dlatego w Mongo nie używamy:

```txt
remaining_settings
```

Tylko:

```txt
remaining_config
```

Czyli:

```js
{
  fileName: "config.yaml",

  id: "...",
  type: "...",
  name: "...",
  address: "...",
  created: "...",

  remaining_config: {
    isImportant: true
  }
}
```

A przy odtwarzaniu `config.yaml` składamy:

```txt
required config fields
+
remaining_config
```

Jeżeli starsze aplikacje oczekują pola `Settings`, można na warstwie kompatybilności zwrócić alias:

```ts
const item = {
  Body: bodyDoc?.content ?? "",
  Config: fullConfig,
  Settings: fullConfig, // legacy alias only
  Address: fullConfig.address
};
```

Dokumentacja ma jasno mówić:

```txt
Config = aktualna nazwa
Settings = stara/legacy nazwa
```

## 10.5 Przykład dokumentu dla `body.txt`

```js
{
  fileName: "body.txt",

  address: "8b603669-f8e6-4224-bd78-a474998995fa/01/03/05",

  content: `//sorted
    //1; obowiązkowo nowe
        d; 26-05-12_pi_Marzenka_Styk
`,

  contentType: "text"
}
```

`body.txt` nie musi mieć:

```txt
id
type
name
created
```

Bo to należy do `config.yaml` itemu.

Łącznikiem pomiędzy `config.yaml` i `body.txt` jest:

```txt
address
```

## 10.6 Jeden item jako dwa dokumenty

Item w filesystemie:

```txt
8b603669-f8e6-4224-bd78-a474998995fa/01/03/05/
    config.yaml
    body.txt
```

MongoDB:

```js
{
  fileName: "config.yaml",

  id: "e6e187dd-97dd-49c1-8a53-1306b8bd7043",
  type: "Text",
  name: "26-06-19",
  address: "8b603669-f8e6-4224-bd78-a474998995fa/01/03/05",
  created: "26-07-14__17-30-20",

  remaining_config: {
    isImportant: true
  }
}
```

oraz:

```js
{
  fileName: "body.txt",

  address: "8b603669-f8e6-4224-bd78-a474998995fa/01/03/05",

  content: `//sorted
    //1; obowiązkowo nowe
        d; 26-05-12_pi_Marzenka_Styk
`,

  contentType: "text"
}
```

## 10.7 Nie dodawać wymyślonych pól jako source of truth

Nie chcemy modelu, w którym główne pola source of truth to wymyślone:

```txt
repoGuid
repo
loca
childrenMap
parentLoca
physicalKey
```

Te informacje wynikają z:

```txt
address
config.yaml
body.txt
```

Przykład:

```txt
address:
8b603669-f8e6-4224-bd78-a474998995fa/01/03/05
```

Z tego można wyliczyć:

```txt
repoAddress = 8b603669-f8e6-4224-bd78-a474998995fa
loca = 01/03/05
parentAddress = 8b603669-f8e6-4224-bd78-a474998995fa/01/03
physicalKey = 05
depth = 3
```

Ale te pola są **derived/cache**, nie source of truth.

Można je przechowywać w MongoDB dla wydajności, np.:

```js
{
  parentAddress: "8b603669-f8e6-4224-bd78-a474998995fa/01/03",
  physicalKey: "05",
  repoAddress: "8b603669-f8e6-4224-bd78-a474998995fa",
  depth: 3,
  ancestors: [
    "8b603669-f8e6-4224-bd78-a474998995fa",
    "8b603669-f8e6-4224-bd78-a474998995fa/01",
    "8b603669-f8e6-4224-bd78-a474998995fa/01/03"
  ]
}
```

Ale bardzo ważne:

```txt
parentAddress
physicalKey
repoAddress
depth
ancestors
loca
repoGuid
```

to pola wyliczalne z `address`, czyli cache/denormalizacja, nie główna prawda.

Poprzedni model `cp_items` z `repoGuid` i `loca` jako głównymi polami był zły / mniej kompatybilny, bo w Content Providerze source of truth jest `address` zapisany w `config.yaml`.

## 10.8 Indeksy

Podstawowy indeks:

```js
db.content_provider_files.createIndex(
  { address: 1, fileName: 1 },
  { unique: true }
)
```

Dla szybkiego `GetByNames` można dodać indeks po derived/cache fields:

```js
db.content_provider_files.createIndex(
  { parentAddress: 1, name: 1, fileName: 1 }
)
```

Dla wyszukiwania descendantów:

```js
db.content_provider_files.createIndex(
  { ancestors: 1, name: 1, fileName: 1 }
)
```

Dla body/search:

```js
db.content_provider_files.createIndex(
  { fileName: 1, address: 1 }
)
```

Na później można rozważyć text index / Atlas Search dla `body.txt.content`.

## 10.9 Jak znaleźć repo, parent i dzieci z `address`

Repo wynika z pierwszego segmentu `address`.

Przykład:

```txt
8b603669-f8e6-4224-bd78-a474998995fa/01/03/05
```

Repo:

```txt
8b603669-f8e6-4224-bd78-a474998995fa
```

Dla root repo:

```txt
8b603669-f8e6-4224-bd78-a474998995fa
```

repo address jest całym `address`.

Parent wynika z `address`:

```txt
8b603669-f8e6-4224-bd78-a474998995fa/01/03/05
```

Parent:

```txt
8b603669-f8e6-4224-bd78-a474998995fa/01/03
```

Physical key:

```txt
05
```

Dla root repo parent jest pusty / null.

Dzieci itemu można znaleźć po `address`.

Parent:

```txt
8b603669-f8e6-4224-bd78-a474998995fa/01/03
```

Dzieci to itemy, których `address` ma dokładnie jeden segment więcej:

```txt
8b603669-f8e6-4224-bd78-a474998995fa/01/03/{nextSegment}
```

i które mają:

```txt
fileName = config.yaml
```

Dla wydajności można używać derived pola:

```js
parentAddress: "8b603669-f8e6-4224-bd78-a474998995fa/01/03"
```

Wtedy query:

```js
db.content_provider_files.find({
  fileName: "config.yaml",
  parentAddress: "8b603669-f8e6-4224-bd78-a474998995fa/01/03"
})
```

---

# 11. Operacje CP odwzorowane w MongoDB

## 11.1 `GetItem` w MongoDB

`GetItem(address)` albo kompatybilne `GetItem(repo, loca)` składa item z dwóch dokumentów:

```ts
const configDoc = await content_provider_files.findOne({
  address,
  fileName: "config.yaml"
});

const bodyDoc = await content_provider_files.findOne({
  address,
  fileName: "body.txt"
});
```

Potem składamy CP-compatible item:

```ts
const fullConfig = {
  id: configDoc.id,
  type: configDoc.type,
  name: configDoc.name,
  address: configDoc.address,
  created: configDoc.created,
  ...configDoc.remaining_config
};

const item = {
  Body: bodyDoc?.content ?? "",
  Config: fullConfig,
  Settings: fullConfig, // legacy alias only
  Address: configDoc.address
};
```

## 11.2 `GetByNames` w MongoDB

`GetByNames` odwzorowujemy przez przechodzenie po dzieciach i porównywanie `name` z `config.yaml`.

Pseudo-code:

```ts
async function getByNames(rootAddress: string, names: string[]) {
  let currentAddress = rootAddress;

  for (const name of names) {
    const found = await db.content_provider_files.findOne({
      fileName: "config.yaml",
      parentAddress: currentAddress,
      name
    });

    if (!found) {
      throw new Error(`Child not found: ${name} under ${currentAddress}`);
    }

    currentAddress = found.address;
  }

  return buildItemModel(currentAddress);
}
```

Ważne:

- szukamy po `name` z `config.yaml`,
- nie po fizycznej nazwie folderu,
- nie po `body.txt`.

## 11.3 `Put` w MongoDB

`Put` dla istniejącego itemu aktualizuje body i ewentualnie config.

Body:

```ts
await content_provider_files.updateOne(
  { address, fileName: "body.txt" },
  {
    $set: {
      content: newBody
    }
  },
  { upsert: true }
);
```

Config:

```ts
await content_provider_files.updateOne(
  { address, fileName: "config.yaml" },
  {
    $set: {
      type,
      name
    }
  }
);
```

Ważne:

- `remaining_config` musi zostać zachowane,
- `id`, `address`, `created` nie powinny zostać przypadkowo nadpisane,
- jeżeli `name` się zmienia, trzeba uważać na unikalność logical name pod parentem.

## 11.4 `PostParentItem` w MongoDB

`PostParentItem` działa jako find-or-create.

Flow:

1. Weź parent address.
2. Znajdź dzieci parenta.
3. Sprawdź, czy któreś dziecko ma `name`.
4. Jeżeli istnieje, zwróć item.
5. Jeżeli nie istnieje:
   - znajdź następny numeryczny segment,
   - zbuduj child address,
   - utwórz `config.yaml`,
   - utwórz pusty `body.txt`,
   - zwróć item.

Pseudo-code:

```ts
async function postParentItem(parentAddress: string, type: string, name: string) {
  const existing = await content_provider_files.findOne({
    fileName: "config.yaml",
    parentAddress,
    name
  });

  if (existing) {
    return buildItemModel(existing.address);
  }

  const nextKey = await getNextNumericChildKey(parentAddress);
  const childAddress = `${parentAddress}/${nextKey}`;

  await content_provider_files.insertOne({
    fileName: "config.yaml",
    id: crypto.randomUUID(),
    type,
    name,
    address: childAddress,
    created: formatCpDate(new Date()),
    remaining_config: {},
    parentAddress,
    physicalKey: nextKey
  });

  await content_provider_files.insertOne({
    fileName: "body.txt",
    address: childAddress,
    content: "",
    contentType: "text",
    parentAddress,
    physicalKey: nextKey
  });

  return buildItemModel(childAddress);
}
```

Ważne:

- nie wolno tworzyć fizycznego folderu o nazwie logicznej,
- child address musi kończyć się numerycznym segmentem,
- operacja powinna być atomowa albo transakcyjnie bezpieczna na poziomie aplikacji.

## 11.5 `GetManyByName` w MongoDB

`GetManyByName(parentAddress, name)` może działać przez descendants.

Na start można użyć prefixu address:

```js
db.content_provider_files.find({
  fileName: "config.yaml",
  address: { $regex: `^${escapeRegex(parentAddress)}/` },
  name
})
```

Lepsza wersja z cachem:

```js
db.content_provider_files.find({
  fileName: "config.yaml",
  ancestors: parentAddress,
  name: "status"
})
```

`ancestors` to pole derived/cache.

## 11.6 `FindRecursively` w MongoDB

`FindRecursively(address, phrase)` szuka w body descendantów.

Wersja prosta:

```js
db.content_provider_files.find({
  fileName: "body.txt",
  address: { $regex: `^${escapeRegex(parentAddress)}/` },
  content: { $regex: phrase, $options: "i" }
})
```

Docelowo można dodać text index albo Atlas Search.

---

# 12. Import / Export między filesystem CP i MongoDB

## 12.1 Import z filesystemu Content Providera do MongoDB

Flow importu:

1. Przejdź po filesystemie CP.
2. Dla każdego folderu itemu:
   - odczytaj `config.yaml`,
   - odczytaj `body.txt`,
   - utwórz dokument `config.yaml`,
   - utwórz dokument `body.txt`.
3. Required fields z YAML zapisz jako top-level fields.
4. Resztę YAML zapisz jako `remaining_config`.
5. Wylicz opcjonalne cache fields:
   - `parentAddress`,
   - `physicalKey`,
   - `repoAddress`,
   - `depth`,
   - `ancestors`,
   - `loca` jako cache, jeśli potrzebne dla UI/API.
6. Zapisz `rawYaml` opcjonalnie.
7. Waliduj:
   - required fields,
   - zgodność address,
   - numeryczne segmenty,
   - obecność body.

Można też rozważyć import przez Content Provider API `/invoke`, ale nie wolno zgadywać. Sprawdź realny kod, repo, ścieżki i wybierz najmniej ryzykowną metodę.

Dla pierwszego etapu wystarczy import wybranych gałęzi:

- `leads / all items`
- `leads / msg planner`
- `reports`
- `beeper`
- opcjonalnie pojedyncze leady i ich children

## 12.2 Export z MongoDB do filesystemu Content Providera

Flow eksportu:

1. Weź wszystkie dokumenty `config.yaml`.
2. Dla każdego:
   - zbuduj ścieżkę folderu z `address`,
   - złóż YAML z required fields + `remaining_config`,
   - zapisz jako `config.yaml`.
3. Znajdź dokument `body.txt` dla tego samego `address`.
4. Zapisz `content` jako `body.txt`.
5. Nie generuj fizycznych folderów z logical names.

To jest warunek kompatybilności.

Przykład:

Jeżeli Mongo ma:

```txt
address = 21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/21/05
fileName = config.yaml
name = 26-06-19
type = Text
```

oraz:

```txt
address = 21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/21/05
fileName = body.txt
content = ...
```

to exporter musi umieć odtworzyć:

```txt
/repos/21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/21/05/config.yaml
/repos/21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/21/05/body.txt
```

W `config.yaml` zachowaj logical name i typ.

W `body.txt` zachowaj body.

Dla folderów body może być mapą dzieci.

## 12.3 Round-trip test

Obowiązkowy test:

1. Pobierz item z Content Providera albo z filesystemu CP.
2. Zapisz do MongoDB jako dwa dokumenty: `config.yaml` i `body.txt`.
3. Odczytaj z MongoDB.
4. Wyeksportuj do tymczasowego folderu CP.
5. Porównaj:
   - `address`,
   - `id`,
   - `type`,
   - `name`,
   - `created`,
   - `remaining_config`,
   - `body.txt content`.
6. Test ma pokazać, czy transformacja jest bezstratna.

Jeżeli nie jest bezstratna, opisz dokładnie warning.

---

# 13. Domenowe kolekcje jako cache/view, a nie pierwszy source of truth

Na starcie nie twórz podstawowego source of truth jako:

```txt
leads
contacts
statuses
msgPlanner
```

Jeżeli będą potrzebne, mogą istnieć jako views/cache:

```txt
cp_leads_view
cp_statuses_view
cp_contacts_view
cp_msg_planner_view
```

Views można przebudować z `content_provider_files`.

Dla istniejących danych CP source of truth kompatybilności zostaje:

```txt
address + config.yaml + body.txt
```

---

# 14. Nowe feature'y tabelowe: `daily habits` i `dates`

To jest ważny kierunek migracyjny.

Nowe feature'y tabelowe, szczególnie:

- `daily habits`,
- `dates`,

mają być projektowane Mongo-first, bo chcemy stopniowo przechodzić z Content Providera na MongoDB.

Jednocześnie nie wolno zrywać kompatybilności z CP.

## 14.1 Zasada dla nowych tabel

Dla nowych tabel możesz zaproponować Mongo-native kolekcje domenowe, ale tylko pod warunkiem, że:

1. mają stabilny mapping do CP-compatible itemów,
2. da się je pokazać w zakładce `Folders`,
3. da się je wyeksportować do `config.yaml` + `body.txt`,
4. nie blokują importu/eksportu CP,
5. nie tworzą dwóch niezależnych prawd bez strategii synchronizacji.

Preferowany pierwszy etap:

- `content_provider_files` jako kompatybilna warstwa plików CP,
- opcjonalne Mongo-native kolekcje dla tabel jako wygodny write/read model,
- obowiązkowy projection/export tych tabel do CP-compatible tree.

## 14.2 Przykładowy mapping dla tabel

Tabele mogą być materializowane jako CP-compatible tree, np.:

```txt
root repo
└── tables
    ├── daily habits
    │   ├── config.yaml
    │   ├── body.txt
    │   ├── 01/    # habit definition albo row group
    │   ├── 02/    # entries
    │   └── ...
    └── dates
        ├── config.yaml
        ├── body.txt
        ├── 01/
        ├── 02/
        └── ...
```

Nie traktuj `tables/daily habits` jako fizycznego filesystem path. To logical path. Fizyczne foldery nadal muszą być numeryczne.

## 14.3 Daily habits – kierunek

Dla `daily habits` prawdopodobnie będą potrzebne:

- definicje habitów,
- wpisy dzienne,
- status wykonania,
- data,
- notatki,
- opcjonalnie streak/statystyki.

MongoDB może mieć wygodne kolekcje typu:

```txt
daily_habit_definitions
daily_habit_entries
```

ale muszą mieć pola kompatybilności, np.:

```ts
type DailyHabitEntry = {
  _id: ObjectId;
  habitId: string;
  date: string;              // YYYY-MM-DD
  value: boolean | number | string;
  note?: string;
  createdAt: string;
  updatedAt: string;

  cpCompatibility?: {
    address?: string;
    exportPathByNames?: string[]; // np. ["tables", "daily habits", "entries", "2026-07-10"]
    exportableToCp: boolean;
  };
};
```

Jeżeli zrobisz taką domenową kolekcję, musisz też zrobić funkcję/projection, która pokaże te dane w `Folders` jako CP-compatible item tree albo wygeneruje dokumenty `content_provider_files`.

## 14.4 Dates – kierunek

Dla `dates` prawdopodobnie będą potrzebne:

- data spotkania / wydarzenia,
- osoba / lead, jeśli dotyczy,
- status,
- miejsce,
- notatki,
- źródło,
- powiązanie z leadem albo raportem.

MongoDB może mieć wygodną kolekcję typu:

```txt
date_events
```

ale z kompatybilnością:

```ts
type DateEvent = {
  _id: ObjectId;
  date: string;              // YYYY-MM-DD albo ISO datetime
  leadName?: string;
  leadAddress?: string;
  status?: string;
  location?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;

  cpCompatibility?: {
    address?: string;
    exportPathByNames?: string[]; // np. ["tables", "dates", "2026-07"]
    exportableToCp: boolean;
  };
};
```

Jeżeli nie ma jeszcze decyzji domenowej, najpierw przygotuj prosty, generyczny table engine zamiast hardcodować zbyt dużo.

## 14.5 Czego nie robić przy tabelach

Nie rób:

- nie buduj `daily habits` i `dates` wyłącznie jako stare CP foldery, jeśli MongoDB już jest gotowe,
- nie twórz domenowych kolekcji bez `cpCompatibility` / eksportu,
- nie zakładaj, że UI tabel nie musi być widoczne w `Folders`,
- nie zapisuj tych samych danych równolegle w CP i Mongo bez strategii owner/source of truth,
- nie mieszaj logical paths z physical folderami.

## 14.6 Owner/source of truth dla nowych tabel

Dla istniejących danych legacy:

```txt
Content Provider / filesystem CP = początkowy source of truth
MongoDB = import/read-model/cache
```

Dla nowych feature'ów tabelowych:

```txt
MongoDB = preferowany source of truth
CP-compatible projection/export = warstwa kompatybilności
```

Jeżeli konkretny feature zapisuje coś w Mongo-first, dokumentacja musi jasno wskazać:

- gdzie jest source of truth,
- jak wygląda eksport do CP,
- jak wygląda widok w `Folders`,
- czy można importować z powrotem,
- co się stanie przy konflikcie.

---

# 15. Zakładka `Folders` w `chad-dashboard`

Dodaj albo popraw zakładkę/page `Folders` w `chad-dashboard`.

Cel:

> Człowiek ma widzieć strukturę Content Providera/MongoDB jako drzewo folderów/itemów, podobnie jak w Blazor UI, które czytało Content Provider API.

Wymagania UI:

## 15.1 Widok drzewa

Lewy panel:

- lista repozytoriów albo domyślnie `SHARED_REPO_ID`,
- drzewo itemów,
- wyświetlane logical names, nie tylko numeric loca,
- przy każdym node pokaż typ: `Folder` / `Text`,
- opcjonalnie mały numeric `loca` jako techniczny hint,
- oznaczenie źródła: `cp`, `mongo-import`, `mongo-native`, `projection`.

Przykład:

```txt
21d11bdc...
└── leads
    └── all items
        ├── 26-05-11_pn_Luba
        │   ├── contacts
        │   ├── status
        │   └── msg workout
        └── 26-06-07_pt_Ariadna
            ├── contacts
            └── msg workout
```

Dla nowych tabel:

```txt
app repo
└── tables
    ├── daily habits
    └── dates
```

## 15.2 Panel szczegółów

Prawy panel po kliknięciu itemu:

- logical name,
- type,
- address,
- derived repo / loca / parentAddress / physicalKey,
- source: `cp` / `mongo-import` / `mongo-native` / `projection`,
- Body preview,
- Config preview,
- raw JSON toggle,
- jeśli `Body` jest mapą folderu, pokaż to jako listę dzieci,
- jeśli `Body` jest tekstem, pokaż tekst w czytelnym podglądzie.

Nie pokazuj Body folderu jako rozmowy albo finalnego tekstu, jeżeli Body jest tylko mapą dzieci.

## 15.3 Breadcrumbs

Breadcrumbs mają być logical:

```txt
leads / all items / 26-06-07_pt_Ariadna / msg workout
```

Ale w szczegółach technicznych pokaż też:

```txt
03/06/80/02
```

## 15.4 Źródło danych

Nie importuj `chad-dba` w client components Next.js.

Poprawny pattern:

```txt
client UI -> fetch("/api/folders/...") -> Next API route/server-only code -> chad-dba / Mongo adapter
```

Opcje źródła danych:

- `Content Provider API` jako source of truth dla legacy,
- MongoDB jako read-model/cache dla zaimportowanego CP,
- MongoDB jako source of truth dla nowych tabel,
- CP-compatible projection/export dla Mongo-native danych.

Dla pierwszej wersji preferuję bezpieczny wariant:

- odczyt drzewa z MongoDB, jeśli import jest gotowy,
- możliwość odświeżenia/importu z Content Providera,
- jasne oznaczenie, skąd pochodzi aktualny widok.

## 15.5 Edycja

Pierwszy etap może być read-only.

Nie dodawaj edycji CP legacy, jeżeli nie ma testów round-trip i jasnej decyzji, kto jest source of truth.

Jeżeli dodasz edycję:

- dla legacy CP: zapis do Content Providera przez istniejące metody `Put` / `PostParentItem`, potem refresh/import do Mongo,
- dla nowych tabel Mongo-first: zapis do MongoDB, potem aktualizacja CP-compatible projection,
- nie zapisuj równolegle do dwóch miejsc bez transakcyjnego planu.

---

# 16. API routes w dashboardzie

Zaproponuj i zaimplementuj server-side API routes, np.:

```txt
GET  /api/folders/repos
GET  /api/folders/tree?repo=...
GET  /api/folders/item?address=...
POST /api/folders/import?repo=...
POST /api/folders/export?repo=...
```

Opcjonalnie:

```txt
GET /api/folders/search?repo=...&q=...
```

Dla nowych tabel można zaproponować:

```txt
GET  /api/tables/daily-habits
POST /api/tables/daily-habits
GET  /api/tables/dates
POST /api/tables/dates
POST /api/tables/project-to-folders
```

Wszystkie endpointy mają:

- zwracać diagnostyczne błędy,
- nie maskować `error:` z Content Providera,
- logować źródło danych: `cp` / `mongo-import` / `mongo-native` / `projection`,
- walidować parametry.

---

# 17. chad-dba

Jeżeli dodajesz helpery do `chad-dba`, trzymaj się zasad:

- `chad-dba` = data access,
- nie przenoś logiki konsoli do `chad-dba`,
- nie importuj `chad-dba` w client components,
- po zmianach w `chad-dba` uruchom build,
- po zmianach w lokalnej paczce odśwież zależny projekt.

Wymagany build flow:

```bash
cd /Users/pawelfluder/03_synch/01_files_programming/08_nodejs/chad-dba
npm run build

cd /Users/pawelfluder/03_synch/01_files_programming/08_nodejs/chad-dashbord
rm -rf .next
npm install
npm run dev
```

Jeżeli ścieżki są inne, najpierw sprawdź realny workspace.

---

# 18. Walidacja i integralność

Dla każdego `config.yaml` wymagane są:

```txt
id
type
name
address
created
```

Dla każdego itemu powinien istnieć:

```txt
config.yaml
body.txt
```

Dla root repo:

```txt
id == address
```

Dla non-root:

```txt
address zaczyna się od root repo address
```

Dla child itemów:

```txt
ostatni segment address jest numeryczny
```

Custom config:

- trafia do `remaining_config`,
- nie może zgubić się przy eksporcie,
- nie powinien nadpisywać required fields w niekontrolowany sposób.

Przed tworzeniem child itemów:

- sprawdź, czy children parenta mają fizyczne nazwy numeryczne,
- nie twórz folderów o logical name jako physical folder.

Jeżeli wykryjesz:

```txt
03/06/81/status
```

zamiast:

```txt
03/06/81/01
```

zatrzymaj operację i pokaż błąd integralności.

Nie używaj `FirstOrDefault` / `SingleOrDefault` jako ukrycia problemu duplikatów bez diagnozy.

Nie maskuj błędów pustą listą.

---

# 19. Testy obowiązkowe

## 19.1 MongoDB persistence

Test:

1. `docker compose up -d mongodb`
2. insert test doc
3. `docker stop chad-mongodb`
4. `docker rm chad-mongodb`
5. `docker compose up -d mongodb`
6. sprawdź, że test doc dalej istnieje

## 19.2 Backup / restore

Test:

1. wykonaj `mongodump`
2. usuń testową kolekcję albo użyj osobnej test DB
3. wykonaj `mongorestore`
4. sprawdź, że dane wróciły

## 19.3 CP filesystem/API -> Mongo import

Test:

1. pobierz realny item z CP, np. `leads / all items`
2. zapisz do MongoDB jako dwa dokumenty: `config.yaml` i `body.txt`
3. sprawdź indeks `address + fileName`
4. sprawdź `Body` i `Config`
5. sprawdź legacy alias `Settings`, jeśli API compatibility go zwraca

## 19.4 Round-trip

Test:

1. CP item/files -> Mongo docs -> CP files -> CP-like item
2. porównaj kluczowe pola
3. test musi failować przy utracie `address`, `name`, `type`, `Body`, `remaining_config`

## 19.5 Dashboard Folders UI

Test ręczny albo Playwright:

1. otwórz `chad-dashboard`
2. przejdź do `Folders`
3. zobacz drzewo repo
4. kliknij folder
5. kliknij text item
6. sprawdź, że:
   - folder body map renderuje się jako children,
   - text body renderuje się jako tekst,
   - address/name/type są widoczne,
   - derived loca/parent/physicalKey są widoczne jako techniczny hint,
   - nie ma błędów w konsoli przeglądarki.

## 19.6 Daily habits / dates compatibility

Jeżeli implementujesz `daily habits` albo `dates`, test musi sprawdzić:

1. zapis do MongoDB,
2. odczyt przez API tabeli,
3. widoczność/projection w `Folders`,
4. eksport do CP-compatible `config.yaml` + `body.txt`,
5. jasną informację w dokumentacji, że MongoDB jest source of truth dla tego feature'a.

---

# 20. Dokumentacja po wykonaniu

Po implementacji zapisz dokumentację.

Feature docs:

```txt
architecture/chad-dashboard/features/folders-view.md
architecture/chad-dba/features/cp-mongo-compatible-files-model.md
architecture/chad-dashboard/features/mongodb-qnap-persistence.md
architecture/chad-dashboard/features/mongo-first-daily-habits.md
architecture/chad-dashboard/features/mongo-first-dates.md
```

Jeżeli znajdziesz bugi, zapisz je w:

```txt
architecture/chad-dashboard/bugs/[nazwa-buga].md
architecture/chad-dba/bugs/[nazwa-buga].md
```

Każdy dokument ma zawierać:

- problem/cel,
- źródło prawdy,
- decyzje architektoniczne,
- zmienione pliki,
- jak testować,
- ryzyka,
- czego nie robić ponownie.

---

# 21. Oczekiwany sposób odpowiedzi Cline

Odpowiadaj w tej strukturze:

```txt
1. Analiza
2. Przeczytane dokumenty
3. Istniejące podobne rozwiązania / bugi
4. Decyzje architektoniczne
5. Plan implementacji
6. Zmienione pliki
7. Testy wykonane
8. Dokumentacja zapisana
9. Ryzyka / co zostało do decyzji
```

Nie pisz `completed`, jeśli nie wykonałeś testu.

Jeżeli nie możesz czegoś uruchomić, napisz dokładnie:

- czego nie uruchomiłeś,
- dlaczego,
- jaki command powinienem odpalić ręcznie,
- czego mam oczekiwać w output.

---

# 22. Najważniejsze decyzje architektoniczne

1. Content Provider pozostaje początkowym source of truth dla istniejących danych legacy.
2. MongoDB jest docelowym trwałym store dla nowych feature'ów i kompatybilnym mirror/importem dla starych danych CP.
3. Migracja CP -> MongoDB ma być stopniowa, nie jednorazowy rewrite.
4. Dla kompatybilności MongoDB przechowuje pliki CP jako dokumenty: jeden dokument Mongo = jeden plik CP.
5. Główna prawda kompatybilności to `address + fileName + config.yaml + body.txt`.
6. `cp_files` to tylko przykładowa/proponowana nazwa kolekcji MongoDB, nie pojęcie z Content Providera.
7. Preferowana neutralna nazwa kolekcji: `content_provider_files`.
8. `repoGuid`, `loca`, `parentAddress`, `physicalKey`, `ancestors` mogą istnieć tylko jako derived/cache fields wyliczalne z `address`.
9. `config` to aktualna nazwa; `settings` to legacy alias.
10. Dodatkowe pola configu trafiają do `remaining_config`, nie `remaining_settings`.
11. Musi istnieć droga eksportu MongoDB -> CP file structure.
12. `Folders` w dashboardzie ma pokazywać logical tree dla człowieka, ale nie ukrywać technicznych danych jak numeric `loca` / `address`.
13. Nowe feature'y `daily habits` i `dates` mają być Mongo-first, ale z CP-compatible projection/export.
14. Nowe monorepo ma nazywać się `chad` i używać krótkich pakietów w `packages/*`.
15. Standardem monorepo ma być `pnpm`.
16. `content-provider` ma być włączony jako Git subtree.
17. Repo kolegi `hiddengarden.events` jest wzorcem do analizy, nie miejscem do zmian.
18. Lokalny workflow developerski ma obsługiwać `tmuxinator` do odpalania wielu packages/usług.
19. QNAP runtime ma być oparty o `docker-compose`, nie `tmuxinator`.
20. Lokalnie może istnieć także Docker Compose, ale nie wolno pominąć `tmuxinator`.
21. `contacts` nie ma być uruchamiane jako osobna aplikacja w pierwszej wersji, ale dashboard ma mieć zakładkę/integrację przygotowaną pod `contacts`.
22. `console` zostaje na razie osobnym CLI; nie przenosić jej teraz do dashboardu.
23. Nie wolno mieszać logical names z filesystem path.
24. Nie wolno importować `chad-dba` w Next client components.
25. Nie wolno maskować błędów pustymi listami.
26. Nie wolno zapisywać sekretów do repo.
27. Nie wolno trzymać MongoDB danych tylko w kontenerze.

---

# 23. Minimalny zakres pierwszego etapu

Jeżeli zadanie okaże się duże, zrób pierwszy etap w takim zakresie:

1. Docker Compose dla MongoDB z trwałym bind mountem na QNAP.
2. Lokalny skrypt startowy przez `tmuxinator` dla monorepo/packages.
3. `.env.example` oraz rozdzielenie env lokalny/QNAP, jeśli repo ma taki pattern.
4. Skrypt backup/restore.
5. Mongo schema + indexes dla `content_provider_files`.
6. Adapter CP files/items ↔ Mongo file docs.
7. Import jednego/drugiego znanego drzewa z CP, np. `leads / all items`.
8. Read-only zakładka `Folders`.
9. Dokumentacja i test persistence.

Dopiero potem można rozbudowywać:

- edycję,
- pełną synchronizację,
- harmonogram importów,
- konflikty CP vs Mongo,
- Mongo-first `daily habits`,
- Mongo-first `dates`,
- multi-user auth,
- większe źródła danych,
- pełne uruchamianie `contacts`,
- ewentualne przeniesienie `console` do dashboardu w przyszłości.

---

# 24. Konkretne rzeczy, których masz nie robić

Nie rób:

- nie twórz starego modelu `cp_items` z `repoGuid` i `loca` jako główną prawdą,
- nie traktuj `cp_files` jako pojęcia Content Providera,
- nie twórz Mongo modelu bez `address + fileName`,
- nie zapisuj itemów jako luźnych dokumentów bez możliwości odtworzenia `config.yaml` i `body.txt`,
- nie używaj `remaining_settings`; używaj `remaining_config`,
- nie rób fizycznych folderów z logical names,
- nie importuj `chad-dba` w client components,
- nie używaj `tmuxinator` jako runtime na QNAP,
- nie pomijaj `tmuxinator` w lokalnym workflow,
- nie uruchamiaj `contacts` jako osobnej aplikacji w pierwszym etapie, jeśli zadanie mówi tylko o przygotowaniu dashboardu pod contacts,
- nie przenoś teraz `console` do dashboardu,
- nie modyfikuj repo kolegi `hiddengarden.events`,
- nie commituj haseł,
- nie zakładaj, że `Body` folderu to finalna treść,
- nie pokazuj mapy children jako rozmowy,
- nie maskuj błędów Content Providera,
- nie przenoś logiki konsoli do `chad-dba`,
- nie zmieniaj niezwiązanych repozytoriów,
- nie refaktoruj całego systemu przy okazji,
- nie buduj `daily habits` i `dates` jako Mongo-native danych bez planu CP-compatible projection/export.

---

# 25. Definition of Done

Zadanie jest wykonane dopiero, gdy:

- MongoDB uruchamia się w Dockerze,
- QNAP ma Docker Compose jako runtime,
- lokalny workflow ma skrypt / konfigurację `tmuxinator`,
- dane są trwale zapisane poza kontenerem,
- istnieje backup i restore,
- jest schema kompatybilna z CP: jeden dokument Mongo = jeden plik CP,
- unikalność to `address + fileName`,
- import CP -> Mongo działa dla minimum jednego realnego drzewa,
- round-trip test nie gubi kluczowych pól,
- `Folders` w dashboardzie pokazuje strukturę jako drzewo,
- UI pokazuje logical name + address + derived numeric loca,
- dla `daily habits` / `dates` jest jasne, czy to już Mongo-first, i jak wygląda CP-compatible export/projection,
- dokumentacja feature'a jest zapisana,
- testy są opisane i wykonane albo jasno wskazane do ręcznego odpalenia.
