# Story 63 — Input

**Note on how this Story number was chosen:** at the time this request was
made, the assistant had (incorrectly, per stale in-conversation context)
started drafting this work under the numbers 54 and 55 at
`documentation/stories/`. Both numbers and that path are wrong: the real,
git-tracked `backlog/stories/54/` and `backlog/stories/55/` already exist and
cover unrelated, already-completed work (Story 54: `01_port_kill.sh` +
the `begin`→`re-start` rename; Story 55: voice recording for Reports). That
stray `documentation/stories/` directory was removed. This is Story 63 — the
next free number after the real `backlog/stories/62/`.

## Input 1

# Zadanie: ujednolicenie standardu `bash-scripts` w CHAD i przygotowanie przenośnego kompendium dla drugiego projektu

Najpierw popraw rzeczywisty standard skryptów w repozytorium CHAD, a dopiero później przygotuj jeden kompletny plik `.md`, który będzie można przekazać Claude w innym projekcie jako wzorzec wdrożenia analogicznej struktury `bash-scripts`.

Nie twórz ogólnego opisu oderwanego od repozytorium. Kompendium ma wynikać z faktycznie poprawionej, sprawdzonej i udokumentowanej struktury CHAD.

## 1. Obowiązkowa kolejność pracy

1. Znajdź i przeczytaj obowiązujący plik kolejności pracy dla AI.
2. Następnie przeczytaj `what-and-where` / `02_what-and-where.md` jako indeks dokumentacji.
3. Na jego podstawie znajdź i przeczytaj dokumenty dotyczące:
   - skryptów Bash,
   - dashboardu,
   - lokalnego uruchamiania,
   - Dockera,
   - Tmuxinatora,
   - QNAP TEST,
   - QNAP PROD,
   - SSH deploymentu,
   - wspólnych usług,
   - zasad deploymentu.
4. Dopiero potem przeanalizuj rzeczywistą strukturę i zawartość `bash-scripts/`.
5. Nie ufaj starym drzewom katalogów zapisanym w dokumentacji. Porównaj je z repozytorium.

Nie zakładaj istnienia `README.md`, `CLAUDE.md` ani `AGENTS.md` jako nadrzędnej dokumentacji, jeżeli repozytorium tego nie potwierdza.

## 2. Najpierw popraw błąd w CHAD

Obecna struktura nadal nie ma jednolitych numerów i nazw.

Docelowy kontrakt numeracji operacji w katalogu środowiska jest następujący:

```text
01_config.sh
02_build.sh
03_restart.sh
04_end.sh
05_status.sh
06_deploy.sh
07_logs.sh
```

Znaczenie:

- `01_config.sh` — przygotowanie lub wygenerowanie konfiguracji;
- `02_build.sh` — budowanie obrazu lub artefaktu;
- `03_restart.sh` — uruchomienie środowiska, gdy nie działa, albo restart istniejącego środowiska z już przygotowanego obrazu/artefaktu;
- `04_end.sh` — zatrzymanie środowiska;
- `05_status.sh` — pokazanie stanu i podstawowych healthchecków;
- `06_deploy.sh` — pełny deployment nowej wersji zgodnie z kontraktem danego środowiska;
- `07_logs.sh` — podgląd logów.

### Bardzo ważna reguła numeracji

Jeżeli dane środowisko nie ma którejś operacji, nie przesuwaj kolejnych numerów.

Przykład: jeżeli katalog nie potrzebuje `02_build.sh`, ale ma restart i status, nazwy nadal mają być:

```text
03_restart.sh
05_status.sh
```

Luki w numeracji są celowe. Numer identyfikuje rodzaj operacji w całym repozytorium, a nie tylko kolejność plików w jednym katalogu.

### Nazwa restartu

Używaj dokładnie:

```text
03_restart.sh
```

Nie używaj:

```text
03_re-start.sh
03_begin.sh
02_start.sh
04_re-start.sh
begin_*.sh
```

