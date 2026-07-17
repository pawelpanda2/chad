# Story 70 — Input

## Input 1

Pracujesz nad projektem CHAD.

Cel: przenieść budowanie obrazów Dashboarda poza QNAP i wdrażać je przez mój GitHub Container Registry — GHCR. QNAP ma już tylko pobierać gotowy obraz (`docker pull`) i restartować kontener. Nie może dalej wykonywać kosztownego `docker build` Dashboarda.

Najpierw przeczytaj wyłącznie konieczne dokumenty zaczynając od aktualnego punktu wejścia dokumentacji AI. Sprawdź też aktualny standard deploymentu, tagowania obrazów oraz istniejące skrypty:

bash-scripts/dashboard/
	00_qnap_shared
	02_local_mac_tmux
	03_local_mac_docker
	04_qnap_test
	05_qnap_prod
	06_qnap_test_ssh
	07_qnap_prod_ssh

Nie wykonuj szerokiego audytu całego repo. Po krótkiej analizie wdrażaj rozwiązanie.

## Nowe foldery

Utwórz dokładnie:

bash-scripts/dashboard/08_registry_prod
bash-scripts/dashboard/09_registry_test

Nie zmieniaj tych nazw ani kolejności.

Wewnątrz zachowaj obowiązujący globalny kontrakt numeracji operacji, np.:

01_config.sh
02_build.sh
03_restart.sh
04_end.sh
05_status.sh
06_deploy.sh
07_logs.sh

Nie twórz plików, które nie mają sensu dla danego środowiska. PROD nie może budować własnego obrazu.

## Docelowy przepływ TEST

Docelowo:

lokalny Mac lub GitHub Actions
	→ build obrazu Dashboarda
	→ push do ghcr.io
	→ QNAP TEST wykonuje docker pull
	→ restart TEST
	→ status i HTTP check

Folder:

bash-scripts/dashboard/09_registry_test

ma obsługiwać pełny deployment TEST przez GHCR.

Wymagania:

1. Obraz Dashboarda budowany jest poza QNAP.
2. Użyj mojego GitHub Container Registry:
   ghcr.io/pawelfluder/...
3. Najpierw sprawdź aktualną nazwę repozytorium i konwencję nazw obrazów. Nie zgaduj końcowej nazwy obrazu, jeżeli repo ma już standard.
4. Obraz ma mieć niezmienny tag oparty przynajmniej o Git SHA; można dodatkowo zachować obecny timestamp.
5. Nie używaj `latest`, jeżeli obecny standard CHAD tego zabrania.
6. Push do GHCR ma nastąpić dopiero po poprawnym buildzie.
7. QNAP ma wykonać wyłącznie:
   - logowanie do GHCR, jeśli konieczne;
   - `docker pull`;
   - zapisanie wdrażanego tagu;
   - restart istniejącego środowiska TEST;
   - status i healthcheck.
8. QNAP nie może wykonywać:
   - `docker build`;
   - `docker compose build`;
   - instalacji pnpm;
   - kompilacji Next.js.
9. Deployment TEST ma nadal sprawdzać:
   - shared MongoDB;
   - shared Content Provider;
   - HTTP 200 na porcie 12020;
   - brak restart loop.
10. Logi deploymentu mają być widoczne i jednoznacznie pokazywać:
   - Git SHA;
   - tag obrazu;
   - digest obrazu;
   - wynik push;
   - wynik pull;
   - image ID uruchomionego TEST.

## Docelowy przepływ PROD

Folder:

bash-scripts/dashboard/08_registry_prod

ma promować na PROD dokładnie ten sam obraz, który wcześniej został wdrożony i sprawdzony na TEST.

Wymagania:

1. PROD nigdy nie buduje obrazu.
2. PROD nie może wskazać przypadkowego najnowszego tagu.
3. Pobierz tag lub digest obrazu aktualnie uruchomionego na TEST.
4. Pokaż przed promocją:
   - tag TEST;
   - digest TEST;
   - Git SHA TEST;
   - aktualny obraz PROD.
