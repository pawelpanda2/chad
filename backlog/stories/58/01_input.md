# Story 58 — Input

## Input 1

On zatrzymuje się, bo traktuje prawie każdy brak jako „decyzję użytkownika”, mimo że większość może sam sprawdzić albo bezpiecznie odłożyć. Trzeba mu wyznaczyć kolejność i powiedzieć, co **nie jest blokerem**.

Wklej mu:

```text
Kontynuuj pracę. Nie zatrzymuj całego zadania przez elementy, które nie blokują podstawowej migracji.

Aktualny priorytet to uruchomienie podstawowej funkcjonalności Beeper CRM w `chad`, a nie dokończenie wszystkich funkcji starego projektu.

## 1. Migracja danych MongoDB

Nie pytaj mnie ponownie o connection stringi, zanim nie sprawdzisz istniejącej konfiguracji.

Źródło:
- stary projekt `contacts`
- jego `.env` zawiera:
  `MONGODB_URI=mongodb://admin:admin123@localhost:27017/`

Cel:
- MongoDB projektu `chad`
- dane połączenia są w rootowym `.env.qnap` i istniejących plikach Compose/skryptach
- obecny użytkownik Mongo na QNAP: `admin`
- obecne hasło: `change me`

Nie hardcoduj tych wartości w kodzie migratora.

Najpierw:
1. znajdź nazwę źródłowej bazy używaną przez contacts;
2. znajdź nazwę docelowej bazy używaną przez chad;
3. sprawdź, czy lokalne Mongo źródłowe działa;
4. sprawdź łączność z Mongo QNAP;
5. uruchom migrator wyłącznie w trybie dry-run;
6. pokaż counts, duplikaty, konflikty i indeksy.

Nie wykonuj realnego zapisu bez mojego potwierdzenia dry-run.

Brak wykonanej migracji realnej nie blokuje testowania UI na źródłowej bazie lokalnej.

## 2. beeper-oplog

Replica set blokuje tylko `beeper-oplog`.

Nie blokuje:
- dashboardu Beeper;
- API routes;
- listy kontaktów;
- szczegółów kontaktu;
- inboxu;
- merge suggestions;
- search;
- beeper-sync;
- beeper-ws;
- dry-run migracji.

Na razie wyłącz `beeper-oplog` z zakresu runtime verification.

Dodaj czytelne TODO i kontynuuj pozostałe elementy.

Nie zmieniaj teraz konfiguracji MongoDB na QNAP tylko po to, żeby uruchomić oplog.

## 3. Media proxy

Media proxy nie blokuje pierwszej wersji.

W pierwszej wersji:
- pokaż wiadomości tekstowe;
- pokaż metadane załącznika, jeśli istnieją;
- pokaż placeholder „media unavailable”, jeśli pliku nie da się pobrać;
- nie buduj teraz centralnego storage;
- nie przenoś binarnych plików.

Udokumentuj to jako ograniczenie pierwszej wersji i idź dalej.

## 4. Funkcje nieprzeniesione

Na razie nie przenoś:
- `/affinity`;
- croppera avatara;
- Google Contacts merge suggestions.

To nie są blokery.

Dodaj je do sekcji „deferred features” i kontynuuj podstawową migrację.

## 5. Realne testowanie UI

Masz zgodę uruchomić lokalnie pełny stack wymagany do testów:

- Content Provider API;
- dashboard;
- lokalne Mongo;
- niezbędne procesy Beeper.

Nie pytaj ponownie o zgodę na samo uruchomienie lokalnego środowiska.

Nie deployuj PROD.

Przed testem:
1. przeczytaj istniejące skrypty uruchamiania;
2. użyj ich zamiast wymyślać nowe;
3. nie usuwaj danych;
4. nie zatrzymuj obcych kontenerów bez potrzeby.

Następnie realnie przetestuj w przeglądarce:
- logowanie;
- zakładkę Beeper;
- listę kontaktów;
- szczegóły kontaktu;
- inbox;
- search;
- merge suggestions;
- empty states;
- błędy API;
- odświeżenie strony.

Jeżeli login wymaga prawdziwego `chad_admin/users-list`, uruchom Content Provider z istniejącą lokalną konfiguracją i realnymi użytkownikami.

To nie jest już bloker — masz zgodę.

## 6. Beeper Desktop

Masz zgodę użyć istniejącej konfiguracji i procesów lokalnego projektu `contacts`.

Najpierw sprawdź:
- czy Beeper Desktop działa;
- czy endpointy REST/WebSocket odpowiadają;
- czy istniejące skrypty `beeper-sync` i `beeper-ws` uruchamiają się bez zmian.

Nie wykonuj pełnego importu historii bez dry-run lub jasnego potwierdzenia, że skrypt jest idempotentny.

Możesz testować:
- połączenie;
- pobranie małej próbki;
- zapis pojedynczego kontrolowanego zdarzenia;
- logowanie nowych wiadomości.

## 7. Kolejność pracy

Wykonaj teraz kolejno:

1. uruchom lokalny stack;
2. uruchom dashboard z zakładką Beeper;
3. przetestuj wszystkie podstawowe widoki;
4. popraw realne błędy runtime;
5. uruchom migrator Mongo w dry-run;
6. pokaż raport dry-run;
7. uruchom `beeper-ws` i `beeper-sync` w bezpiecznym trybie testowym;
8. udokumentuj deferred items;
9. przygotuj finalny raport.

Nie dodawaj nowych dużych funkcji.

Nie zatrzymuj się ponownie z listą rzeczy, które nie blokują podstawowej wersji.

Zatrzymaj się tylko, jeśli:
- operacja grozi utratą danych;
- wymagana jest realna migracja po dry-run;
- potrzebna jest zmiana PROD;
- nie da się ustalić brakującej informacji z kodu, dokumentacji ani istniejących envów.

Na końcu pokaż:
- co działa runtime;
- co nie działa;
- wszystkie naprawione błędy;
- wyniki dry-run migracji;
- liczbę rekordów source/target;
- deferred features;
- dokładne kolejne kroki.
```

Najważniejsze decyzje, które mu właśnie dajesz:

* może uruchomić lokalny CP i dashboard;
* replica set nie blokuje całości;
* media mogą być placeholderami;
* funkcje dodatkowe są odłożone;
* migracja danych ma najpierw przejść dry-run;
* ma użyć istniejących `.env` i skryptów, a nie pytać o dane, które już są w repo.

## Input 2

zapisz to story jako 58 wedlug standardow w dokuemntacji