Wyjątek może istnieć tylko wtedy, gdy dany skrypt naprawdę ma odmienny kontrakt i dokumentacja jasno to uzasadnia. Nie zachowuj wyjątków wyłącznie dlatego, że tak jest obecnie.

## 3. Audyt wszystkich katalogów dashboardu

Sprawdź rzeczywiste katalogi pod:

```text
bash-scripts/dashboard/
```

W szczególności przeanalizuj obecną strukturę podobną do:

```text
00_qnap_shared/
02_local_mac_tmux/
03_local_mac_docker/
04_qnap_test/
05_qnap_prod/
06_qnap_ssh/
```

Dla każdego katalogu ustal:

- jakie operacje faktycznie realizuje;
- które skrypty są używane;
- jakie skrypty są martwe lub dublują inne;
- jakie są aktywne wywołania między skryptami;
- czy nazwa i numer odpowiadają kontraktowi operacji;
- czy dokumentacja opisuje rzeczywisty stan.

Następnie ujednolić nazwy i numery zgodnie z kontraktem.

Nie wykonuj tylko rename plików. Zaktualizuj wszystkie aktywne odwołania, m.in.:

- skrypty `deploy`;
- skrypty SSH;
- rootowe wrappery;
- pliki Tmuxinatora;
- `package.json`;
- pliki Docker Compose;
- biblioteki Bash;
- testy;
- dokumentację;
- przykładowe komendy.

Przed zmianą każdego odwołania sprawdź jego znaczenie. Nie stosuj bezmyślnego globalnego replace.

## 4. Katalog lokalny Tmuxinator

Obecny katalog może mieć niespójną strukturę, np.:

```text
01_build.sh
01_config.sh
02_start.sh
03_end.sh
04_status.sh
05_logs.sh
tmuxinator.dashboard.yml
```

Nie zachowuj tej numeracji tylko dlatego, że istnieje.

Dostosuj go do wspólnych numerów operacji. Przykładowo, jeżeli operacje istnieją, powinny otrzymać odpowiadające im sloty:

```text
01_config.sh
02_build.sh
03_restart.sh
04_end.sh
05_status.sh
07_logs.sh
tmuxinator.dashboard.yml
```

`03_restart.sh` w wariancie Tmuxinator ma uruchamiać sesję, jeśli jej nie ma, albo bezpiecznie ją zrestartować, jeśli już działa. Zachowaj właściwy dla Tmuxinatora sposób zarządzania procesami.

Nie dodawaj `06_deploy.sh`, jeśli lokalny wariant Tmuxinator faktycznie nie ma osobnej operacji deploymentu. Wtedy numer `06` pozostaje pusty.

## 5. Katalog lokalny Docker

Obecna struktura może zawierać przesunięte numery, np.:

```text
01_port_kill.sh
02_config.sh
03_build.sh
04_re-start.sh
05_end.sh
06_status.sh
07_deploy.sh
```

To jest niezgodne ze standardem.

Operacje podstawowe mają zachować globalne sloty:

```text
01_config.sh
02_build.sh
03_restart.sh
04_end.sh
05_status.sh
06_deploy.sh
07_logs.sh
```

Dodatkowa operacja techniczna, taka jak `port_kill`, nie może przesuwać numerów standardowych operacji. Oceń, czy:

- powinna być funkcją w bibliotece wspólnej;
- powinna być wywoływana wewnętrznie przez `03_restart.sh` lub `04_end.sh`;
- albo powinna mieć numer spoza standardowego zakresu, np. `90_port-kill.sh`, jeżeli naprawdę musi pozostać osobnym ręcznym narzędziem.

Wybierz najprostsze rozwiązanie zgodne z istniejącą architekturą.

## 6. `06_qnap_ssh`

Ujednolić również warstwę SSH.

Nie pozostawiaj nazw typu:

```text
begin_test.sh
begin_prod.sh
begin_shared.sh
deploy_test.sh
status_test.sh
```