5. Wymagaj jawnego potwierdzenia `PROD`.
6. Pobierz z GHCR dokładnie ten sam obraz po digest/tagu.
7. Uruchom PROD na tym samym image ID/digest co TEST.
8. Zweryfikuj:
   - TEST i PROD korzystają z dokładnie tego samego obrazu;
   - PROD odpowiada HTTP 200 na porcie 12030;
   - TEST nadal odpowiada;
   - shared Content Provider i MongoDB pozostają healthy.
9. Nie buduj obrazu ponownie podczas promocji.

## Autoryzacja GHCR

Nie zapisuj loginu ani tokena w Git.

Sprawdź obecny standard `.env` projektu i dodaj potrzebne zmienne, przykładowo:

GHCR_REGISTRY=ghcr.io
GHCR_USERNAME=pawelfluder
GHCR_IMAGE=...
GHCR_READ_TOKEN=...

Nazwy dopasuj do istniejącej konwencji projektu.

Wymagania:

- token QNAP ma mieć tylko minimalne uprawnienie do odczytu paczek;
- token do pushowania ma mieć minimalne wymagane uprawnienia;
- żadnego tokena w logach;
- użyj `docker login --password-stdin`;
- dodaj zmienne wyłącznie do odpowiednich plików `.env.example`;
- opisz, jaki token GitHub mam utworzyć i gdzie wkleić jego wartość;
- sprawdź, czy można użyć `GITHUB_TOKEN` w GitHub Actions zamiast osobnego PAT do pushowania.

## GitHub Actions

Sprawdź, czy repo ma już workflow do budowania obrazów.

Jeżeli istnieje — rozszerz istniejący wzorzec zamiast tworzyć duplikat.

Jeżeli nie istnieje — dodaj minimalny workflow, który:

1. checkoutuje repo wraz z `packages/net-content-provider`, jeżeli Dashboard build tego wymaga;
2. loguje się do GHCR;
3. buduje obraz Dashboarda;
4. taguje go Git SHA;
5. zapisuje OCI label:
   org.opencontainers.image.revision
6. pushuje obraz do GHCR;
7. pokazuje digest;
8. nie wdraża automatycznie PROD.

Nie uruchamiaj workflow automatycznie przy każdym przypadkowym pushu, jeżeli nie wynika to z aktualnego standardu. Preferuj jawne `workflow_dispatch` albo istniejący mechanizm deploymentu.

Jeżeli prostsze i zgodne z obecną architekturą jest budowanie na Macu przez `09_registry_test/02_build.sh`, możesz zachować oba warianty:

- lokalny build + push;
- GitHub Actions build + push.

Nie duplikuj jednak właściwej logiki tagowania i konfiguracji w wielu miejscach.

## Integracja z istniejącymi folderami

Nie usuwaj od razu:

04_qnap_test
05_qnap_prod
06_qnap_test_ssh
07_qnap_prod_ssh

Najpierw sprawdź ich zależności.

Docelowo:

- istniejące skrypty restart/status mogą zostać ponownie wykorzystane;
- registry foldery mają odpowiadać za build/push/pull/promocję;
- nie kopiuj całych istniejących skryptów, jeśli można wywołać wspólną funkcję;
- wspólna logika ma pozostać w `bash-scripts/common/lib.sh`;
- stare ścieżki deploymentu nie mogą przypadkowo dalej budować Dashboarda na QNAP.

Jeżeli zachowujesz stare skrypty jako kompatybilne wrappery, muszą kierować do nowego mechanizmu GHCR i wyraźnie informować, że build na QNAP został wyłączony.

## Bezpieczeństwo

Nie używaj:

- `git reset --hard`;
- force-pusha;
- `docker system prune`;
- `docker compose down -v`;
- ręcznego usuwania danych;
- tagu `latest` jako mechanizmu promocji;
- sekretów wpisanych w skryptach;
- osobnego builda PROD.

Nie zmieniaj Content Providera ani MongoDB, jeśli nie jest to konieczne dla tego zadania.

## Testy

Przed zakończeniem wykonaj:

