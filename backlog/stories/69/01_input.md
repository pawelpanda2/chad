# Story 69 — Input

Numbered 69, not 60 — the user's own draft prompt said "Story 60", but that
number is already taken by an unrelated Story (repo isolation / Beeper
layout standard, `backlog/stories/60/`) from a concurrent session in this
same repo. 67 and 68 are also taken by another concurrent session. 69 is
the next free number.

## Input 1

Myślę, że teraz warto zrobić to bardzo ostrożnie. Na QNAP będzie już pierwsza "produkcyjna" kopia danych, więc celem nie jest tylko uruchomienie, ale również możliwość łatwego wycofania zmian.

Wkleiłbym Claude'owi taki prompt:

```text
Story 60 — Migracja Beeper CRM na QNAP TEST

Cel:
Doprowadzić środowisko QNAP TEST do stanu identycznego jak lokalny CHAD.

UWAGA:
Najważniejszym celem jest bezpieczeństwo danych.
Nic nie robimy "na skróty".
Każdy etap musi być możliwy do zweryfikowania i odwrócenia.

========================================
ETAP 1 — Audyt środowiska TEST
========================================

Najpierw nie wykonuj żadnych zmian.

Pokaż:

1. wszystkie kontenery docker związane z chad
2. wszystkie kontenery mongodb
3. używane porty
4. nazwę bazy danych
5. wszystkie kolekcje
6. liczbę dokumentów w każdej kolekcji
7. wolumen danych Mongo
8. używany docker-compose
9. aktualne obrazy
10. aktualne tagi obrazów

========================================
ETAP 2 — Backup
========================================

Przed wykonaniem jakiejkolwiek migracji:

1. wykonaj backup bazy Mongo TEST
2. potwierdź gdzie został zapisany
3. pokaż wielkość backupu
4. pokaż komendę przywrócenia backupu

Nie pomijaj tego kroku.

========================================
ETAP 3 — Dry Run
========================================

Source:

lokalny Mac
database: beeper

Target:

QNAP TEST
database: beeper

Uruchom dry-run migracji.

Pokaż:

source counts

target counts

would insert

already exists

conflicts

Jeżeli cokolwiek wygląda podejrzanie:

STOP.

========================================
ETAP 4 — Apply
========================================

Jeżeli dry-run jest poprawny:

wykonaj --apply

Po zakończeniu:

porównaj source i target.

Każda kolekcja ma mieć identyczną liczbę rekordów.

========================================
ETAP 5 — Indexes
========================================

Potwierdź że:

ensureBeeperIndexes()

zostało wykonane.

Pokaż wszystkie indeksy.

========================================
ETAP 6 — Dashboard TEST
========================================

Przełącz Dashboard TEST na Mongo TEST.

Zweryfikuj:

- contacts
- detail
- inbox
- search
- merge suggestions
- stats

========================================
ETAP 7 — Runtime
========================================

Na Mac pozostają:

- beeper-sync
- beeper-ws

Ich konfiguracja ma zostać zmieniona tak,
aby zapisywały już do Mongo na QNAP TEST
(przez Tailscale).

Nie uruchamiaj jeszcze beeper-oplog.

========================================
ETAP 8 — Test live
========================================

Po zmianie konfiguracji:

1. uruchom incremental sync
2. sprawdź sync_state
3. sprawdź brak duplikatów
4. sprawdź przyrost wiadomości
5. sprawdź beeper_events
6. sprawdź dashboard TEST

Nie używaj force sync.

========================================
ETAP 9 — SSE
========================================

Zweryfikuj że:

SSE działa na TEST.

Jeżeli Mongo nadal jest standalone,
fallback polling ma działać dokładnie tak
jak lokalnie.

========================================
ETAP 10 — QNAP
========================================

Nie uruchamiaj jeszcze:

- replica set
- beeper-oplog

To będzie osobna Story.

========================================
ETAP 11 — Raport
========================================

Na końcu pokaż:

• source counts
• target counts
• indeksy
• używane kontenery
• używane obrazy
• używane porty
• status dashboard
• status sync
• status ws
• status sse
• backup location
• wszystkie commity

========================================
Bardzo ważne
========================================

Jeżeli w którymkolwiek momencie okaże się,
że dane na TEST nie są puste lub istnieje
ryzyko nadpisania danych użytkownika:

STOP.

Pokaż raport i czekaj na moją decyzję.

Nie przechodź do PROD.

Nie usuwaj żadnych danych.

Nie wykonuj force sync.

Po zakończeniu Story 60 środowisko TEST ma być w pełni funkcjonalne, natomiast środowisko PROD pozostaje całkowicie nietknięte.
```

Dodałbym jeszcze jedną zasadę do tego promptu, która będzie bardzo przydatna na przyszłość:

> **Od tej Story wszystkie migracje danych mają być idempotentne.** Oznacza to, że ponowne uruchomienie migratora nie może tworzyć duplikatów ani zmieniać już poprawnie zmigrowanych danych. Dzięki temu każdą migrację będzie można bezpiecznie powtórzyć po poprawkach lub awarii.