Skrypty w tym katalogu również mają stosować stały numer operacji. Ponieważ jeden katalog obsługuje kilka targetów, zaproponuj i zastosuj jednoznaczny wariant, który zachowuje slot operacji, np.:

```text
03_restart_test.sh
05_status_test.sh
06_deploy_test.sh

03_restart_prod.sh
05_status_prod.sh
06_deploy_prod.sh
```

oraz analogicznie dla `shared`, wyłącznie jeśli `shared` zostanie uznany za potrzebny.

`lib.sh` może pozostać bez numeru jako biblioteka, ponieważ nie jest operacją uruchamianą przez użytkownika.

Kontrole Git preflight dotyczą operacji `06_deploy_*.sh`, a nie zwykłego `03_restart_*.sh`.

## 7. Oceń sens `00_qnap_shared`

Nie rozumiem, po co istnieje:

```text
bash-scripts/dashboard/00_qnap_shared/
```

Nie zakładaj ani że jest potrzebny, ani że należy go usunąć.

Przeprowadź audyt:

- jakie kontenery/usługi obsługuje;
- kto go wywołuje;
- czy MongoDB i Content Provider są rzeczywiście współdzielone przez TEST i PROD;
- czy usunięcie katalogu zepsułoby uruchamianie lub healthchecki;
- czy logika może zostać przeniesiona do innego już istniejącego miejsca bez duplikacji;
- czy jego nazwa i numer mają uzasadnienie.

Jeżeli katalog jest potrzebny, pozostaw go i dokładnie udokumentuj jego rolę.

Jeżeli jest zbędny lub martwy, usuń go bezpiecznie razem ze wszystkimi odwołaniami.

Nie usuwaj danych, wolumenów ani działających usług. Zmiana dotyczy wyłącznie kodu i organizacji skryptów.

## 8. Zasady architektury deploymentu

Podczas porządkowania zachowaj obowiązujący kontrakt:

- TEST może budować nowy obraz i uruchamiać go do weryfikacji;
- PROD ma promować dokładnie obraz sprawdzony na TEST, jeżeli taki jest obecny standard projektu;
- PROD nie powinien wykonywać niezależnego buildu, jeśli łamałoby to promocję TEST → PROD;
- `restart` używa istniejącego artefaktu/obrazu i nie jest pełnym deploymentem;
- `deploy` może wykonać pełny proces przewidziany dla danego targetu;
- skrypty SSH mają być cienkimi wrapperami sterującymi z Maca, a nie duplikować logikę środowiskową.

Najpierw potwierdź te zasady w dokumentacji i kodzie. Jeżeli rzeczywisty, zatwierdzony kontrakt różni się od powyższego, wskaż konflikt przed implementacją.

## 9. Popraw przekazany dokument `.md`

Zaktualizuj istniejący dokument opisujący strukturę `bash-scripts`.

Obecny dokument jest częściowo przestarzały i zawiera historyczne drzewa, stare nazwy oraz sprzeczne zasady (`begin`, `start`, `re-start`, brak stałych slotów numeracyjnych).

Po poprawie dokument ma:

- być aktualnym źródłem prawdy, a nie zbiorem kolejnych dopisków „historyczne/przestarzałe”;
- pokazywać rzeczywistą strukturę po zmianach;
- zawierać tabelę stałych numerów operacji;
- wyjaśniać zasadę zachowania luk;
- opisywać różnice pomiędzy local tmux, local Docker, QNAP TEST, QNAP PROD i SSH;
- wyjaśniać rolę `00_qnap_shared` albo odnotować jego usunięcie;
- opisywać `common/lib.sh`;
- opisywać sposób wyliczania `SCRIPT_DIR` i `REPO_ROOT`;
- opisywać Git preflight dla deploymentu SSH;
- opisywać promocję obrazu TEST → PROD;
- zawierać realne przykłady komend;
- nie zawierać nieaktualnych drzew jako rzekomo bieżących.

Jeżeli informacje historyczne są wartościowe, przenieś je do krótkiej sekcji „Historia zmian” na końcu, bez mieszania ich z aktualnym kontraktem.

