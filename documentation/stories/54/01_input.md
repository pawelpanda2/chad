# Story 54 — 01_input.md

**Note: this Story was created retroactively**, after the work below was
already completed and reported to the user directly in conversation, and
after the user pointed out that no Story folder had been created for it —
see `documentation/ai-docs/knowledge/01_story-standard.md`'s "When a Story
gets created" section, added as a direct result of this gap. This file
reconstructs the original request verbatim from conversation history.

## Input 1

Dodaj do środowiska `bash-scripts/dashboard/03_local_mac_docker/` skrypt:

```text
01_port_kill.sh
```

Jeżeli obecna numeracja plików koliduje z nazwą `01_port_kill.sh`, uporządkuj numerację pozostałych skryptów i popraw wszystkie odwołania między nimi. Nie twórz dwóch skryptów z tym samym numerem.

## Cel skryptu

Skrypt ma przyjmować numer portu i samodzielnie usuwać blokadę tego portu na macOS.

Ma obsłużyć dwa przypadki:

1. **Port jest zajęty przez zwykły proces**, np.:

```text
[error] Port 12020 is in use by a non-Docker process: node 19008
```

Wtedy skrypt powinien:

* znaleźć PID procesu używającego portu,
* wyświetlić nazwę procesu i PID,
* zakończyć proces w kontrolowany sposób,
* najpierw użyć zwykłego `kill`,
* odczekać krótko i sprawdzić port ponownie,
* dopiero gdy proces nadal działa, użyć `kill -9`,
* potwierdzić, że port został zwolniony.

2. **Port jest wystawiony przez kontener Docker**

Wtedy skrypt powinien:

* znaleźć kontener publikujący dany port,
* wyświetlić nazwę i ID kontenera,
* zatrzymać kontener,
* jeżeli jest to bezpieczne i zgodne z obecną architekturą skryptów, usunąć kontener,
* potwierdzić, że port został zwolniony.

Skrypt nie może przypadkowo zatrzymywać całego Dockera ani innych niezwiązanych kontenerów. Ma działać wyłącznie na procesie lub kontenerze zajmującym podany port.

Przykładowe użycie:

```bash
./01_port_kill.sh 12020
./01_port_kill.sh 12024
```

Dodaj:

* walidację argumentu,
* czytelne komunikaty `[info]`, `[warn]`, `[ok]`, `[error]`,
* poprawne kody wyjścia,
* zgodność z istniejącym `bash-scripts/common/lib.sh`,
* brak interaktywnego pytania o potwierdzenie, ponieważ skrypt będzie używany automatycznie przez inne skrypty.

## Integracja z istniejącymi skryptami

Przerób skrypty `begin` i `deploy` dla `03_local_mac_docker`, aby w przypadku zajętych wymaganych portów nie kończyły działania takim błędem:

```text
[error] Port 12020 is in use by a non-Docker process: node 19008
[error] Not killing it automatically — stop it yourself, then re-run.
```

Zamiast tego mają automatycznie wywołać `01_port_kill.sh` dla wszystkich portów wymaganych przez uruchamiane środowisko, w szczególności:

* port dashboardu,
* port Content Provider API,
* inne porty zdefiniowane w konfiguracji tego środowiska, jeżeli ich zwolnienie jest wymagane przed uruchomieniem.

Nie wpisuj numerów portów ponownie na sztywno w kilku miejscach. Pobieraj je z istniejącej konfiguracji środowiska.

Po zwolnieniu portów skrypt `begin` ma ponownie sprawdzić ich dostępność i dopiero wtedy uruchomić środowisko.

`deploy` ma korzystać z istniejącego przepływu projektu, czyli przykładowo:

```text
build → begin → status
```

Nie duplikuj w `deploy` logiki zwalniania portów, jeżeli wykonuje ją już `begin`. W takim przypadku `deploy` ma otrzymać tę funkcjonalność pośrednio przez wywołanie `begin`.

## Ważne zasady

* Używamy wyłącznie oficjalnych skryptów projektu.
* Nie dodawaj ukrytych, ręcznych komend wymaganych poza skryptami.
* Użytkownik ma móc wykonać standardowy skrypt `begin` albo `deploy`, a konflikt portu ma zostać rozwiązany automatycznie.
* Przed zmianami przeczytaj `documentation/ai-docs/knowledge/`, dokumentację deploymentu oraz aktualne skrypty środowiska.
* Sprawdź wszystkie odwołania po ewentualnej zmianie numeracji.
* Nie uruchamiaj deploymentu na QNAP TEST ani PROD.
* Przetestuj lokalnie przynajmniej:

  * port wolny,
  * port zajęty przez zwykły proces,
  * port zajęty przez kontener Docker,
  * brak argumentu,
  * niepoprawny numer portu.

Na końcu opisz:

* jakie pliki zostały dodane lub zmienione,
* czy numeracja skryptów została zmieniona,
* jak wykrywany jest proces i kontener,
* jak `begin` i `deploy` korzystają z nowego skryptu,
* wyniki wykonanych testów.

## Input 2

ok ale nie widzę żebyś stworzył `05_report.md` w którym byłaby checklista na górze i taski.
Sprawdź dlaczego tak się stało, że tego nie stworzyłeś, i najpierw uzupełnij instrukcje/dokumentację na temat standardów Story, żeby następnym razem AI nie popełniło już tego błędu.

## Input 3

Story 54 — poprawka

Podczas przeglądania Story 54 zauważyłem brak jednego wykonanego zadania.

Uzupełnij Story 54.

Brakuje zadania:

- zmiana nazw wszystkich skryptów `begin.sh` na `re-start.sh`

To zadanie nie zostało wykonane, ani nie zostało uwzględnione ani w checklistcie, ani w raporcie.

Popraw:

- 01_input.md (jeżeli to zadanie było częścią inputu),
- 02_plan.md,
- 05_report.md,
- checklistę na początku raportu.

Nie zmieniaj zakresu Story 54 poza tą poprawką.

(Odpowiedź na pytanie doprecyzowujące o zakres — czy chodzi o dosłownie
wszystkie `begin.sh` w całym repo, czy tylko o `03_local_mac_docker`:)

wszystkie begin.sh pamietaj ze moga miec prefix liczbowy np. 02_
