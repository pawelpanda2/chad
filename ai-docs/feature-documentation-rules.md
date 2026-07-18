# AI Feature Documentation Rules

## Cel

Ten plik definiuje obowiązkowy standard dokumentowania nowych feature'ów przez każde AI, Copilot, Cline albo innego automatycznego asistenta pracującego w tym repo.

## Obowiązkowa lokalizacja

Dokumentacja feature'a musi być zapisana w strukturze:

`architecture/[nazwa-projektu]/features/[nazwa-featurea].md`

Przykłady:

- `architecture/dashboard/features/leads.md`
- `architecture/chad-console/features/status-editor.md`
- `architecture/chad-dba/features/status-analysis.md`

Nie zapisujemy dokumentacji feature'ów do `docs/features`.

## Kiedy tworzyć lub aktualizować dokumentację

AI ma utworzyć nowy plik albo uzupełnić istniejący, gdy:

- powstaje nowy feature
- istniejący feature dostaje nowy route, nowy flow albo nową zależność
- zmienia się sposób działania widoku, API albo powrotu użytkownika
- zmienia się sposób użycia Content Providera, cache albo invalidation

## Wymagana zawartość każdego pliku feature'a

Każda dokumentacja feature'a musi zawierać sekcje:

- cel feature'a
- zakres
- zmienione pliki
- route/API
- przepływ danych
- zależności od Content Providera
- cache/invalidation
- edge cases
- znane ograniczenia
- dalsze etapy

## Zasady opisu

- opis ma być konkretny i techniczny
- trzeba wskazać, które repo i które pliki uczestniczą w feature'ze
- trzeba jasno oddzielić warstwę UI, warstwę API i logikę `chad-dba`
- trzeba opisać, czy feature używa logicznych nazw Content Providera czy fizycznych folderów
- trzeba opisać fallbacki, walidację i zachowanie błędów
- trzeba dopisać nową dokumentację od razu po zmianie kodu, nie później

## Zasady dla Content Providera

Jeżeli feature dotyka Content Providera, dokumentacja musi explicite powiedzieć:

- że fizyczne foldery mogą być numeryczne
- że nazwy logiczne są mapowane przez `config.yaml`
- czy kod używa `GetByNames`, `GetManyByName`, `PostByNames` albo innych wywołań logicznych
- czy kod celowo unika budowania fizycznych ścieżek ręcznie

## Zasady dla cache

Jeżeli feature używa cache, dokumentacja musi opisać:

- gdzie cache istnieje
- jaki ma TTL albo warunek ważności
- jak jest invalidowany
- co jest cache'owane: lista, details, metadata, YAML, itp.

Jeżeli feature nie ma cache, dokumentacja też ma to napisać wprost.

## Zasady aktualizacji istniejących plików

- nie twórz duplikatu dokumentacji, jeśli istnieje już właściwy plik feature'a
- aktualizuj istniejący plik, gdy zmiana jest rozszerzeniem tego samego feature'a
- twórz nowy plik tylko wtedy, gdy powstaje osobny feature z własnym zakresem

## Minimalna checklista dla AI przed zakończeniem zadania

- czy plik feature'a jest w `architecture/[projekt]/features/`
- czy opisano route i API
- czy opisano przepływ danych
- czy opisano zależność od Content Providera
- czy opisano cache albo brak cache
- czy dopisano edge cases i ograniczenia
- czy dokumentacja odpowiada rzeczywiście wprowadzonym zmianom w kodzie