Zaktualizuj także `what-and-where`, aby wskazywał ten dokument jako główne źródło standardu Bash/deployment.

## 10. Weryfikacja zmian w CHAD

Po zmianach wykonaj co najmniej:

- `bash -n` dla wszystkich plików `.sh` w zmienionym zakresie;
- `shellcheck`, jeżeli jest dostępny;
- wyszukiwanie aktywnych odwołań do starych nazw:
  - `begin`;
  - `re-start`;
  - starych przesuniętych numerów;
- sprawdzenie, że każdy wrapper wskazuje istniejący plik;
- sprawdzenie uruchamiania skryptów z katalogu innego niż repo root;
- test `status`;
- test `restart` dla stanu zatrzymanego;
- test `restart` dla stanu działającego;
- test, że `deploy TEST` wywołuje właściwy przebieg;
- analizę/test, że `deploy PROD` nie buduje osobnego obrazu, jeżeli obowiązuje promocja obrazu TEST;
- potwierdzenie, że dokumentowane drzewo zgadza się z wynikiem `tree`.

Nie twierdź, że wykonano test runtime, jeśli wykonano wyłącznie analizę lub `bash -n`.

Nie wdrażaj automatycznie na PROD bez mojej wyraźnej zgody.

## 11. Dopiero potem wygeneruj kompendium dla drugiego projektu

Po poprawieniu CHAD utwórz jeden samodzielny plik Markdown zawierający przenośny standard, np.:

```text
documentation/ai-docs/knowledge/bash-scripts-compendium.md
```

Dobierz dokładną lokalizację zgodnie z aktualną konwencją dokumentacji i zaktualizuj indeks.

Kompendium ma pozwalać Claude w innym repozytorium:

1. najpierw przeprowadzić audyt istniejących skryptów;
2. rozpoznać środowiska projektu;
3. zaproponować strukturę bez kopiowania ślepo nazw specyficznych dla CHAD;
4. zastosować stałe sloty:
   - `01_config`;
   - `02_build`;
   - `03_restart`;
   - `04_end`;
   - `05_status`;
   - `06_deploy`;
   - `07_logs`;
5. zachować luki, gdy operacji brakuje;
6. wydzielić wspólną bibliotekę;
7. projektować bezpieczne skrypty Git/SSH/Docker;
8. rozróżniać build, restart i deploy;
9. stosować preflight;
10. testować składnię i runtime uczciwie.

Kompendium powinno zawierać:

- cele i zakres standardu;
- słownik operacji;
- numerację i zasadę luk;
- wzorcowe drzewa dla:
  - local native/tmux;
  - local Docker;
  - remote TEST;
  - remote PROD;
  - SSH wrappers;
- wzorzec `common/lib.sh`;
- wzorzec nagłówka skryptu z `set -Eeuo pipefail`;
- bezpieczne wyliczanie ścieżek;
- logowanie;
- obsługę błędów i `trap`;
- walidację komend i plików;
- zasady portów i procesów;
- Docker Compose;
- release tagi;
- promocję TEST → PROD;
- Git preflight;
- interaktywny i non-interactive tryb;
- ochronę PROD;
- idempotencję;
- healthchecki;
- zasady sekretów i `.env`;
- antywzorce;
- checklistę audytu;
- checklistę implementacji;
- checklistę testów;
- przykładowe szkielety kodu, ale bez sekretów i bez ścieżek zależnych od mojego Maca/QNAP.

Kompendium ma rozdzielać:

- elementy obowiązkowe;
- elementy opcjonalne;
- elementy specyficzne dla CHAD;
- decyzje, które w innym repo trzeba ustalić na podstawie jego architektury.

Nie może instruować innego agenta, aby ślepo tworzył katalogi `00_qnap_shared` albo `06_qnap_ssh`. Ma najpierw wykryć realne potrzeby projektu.

## 12. Dokumentacja zadania i sposób pracy

