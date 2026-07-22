# Story 76 — Input

## Input 1

przygotuj na razie pliki story ale jeszcze nie zaczynaj go wykonywac:
to jest input:

Stwórz nowe Story dotyczące rozdzielenia MongoDB w CHAD.

Najpierw przeczytaj obowiązkową dokumentację wskazaną przez documentation/ai-docs/knowledge/01_ai_start.md i sprawdź aktualną strukturę repo, Docker Compose oraz skrypty deploymentu. Nie zakładaj nazw plików ani konfiguracji bez ich odnalezienia.

Cel:

Rozdziel obecne MongoDB na dwie niezależne instancje/kontenery:
chad-mongodb
baza/kolekcja cp_items
single-node replica set
oplog i Change Streams wykorzystywane do historii zmian
osobny trwały katalog danych na QNAP
beeper-mongodb
bazy beeper_[guid-użytkownika]
osobny trwały katalog danych na QNAP
bez replica setu, o ile kod faktycznie go nie wymaga
Popraw connection stringi, env, healthchecki, sieci Docker, deployment i migrację istniejących danych. Nie dopuść do przypadkowego uruchomienia aplikacji na pustej bazie.
chad-history-worker nie powinien być uruchamiany jako osobny kontener. Przenieś jego uruchamianie do kontenera/procesu dashboardu, ponieważ eventy pozostają w oplogu i worker może je nadrobić po restarcie.

Warunki:
- trwały resumeToken
- idempotentny zapis historii
- tylko jedna aktywna instancja workera
- poprawne wznowienie po restarcie

Jeżeli po analizie kodu uważasz, że osobny kontener workera jest konieczny, nie zmieniaj tego bez uzasadnienia. Podaj konkretne techniczne argumenty i ryzyka.

Najpierw przygotuj plan Story i listę dotkniętych plików. Nie wdrażaj zmian przed sprawdzeniem obecnego modelu danych i wolumenów QNAP.

## Input 2

no to stworz ten folder i zapisz i tyle nie wykonuj jesze story
