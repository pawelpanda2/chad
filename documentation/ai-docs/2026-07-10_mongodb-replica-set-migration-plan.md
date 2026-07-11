# MongoDB replica set — plan migracji bez utraty danych

Status: **przygotowane, przetestowane lokalnie na Macu, NIE wdrożone na realnym QNAP.** Uzupełnia `2026-07-10_decision-beeper-mac-qnap-architecture.md`.

**Aktualizacja 2026-07-11:** próba realnego wdrożenia na QNAP TEST
(`docker-compose.qnap.yml`) trafiła dokładnie na zastrzeżenie z tego
dokumentu i została cofnięta na wyraźną decyzję użytkownika. Real bug
napotkany: `mongod` z `--replSet rs0` + `--keyFile` + `MONGO_INITDB_ROOT_USERNAME`/
`PASSWORD` nigdy nie kończył bootstrapu ("Did not find local replica set
configuration document at startup") — healthcheck nigdy nie przechodził,
więc `mongo-rs-init` nigdy się nie uruchamiał. `docker-compose.qnap.yml`
wrócił do zwykłego standalone `mongod` (tylko auth przez
`MONGO_INITDB_ROOT_USERNAME`/`PASSWORD`, bez `--replSet`/`--keyFile`,
bez `mongo-keyfile-init`/`mongo-rs-init`) dla realnego QNAP TEST i PROD.
Ten dokument (serwisy `mongo-keyfile-init`/`mongo-rs-init`, `rs-init.js`)
pozostaje planem/referencją na przyszłość — do ponownego wdrożenia
dopiero gdy: (a) `beeper-oplog` faktycznie trafi do tego monorepo, i (b)
padnie osobna, jawna zgoda na realny QNAP, tym razem z naprawionym
bootstrapem auth+replicaSet (prawdopodobnie: utworzenie root usera PRZED
włączeniem `--replSet`, zgodnie z sekwencją, jakiej oczekuje oficjalny
mongo docker-entrypoint).

## 1. Dlaczego replica set

`beeper-oplog` (moduł z `contacts`, jeszcze nie zmigrowany) używa MongoDB change streams (`collection.watch()`) do nasłuchiwania na `beeper_events` i normalizowania ich do `contacts`/`channels`/`messages`. **Change streams wymagają, żeby MongoDB działało jako replica set** — nie działają na standalone `mongod`. Stąd potrzeba przejścia z obecnego standalone na single-node replica set (`rs0`) — pojedynczy node, nie prawdziwa multi-node HA (to nie jest cel tej zmiany).

## 2. Ważne odkrycie z lokalnego testu: wymagany `keyFile`

Pierwsza próba (samo dopisanie `command: ["--replSet", "rs0"]` do istniejącej konfiguracji z `MONGO_INITDB_ROOT_USERNAME`/`PASSWORD`) **nie zadziałała**:

```txt
BadValue: security.keyFile is required when authorization is enabled with replica sets
```

MongoDB wymaga `security.keyFile` zawsze, gdy jednocześnie włączone jest auth (przez `MONGO_INITDB_ROOT_USERNAME`/`PASSWORD`) i `--replSet` — **nawet dla replica set z jednym node'em**. To dokładnie potwierdza wcześniejszą wątpliwość: *"nie zakładaj, że można bezpiecznie zmienić działający kontener przez samo dopisanie `--replSet rs0`"*.

### Rozwiązanie

Dodany serwis `mongo-keyfile-init`, który:
- generuje losowy keyfile (`openssl rand -base64 756`) **wewnątrz kontenera Linux**, nie przez bind-mount z hosta z góry ustawionymi uprawnieniami — dzięki temu działa identycznie na macOS (dev/test) i QNAP (Linux); uprawnienia (`chmod 400`, `chown 999:999` — UID/GID użytkownika `mongodb` w oficjalnym obrazie) są ustawiane przez proces Linux w kontenerze, nie zależą od tego, jak host interpretuje bity uprawnień na bind-mouncie,
- jest idempotentny — jeśli plik już istnieje, zostaje bez zmian (nie rotuje klucza pod działającym replica setem, co by go zerwało),
- `mongodb` zależy od jego pomyślnego zakończenia (`condition: service_completed_successfully`) przed startem.

Plik keyfile ląduje na tym samym trwałym bind-moуncie co reszta danych Mongo (`$QNAP_CONTAINER_DATA_PATH/chad[-test]/mongodb/keyfile/`), więc przetrwa restart/usunięcie kontenera tak samo jak `/data/db`.

## 3. Lokalny test end-to-end (Mac, tymczasowa ścieżka, nie QNAP)

Wykonane 2026-07-10, w całości lokalnie, z podmienioną ścieżką (`QNAP_CONTAINER_DATA_PATH` wskazujące na katalog tymczasowy zamiast `/share/ContainerData`) — realny QNAP nie był w ogóle dotknięty:

| Test | Wynik |
|---|---|
| Start `docker-compose.qnap.test.yml` (mongo-keyfile-init → mongodb → mongo-rs-init) | ✅ wszystkie kontenery healthy/exited(0) poprawnie |
| `rs.initiate()` przy pierwszym starcie | ✅ `{ ok: 1 }`, replica set `rs0` aktywny, `myState: 1` (PRIMARY) |
| Ponowne uruchomienie `mongo-rs-init` (idempotencja) | ✅ `"Replica set already initialized (set: rs0), skipping."` — brak próby re-inicjalizacji |
| Insert dokumentu testowego → `docker compose down` (usunięcie kontenerów) → `docker compose up` z tym samym mountem | ✅ dokument nadal obecny, replica set state (PRIMARY) automatycznie odtworzony przez sam MongoDB |
| Change stream (`db.collection.watch()`) | ✅ otwiera się poprawnie — to jest właściwy powód całej zmiany |
| Klient "zewnętrzny" (kontener bez wspólnej sieci Docker, przez zmapowany port hosta) z `directConnection=true` | ✅ działa |
| Ten sam klient zewnętrzny **bez** `directConnection=true` | ⚠️ w tym konkretnym teście (mongosh, mapowany port hosta) **też zadziałało** — patrz zastrzeżenie niżej |

### Zastrzeżenie co do `directConnection=true`

Oficjalna dokumentacja MongoDB rekomenduje `directConnection=true` dla klienta łączącego się z single-node replica setem, gdy klient nie może rozwiązać nazwy hosta zarejestrowanej jako member w konfiguracji replica set (tu: `mongodb:27017`, nazwa serwisu Docker Compose, nierozwiązywalna z Maca). W moim teście z `mongosh` połączenie zadziałało nawet bez tej flagi — prawdopodobnie dlatego, że dla pojedynczego membera sterownik nie musi otwierać nowego połączenia do "odkrytego" adresu, skoro już ma działające połączenie z jedynym node'em. **Mimo to `directConnection=true` zostaje rekomendowane i domyślnie włączone w `.env.mac-beeper.example`** — to udokumentowane, przewidywalne zachowanie niezależne od konkretnej wersji sterownika/klienta, a nie poleganie na przypadkowej tolerancji. Nie testowałem tego z rzeczywistym sterownikiem Node.js MongoDB (`mongodb` npm package), którego będzie faktycznie używać `beeper-ws`/`beeper-sync` po migracji — **to zostaje do zweryfikowania przy migracji tych modułów** (Decision Required / do przetestowania, nie zakładam identycznego zachowania).

## 4. Bezpieczna procedura migracji standalone → replica set (bez utraty danych)

Dotyczy sytuacji, gdyby na QNAP już działał standalone `chad-mongodb-test`/`chad-mongodb-prod` z realnymi danymi (obecnie **nie działa** — nic jeszcze nie wdrożono na prawdziwy QNAP, więc to na razie procedura na przyszłość, nie pilna naprawa):

1. **Backup najpierw, zawsze.** Uruchom `bash-scripts/mongo/backup.sh` (mongodump) przed jakąkolwiek zmianą. To backup logiczny, niezależny od tego, czy kontener/wolumen przetrwa.
2. `docker compose -f docker-compose.qnap.<test|prod>.yml stop mongodb` (zatrzymanie, **nie** `rm` na tym etapie — choć nawet `rm` byłoby bezpieczne, dopóki bind mount zostaje; `stop` jest ostrożniejsze).
3. Zaktualizuj compose do nowej wersji (z `mongo-keyfile-init` + `--keyFile` + `--replSet rs0` + healthcheck) — już zrobione w tym repo.
4. `docker compose -f docker-compose.qnap.<test|prod>.yml up -d` — uruchamia `mongo-keyfile-init` (generuje keyfile raz), potem `mongodb` z `--replSet rs0 --keyFile ...` na **tym samym** `/data/db`. MongoDB samo rozpoznaje istniejące dane — konwersja standalone→replica set nie modyfikuje ani nie usuwa danych na dysku.
5. `mongo-rs-init` uruchamia `rs.initiate()` — jednorazowo, idempotentnie.
6. Zweryfikuj: `rs.status()` pokazuje `PRIMARY`, dane sprzed migracji nadal widoczne (`db.<collection>.find()` na znanych kolekcjach), `mongo-backup.sh`/`mongo-restore.sh` nadal działają bez zmian (mongodump/mongorestore nie zależą od trybu standalone/replica set).
7. Zaktualizuj `MONGODB_URI` u wszystkich klientów (QNAP-wewnętrznych i Mac) o `directConnection=true` (już przygotowane w `.env.*.example`).

**Krok, którego NIE wolno robić:** nie kasować `/data/db` "dla pewności" przed konwersją — to jest dokładnie ten scenariusz utraty danych, przed którym ostrzegał wcześniejszy dokument o backupie.

## 5. Co dalej wymaga decyzji (Decision Required)

- Realny test z Node.js MongoDB driverem (nie tylko `mongosh`) dla `directConnection=true` z Maca — do zrobienia przy migracji `beeper-ws`/`beeper-sync`.
- Czy `beeper-oplog` faktycznie trafia na QNAP w tej konfiguracji, czy zostaje odłożone dalej — to osobna, już wcześniej odłożona decyzja (migracja modułów `contacts`).
- To wszystko pozostaje **nieużywane** (`docker-compose.qnap.test.yml`/`qnap.prod.yml` nie zostały uruchomione na realnym QNAP) do czasu jawnej zgody.