Zapisz ten input dosłownie w bieżącej Story dotyczącej skryptów albo utwórz nową Story zgodnie z aktualnym standardem repozytorium, jeżeli poprzednia Story jest już zamknięta lub zakres jest istotnie szerszy.

Najpierw przedstaw:

1. wynik audytu;
2. wykryte niespójności;
3. ocenę `00_qnap_shared`;
4. proponowane docelowe drzewo;
5. listę rename/move/delete;
6. listę odwołań do aktualizacji;
7. plan testów;
8. lokalizację przyszłego kompendium.

Nie rozpoczynaj zmian przed moją akceptacją planu.

Po akceptacji:

- wykonaj poprawki w CHAD;
- zweryfikuj je;
- zaktualizuj dokumentację;
- dopiero na podstawie zweryfikowanego standardu wygeneruj kompendium.

## 13. Oczekiwany raport końcowy

Raport ma zawierać:

- stan przed i po;
- dokładną listę zmian nazw;
- usunięte pliki i uzasadnienie;
- wynik decyzji o `00_qnap_shared`;
- wszystkie zaktualizowane odwołania;
- wykonane testy i ich rzeczywiste wyniki;
- rzeczy nieweryfikowalne;
- ścieżkę do poprawionego dokumentu standardu CHAD;
- ścieżkę do nowego przenośnego kompendium;
- informację, które części kompendium są uniwersalne, a które bazują na CHAD.

## Input 2

wpisz do tej samej historyjki to
Bardzo ważne doprecyzowanie do struktury SSH — dopisz ten input dosłownie do bieżącej Story i zaktualizuj plan.

Chcę zrezygnować z jednego wspólnego katalogu:

`06_qnap_ssh`

i wydzielić dwa osobne katalogi:

```text
06_qnap_test_ssh
07_qnap_prod_ssh
```

### 1. `06_qnap_test_ssh`

Ten katalog ma obsługiwać operacje zdalne dla środowiska TEST.

Może zawierać operacje zgodne ze standardem, np.:

```text
03_restart.sh
05_status.sh
06_deploy.sh
07_logs.sh
lib.sh
```

Nie dodawaj skryptów tylko po to, żeby wypełnić numerację. Jeżeli dana operacja nie jest potrzebna, numer ma pozostać pusty.

`06_deploy.sh` dla TEST może:

- wykonać Git preflight lokalnie,
- połączyć się przez SSH,
- zaktualizować repozytorium na QNAP,
- zbudować nowy obraz,
- uruchomić ten obraz na TEST,
- wykonać healthcheck i status.

TEST jest środowiskiem, na którym powstaje i jest sprawdzany nowy obraz.

### 2. `07_qnap_prod_ssh`

Ten katalog ma mieć inny kontrakt niż TEST.

PROD nie może budować nowego obrazu.

PROD ma używać dokładnie tego samego obrazu, który wcześniej został zbudowany i uruchomiony na TEST.

Dlatego w `07_qnap_prod_ssh`:

- nie może być `02_build.sh`,
- nie może być `06_deploy.sh`,
- nie może być żadnego skryptu wykonującego docker build,
- nie może być żadnego nowego release tagu tworzonego specjalnie dla PROD.

Zamiast deploy ma być operacja:

`06_last_from_test.sh`

Numer 06 pozostaje slotem operacji wdrożeniowej, ale nazwa ma jasno mówić, że PROD bierze ostatni obraz z TEST.

Docelowa struktura może wyglądać np.:

```text
07_qnap_prod_ssh/
├── 03_restart.sh
├── 05_status.sh
├── 06_last_from_test.sh
├── 07_logs.sh
└── lib.sh
```

Nie twórz skryptów, których PROD realnie nie potrzebuje.

### 3. Kontrakt `06_last_from_test.sh`

Ten skrypt ma:

- ustalić, jaki dokładnie obraz jest obecnie używany przez TEST;
- odczytać jego:
  - tag,
  - image ID,
  - commit/revision, jeżeli jest zapisany;
