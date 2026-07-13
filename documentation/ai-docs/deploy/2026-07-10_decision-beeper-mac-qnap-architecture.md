# Decyzja architektoniczna — Beeper (Mac) ↔ MongoDB (QNAP), środowiska test/prod

Status: zatwierdzone (2026-07-10). Uzupełnia `26-07-10_cline_prompt_mongodb_qnap_folders_v3.md`.

## 0. Fakty infrastrukturalne

- QNAP: urządzenie **s12**, adres Tailscale: `100.117.139.83`.
- Konwencja portów właściciela: **12020–12029 = środowisko testowe QNAP**, **12030–12039 = środowisko produkcyjne QNAP**. Nie wolno wnioskować "produkcja" tylko z faktu, że adres jest publicznie dostępny albo ma ekran logowania.
- Potwierdzone (curl): `http://193.43.242.55:12020/` żyje i przekierowuje na `/login` — to stary `chad-dashbord`, port w zakresie **testowym** (12020), **nie produkcyjnym**, mimo że jest publicznie routowalny.
- Żaden production cutover / migracja publicznego adresu nie jest w zakresie obecnej pracy. Kolejność wdrożeń: **local Mac → local Mac Docker → QNAP test → QNAP production**, każdy kolejny krok wymaga osobnej zgody.

## 1. Matryca środowisk (zatwierdzona)

### Mac (tmuxinator — lokalny mechanizm uruchamiania)
- Beeper Desktop (zewnętrzna aplikacja, nie część monorepo)
- `beeper-ws` — proces długowieczny
- `beeper-sync` — uruchamiany ręcznie / okresowo (osobne skrypty: normal / force / full-history / diagnostics)
- `dashboard` (dev)
- `dba` (watch/build)
- `console`

### QNAP test
- MongoDB
- `dashboard`
- wymagane API/backendy
- Content Provider API (.NET — już istnieje w obecnym deploymencie)
- backup/restore
- później opcjonalnie `beeper-oplog`

### QNAP production
- **Nie wdrażać teraz.** Architektura i skrypty mają być przygotowane tak, by można było je uruchomić na produkcji, ale samo uruchomienie wymaga osobnej, jawnej zgody po przejściu przez local Mac → local Mac Docker → QNAP test.

## 2. Kierunek połączenia Mac ↔ MongoDB@QNAP

```txt
Mac:
    Beeper Desktop
        ↓ (localhost, WS + REST + lokalny SQLite)
    beeper-ws (długowieczny)
    beeper-sync (ręcznie/okresowo)
        ↓ przez Tailscale (100.117.139.83)
QNAP:
    MongoDB (docker-compose, docelowo replica set)
        ↓ (wewnętrzny host docker-compose, np. "mongodb")
    dashboard
    beeper-oplog / event processor (opcjonalnie, później — zależy tylko od Mongo, nie od Beeper Desktop)
```

Zasady:
- Procesy na QNAP łączą się z Mongo przez wewnętrzny hostname docker-compose (np. `mongodb:27017`) — nigdy przez Tailscale/publiczny adres.
- `beeper-ws`/`beeper-sync` na Macu łączą się z Mongo przez adres Tailscale QNAP (`100.117.139.83`) — nigdy `localhost`.
- MongoDB **nie jest wystawione publicznie** — tylko przez prywatną sieć Tailscale.
- Żadnych hardcoded IP/`localhost`/ścieżek absolutnych w kodzie — wszystko przez zmienne env, osobne pliki `.env.*.example` dla każdej strony połączenia.
- Żadnego API gateway — nie jest częścią aktualnej architektury.

## 3. MongoDB replica set

Docelowo MongoDB na QNAP ma działać jako replica set (`--replSet rs0`), bo `beeper-oplog` wymaga change streams. Do przygotowania (konfiguracja i dokumentacja, **bez uruchamiania na realnym QNAP**):
- konfiguracja `--replSet rs0`,
- bezpieczna, idempotentna inicjalizacja `rs.initiate()` (nie wolno błędnie re-inicjalizować istniejącego replica set),
- persistence po restarcie/usunięciu kontenera (bind mount, jak już ustalono wcześniej),
- rozróżnienie test vs prod,
- health check replica set,
- backup i restore (już przygotowane: `bash-scripts/mongo/backup.sh` / `mongo-restore.sh`, do zweryfikowania że działają też z replica set).

Lokalny Mongo na Macu może zostać standalone, dopóki żaden lokalny proces nie używa change streams. Jeśli kiedyś zajdzie potrzeba lokalnego testowania `beeper-oplog`, lokalny Docker Compose też będzie potrzebował wariantu replica set.

`beeper-oplog` **nie jest uruchamiany automatycznie** na tym etapie — zależy od gotowego replica set.

## 4. `beeper-ws` — decyzja

- Baza kodu: wersja z `contacts` (prosty listener: WS in → kolekcja `beeper_events` w Mongo), **nie** wersja z `hiddengarden.events`.
- **Nie dodawać NATS.**
- Analiza kodu potwierdziła: wersja z `contacts` tylko **odbiera** eventy i zapisuje je do Mongo — nie ma ścieżki wysyłania wiadomości do Beepera. Wysyłanie wiadomości z dashboardu przez Beeper to **planowany, nieistniejący jeszcze feature** — zapisać jako brakujący/planowany, nie implementować teraz.
- Do sprawdzenia (przed migracją modułu): czy kod wysyłania wiadomości nie istnieje gdzieś indziej w starym projekcie (poza tymi czterema modułami `contacts`) — jeszcze nie zweryfikowane.

## 5. `beeper-sync` — decyzja

- Działa wyłącznie na Macu, nie jest usługą QNAP.
- Korzysta z lokalnego Beeper Desktop / lokalnego SQLite.
- Zapisuje do MongoDB na QNAP (przez Tailscale).
- Ma mieć osobne skrypty: normal sync, force sync, full/history sync, diagnostics — obecny kod ma częściowy rozjazd między README a `package.json` (opisany we wcześniejszej analizie), do naprawienia przy migracji.
- Skrypty muszą działać niezależnie od katalogu uruchomienia (wyliczać ścieżki od własnego położenia albo od roota monorepo) — obecny kod ma hardcoded ścieżki macOS (`~/Library/Application Support/BeeperTexts/...`), to musi przejść przez env.

## 6. Zakres NASTĘPNEGO kroku (ten dokument + plan struktury)

Ten dokument + towarzyszący mu plan struktury monorepo/lista plików to całość obecnego kroku. Jawnie NIE wykonuję jeszcze:
- subtree Content Providera,
- migracji modułów `contacts` (dashboard/beeper-ws/beeper-sync/beeper-oplog),
- uruchomienia replica set na QNAP,
- deploymentu QNAP test,
- żadnego production cutover.