1. shellcheck lub aktualny repozytoryjny odpowiednik dla zmienionych skryptów;
2. test generowania poprawnego tagu obrazu;
3. test braku sekretów w logach;
4. test, że skrypt TEST nie uruchamia żadnego `docker build` na QNAP;
5. test, że PROD nie ma operacji build;
6. test obsługi braku tokena GHCR;
7. test obsługi nieistniejącego obrazu/tagu;
8. weryfikację Compose po zmianie;
9. dry-run lub bezpieczny audyt komend deploymentowych.

Nie wykonuj deploymentu PROD bez mojej osobnej zgody.

## Dokumentacja

Zaktualizuj aktualną dokumentację deploymentu i tagowania obrazów.

Opisz:

- nowy przepływ build → GHCR → QNAP;
- przeznaczenie `08_registry_prod`;
- przeznaczenie `09_registry_test`;
- potrzebne sekrety;
- ręczne utworzenie tokenów GitHub;
- deployment TEST;
- promocję TEST → PROD;
- rollback do wcześniejszego tagu lub digestu;
- fakt, że QNAP nie buduje już Dashboarda.

## Na końcu pokaż

1. listę utworzonych i zmienionych plików;
2. nazwę obrazu GHCR;
3. format tagów;
4. sposób przechowywania digestu;
5. komendę deploymentu TEST;
6. komendę promocji PROD;
7. wymagane zmienne `.env`;
8. instrukcję utworzenia tokena GitHub;
9. wyniki testów;
10. informację, czy stary build Dashboarda na QNAP został całkowicie zablokowany.

Implementuj teraz. Nie wykonuj deploymentu PROD.

## Input 2

Cofnij zmiany w istniejących skryptach i przywróć ich wcześniejsze zachowanie.

To zadanie miało być wyłącznie addytywne.

Miałeś utworzyć nowe katalogi:

- `bash-scripts/dashboard/08_registry_prod/`
- `bash-scripts/dashboard/09_registry_test/`

Poprzednie skrypty działały dobrze i mają nadal działać dokładnie tak jak przed tą Story, bez zmiany zachowania.

Przywróć do stanu sprzed Story wszystkie zmiany w:

- `bash-scripts/dashboard/04_qnap_test/02_build.sh`
- `bash-scripts/dashboard/04_qnap_test/06_deploy.sh`
- `bash-scripts/dashboard/06_qnap_test_ssh/06_deploy.sh`
- `docker-compose.qnap.test.yml`

Sprawdź również wszystkie pozostałe istniejące pliki zmienione w tej Story.

`bash-scripts/common/lib.sh` może pozostać zmieniony tylko wtedy, gdy:

- dodane funkcje są wykorzystywane wyłącznie przez nowe katalogi registry,
- nie zmieniają zachowania starych skryptów,
- nie usuwają ani nie modyfikują dotychczasowych funkcji.

Stare ścieżki muszą nadal działać bez zmian:

- `04_qnap_test/*`
- `05_qnap_prod/*`
- `06_qnap_test_ssh/*`
- `07_qnap_prod_ssh/*`

Nie wyłączaj ich.
Nie przekierowuj ich do registry.
Nie usuwaj z nich builda ani deployu.
Nie zmieniaj ich kontraktu.

Nowy mechanizm GHCR ma istnieć równolegle i być uruchamiany wyłącznie przez:

- `09_registry_test/06_deploy.sh`
- `08_registry_prod/06_last_from_test.sh`

Najpierw pokaż:

1. `git diff --name-status`
2. listę istniejących plików zmienionych przez Story 70
3. które z nich zamierzasz przywrócić

Następnie cofnij wyłącznie zmiany Story 70 w starych plikach, bez naruszania wcześniejszych zmian innych Story.

Po cofnięciu wykonaj:

- `git diff --name-status`
- `bash -n` dla nowych skryptów registry
- sprawdzenie, że stare skrypty nie odwołują się do `08_registry_prod` ani `09_registry_test`
- sprawdzenie, że nowe skrypty nie nadpisują starych plików konfiguracyjnych

Nie commituj.

Na końcu podaj wyraźnie:

- które stare pliki zostały przywrócone,
- które nowe pliki pozostały,
- czy stare ścieżki działają dokładnie jak wcześniej,
- czy nowy system registry działa całkowicie równolegle.