- sprawdzić, czy obraz istnieje lokalnie na QNAP;
- pokazać użytkownikowi, jaki obraz zostanie promowany;
- poprosić o wyraźne potwierdzenie wdrożenia na PROD;
- ustawić PROD na dokładnie ten sam obraz;
- nie wykonywać żadnego buildu;
- zrestartować lub uruchomić kontener PROD;
- wykonać healthcheck i status;
- na końcu potwierdzić, że TEST i PROD wskazują na ten sam image ID.

Jeżeli nie da się jednoznacznie ustalić obrazu używanego przez TEST, skrypt ma przerwać operację zamiast zgadywać.

Jeżeli obraz TEST nie istnieje, operacja ma zakończyć się błędem.

### 4. Różnica semantyczna

Zapisz w dokumentacji:

- TEST:
  - buduje nowy obraz,
  - uruchamia go,
  - służy do sprawdzenia wersji;
- PROD:
  - nie buduje,
  - nie wykonuje niezależnego deployu,
  - promuje ostatni zweryfikowany obraz z TEST;
- restart:
  - uruchamia lub restartuje istniejący obraz;
- last_from_test:
  - przenosi dokładnie artefakt z TEST na PROD.

### 5. Aktualizacja wcześniejszego planu

Zaktualizuj plan tak, aby:

- usunąć docelowy katalog `06_qnap_ssh`;
- wprowadzić:
  - `06_qnap_test_ssh`;
  - `07_qnap_prod_ssh`;
- rozdzielić wspólną logikę SSH od logiki specyficznej dla TEST i PROD;
- usunąć z PROD build i deploy;
- dodać `06_last_from_test.sh`;
- uwzględnić migrację wszystkich aktywnych odwołań;
- uwzględnić aktualizację dokumentacji i kompendium.

Na tym etapie nie implementuj jeszcze zmian. Najpierw pokaż poprawione drzewo, plan migracji oraz listę plików do rename/move/delete.

## Input 3

Potwierdzam kolejne decyzje:

1. `00_qnap_shared` zostaje. Jest to katalog logiki wspólnych usług uruchamianej bezpośrednio na QNAP-ie.

2. Nie twórz teraz `08_qnap_shared_ssh`. Zdalne wrappery dla shared nie są obecnie potrzebne. W razie potrzeby wspólnymi usługami można zarządzać bezpośrednio przez SSH i skrypty z `00_qnap_shared`.

3. Używamy jednego wspólnego:
   `bash-scripts/common/lib.sh`

   Nie twórz osobnego `common_ssh/lib.sh` ani kopii `lib.sh` w każdym katalogu SSH. Funkcje specyficzne dla SSH również umieść w istniejącym wspólnym `common/lib.sh`, ale zachowaj logiczne sekcje i nie mieszaj odpowiedzialności.

4. `end` musi zostać i zachowuje stały numer:
   `04_end.sh`

   Nie używaj `07_end.sh`.

   `03_restart.sh` ma korzystać z `04_end.sh`, gdy środowisko już działa, a następnie uruchamiać je ponownie.

5. Nie dodawaj teraz `07_logs.sh`, jeżeli nie ma istniejącej realnej implementacji ani potrzeby. Slot 07 może pozostać pusty. Nie przesuwaj innych operacji, aby wypełnić lukę.

6. PROD nie buduje obrazu i nie ma własnego deploymentu:
   - usuń `05_qnap_prod/02_build.sh`;
   - usuń `05_qnap_prod/06_deploy.sh`;
   - zaktualizuj wszystkie ich aktywne odwołania.

   Jedyną operacją wdrożeniową PROD ma być:
   `07_qnap_prod_ssh/06_last_from_test.sh`

7. Podczas buildu obrazu TEST zapisz SHA commita Git w metadanych obrazu, najlepiej jako standardowy Docker/OCI label:
   `org.opencontainers.image.revision=<git-sha>`

   `06_last_from_test.sh` ma przed promocją pokazywać:
   - tag obrazu;
   - image ID;
   - SHA commita;
   - aktualny obraz TEST;
   - aktualny obraz PROD.

   Po operacji ma potwierdzić, że TEST i PROD korzystają z tego samego image ID.

Zaktualizuj plan i pokaż ostateczne drzewo przed rozpoczęciem implementacji.

To zostały już praktycznie wszystkie decyzje. Ja dopisałbym Claude jeszcze tylko to, żeby nie musiał zgadywać:

```text
Doprecyzowanie decyzji do Story:

Potwierdzam następujące decyzje projektowe:

1. `00_qnap_shared` zostaje.

Nie usuwaj go. Najpierw uporządkuj jego nazewnictwo i dokumentację zgodnie z nowym standardem.

2. Nie twórz `08_qnap_shared_ssh`.

Na razie nie potrzebuję zdalnych wrapperów SSH dla shared.

3. Używamy wyłącznie jednego wspólnego:

`bash-scripts/common/lib.sh`

Nie twórz `common_ssh/lib.sh` ani osobnych `lib.sh` w katalogach SSH.

4. `04_end.sh` pozostaje obowiązkową operacją.

`03_restart.sh` ma korzystać z `04_end.sh` podczas restartu.

5. Nie dodawaj teraz `07_logs.sh`.

Slot 07 pozostaje pusty do czasu pojawienia się rzeczywistej potrzeby.

Nie przesuwaj numerów tylko po to, żeby nie było luk.

6. W `05_qnap_prod`:

usuń:

- `02_build.sh`
- `06_deploy.sh`

PROD nie buduje obrazu.

PROD nie wykonuje własnego deploymentu.

7. Jedyną operacją wdrożeniową dla PROD ma być:

`07_qnap_prod_ssh/06_last_from_test.sh`

To ona promuje ostatni zweryfikowany obraz z TEST.

8. Podczas builda TEST zapisuj w obrazie:

- git SHA,
- image ID,
- tag obrazu.

`06_last_from_test.sh` ma pokazywać użytkownikowi wszystkie te informacje przed promocją na PROD.

9. Przed rozpoczęciem implementacji pokaż mi jeszcze raz kompletne docelowe drzewo katalogów oraz wszystkie rename/move/delete wynikające z tych decyzji.
```

To już zamyka wszystkie główne decyzje architektoniczne. Claude nie będzie musiał niczego domyślać ani proponować alternatywnych wariantów.

## Input 4

Daj:

```text
07_logs.sh
```

To jest **istniejąca funkcja**, więc jej przeniesienie z `05_logs.sh` do właściwego slotu nie jest „dodawaniem nowej funkcjonalności”. Punkt o niedodawaniu `07_logs.sh` dotyczył tworzenia nowych wrapperów logów tam, gdzie ich teraz nie ma.

Tutaj chodzi tylko o naprawienie numeracji w `02_local_mac_tmux`:

```text
01_config.sh
02_build.sh
03_restart.sh
04_end.sh
05_status.sh
07_logs.sh
tmuxinator.dashboard.yml
```

Slot `06` pozostaje pusty, bo lokalny wariant Tmuxinator nie ma osobnego `deploy`.

Odpowiedz Claude:

```text
Przenieś istniejący `02_local_mac_tmux/05_logs.sh` do:

`02_local_mac_tmux/07_logs.sh`

To nie jest dodawanie nowego skryptu logów ani nowej funkcjonalności — tylko przeniesienie istniejącej operacji do właściwego, stałego slotu numeracyjnego.

Docelowa struktura `02_local_mac_tmux`:

01_config.sh
02_build.sh
03_restart.sh
04_end.sh
05_status.sh
07_logs.sh
tmuxinator.dashboard.yml

Slot 06 pozostaje pusty, ponieważ ten wariant nie ma osobnej operacji deploy.

Nie używaj `90_logs.sh`. Numeracja 90 jest przeznaczona dla niestandardowych narzędzi technicznych, takich jak ręczne `port-kill`, a logs są standardową operacją nr 07.
```

## Input 5

OK, wszystkie decyzje architektoniczne zostały podjęte.

Nie blokuj już implementacji kolejnymi pytaniami o nazwy plików ani numerację. Jeśli podczas implementacji wyjdzie drobna niespójność, podejmij rozsądną decyzję zgodną z ustalonym standardem i opisz ją później w raporcie.

Przejdź teraz do implementacji zgodnie z zaakceptowanym planem. Priorytetem jest działający kod, a nie dalsze dopracowywanie struktury katalogów.

Dodatkowo znalazłem kolejny błąd w skryptach deploy. Przed chwilą zrobiłem deploy na TEST i skrypt nie ostrzegł mnie, że mam lokalne, niezacommitowane zmiany. To jest obowiązkowa funkcjonalność i musi zostać poprawiona.

Skrypt deploy powinien przed rozpoczęciem wykonywać kontrolę `git status` i wyświetlać wyraźne ostrzeżenie, jeśli w repozytorium znajdują się jakiekolwiek niezacommitowane zmiany. Ostrzeżenie nie musi blokować deploya, ale użytkownik musi zostać o tym jednoznacznie poinformowany przed kontynuacją.

## Input 6

Znalazłem konkretny błąd w aktualnej implementacji skryptów deploymentu TEST.

Build obrazu zakończył się poprawnie:

```
[ok] Image built: chad-dashboard:260717_010442
```

Błąd pojawił się dopiero przy uruchamianiu środowiska TEST:

```
bash: /share/qnap/03_files_programming/03_github/chad/bash-scripts/dashboard/04_qnap_test/03_re-start.sh: No such file or directory
```

To oznacza, że po rename na `03_restart.sh` pozostało aktywne odwołanie do starej nazwy `03_re-start.sh`.

Popraw to teraz.

Wymagania:

1. Znajdź wszystkie aktywne odwołania do:
   - `03_re-start.sh`
   - `04_re-start.sh`
   - `re-start`
   - starych nazw `begin`

2. W szczególności sprawdź:
   - `bash-scripts/dashboard/04_qnap_test/06_deploy.sh`
   - wszystkie skrypty w `06_qnap_test_ssh`
   - wszystkie skrypty w `07_qnap_prod_ssh`
   - `bash-scripts/common/lib.sh`
   - dokumentację deploymentową

3. Popraw wywołanie w deploy TEST tak, aby używało:
   `03_restart.sh`

4. Nie buduj ponownie obrazu, jeżeli nie jest to konieczne.

Aktualny obraz:
`chad-dashboard:260717_010442`

został już poprawnie zbudowany i zapisany w:
`.image-tag.chad-dashboard.env`

Po poprawieniu odwołania:

- uruchom istniejący obraz przez właściwy `03_restart.sh`,
- wykonaj status,
- wykonaj healthcheck,
- potwierdź, że TEST rzeczywiście używa obrazu `260717_010442`.

5. Następnie wykonaj repo-wide grep i upewnij się, że nie zostały żadne aktywne odwołania do starych nazw:

```bash
grep -R "03_re-start.sh\|04_re-start.sh\|begin_.*\.sh" \
  bash-scripts \
  documentation \
  --include="*.sh" \
  --include="*.md"
```

Historyczne odwołania mogą zostać tylko wtedy, gdy rzeczywiście opisują dawny stan. Wszystkie aktywne komendy i przykłady mają wskazywać aktualne pliki.

6. Dopisz ten błąd do bieżącej Story jako kolejny input i uwzględnij go w raporcie końcowym:

- build obrazu: sukces,
- restart TEST: błąd przez stare odwołanie,
- root cause: niepełny rename,
- fix: aktualizacja aktywnych wywołań,
- runtime verification: TEST uruchomiony z istniejącego obrazu.

Nie zadawaj kolejnych pytań o nazewnictwo. To jest jednoznaczny bug po niepełnym rename — popraw go i zweryfikuj runtime.
