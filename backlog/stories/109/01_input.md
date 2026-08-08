# Story 109 — Inputs

## Input 1

Prompt dla Claude Code — Msg Planner sorting + import CP Folder z ZIP (v11)

1. Opis konkretnego zadania użytkownika

Pracujesz w aktualnym repozytorium CHAD:

$repo_path

Masz dwa konkretne zadania. Nie rozszerzaj zakresu poza nie.

1.1. Msg Planner — popraw sortowanie comboboxa planów

W podstronie Msg Planner jest combobox z itemami planów. Obecnie kolejność jest niepoprawna dla nazw z sufiksem literowym.

Przykład obecny:

26-08-04
26-08-04b
26-07-08
26-06-19
26-06-11

Oczekiwane:

26-08-04b
26-08-04
26-07-08
26-06-19
26-06-11

Jeżeli są 26-08-04c, 26-08-04b, 26-08-04, kolejność ma być dokładnie taka: c, b, bez sufiksu. Najpierw sortuj malejąco po dacie YY-MM-DD, a dla tej samej daty sufiksy literowe malejąco, przy czym każdy wariant z sufiksem jest wyżej niż wariant bazowy bez sufiksu. Nie rób prostego sortowania stringów, jeśli nie daje tej semantyki. Nazwy niepasujące do wzorca nie mogą powodować crasha.

1.2. Folders / cp-gui — import jednego Folder CP Item z ZIP

W zakładce Folders dodaj dla aktualnie otwartego itemu typu Folder przycisk Import. Po kliknięciu użytkownik wybiera plik .zip. ZIP ma zostać uploadowany, zapisany/stage'owany w katalogu użytkownika odpowiadającym logicznie:

/share/cp_1/02_files_refrenced/[username]/02_files_zip/temp

ale nie hardcoduj ścieżki QNAP w kodzie biznesowym — sprawdź aktualne mounty/env i użyj istniejącej konwencji. Każdy import ma osobny katalog temp/<import-guid>/.

Cały ZIP ma być bezpiecznie rozpakowany i w całości zwalidowany przed pierwszym zapisem do CP. Po sukcesie albo błędzie katalog konkretnego importu ma zostać usunięty.

1.3. Dokładnie jeden root CP Folder Item

Na pierwszym logicznym poziomie archiwum ma znajdować się dokładnie jeden folder reprezentujący główny CP Folder Item. Nie wolno zaakceptować dwóch równorzędnych root itemów. Jeżeli archiwizer dodaje techniczny wrapper, można go pominąć wyłącznie według jednoznacznej, bezpiecznej reguły i tylko jeśli po jej zastosowaniu nadal istnieje dokładnie jeden root CP item.

1.4. Reguły struktury CP w ZIP

Każdy katalog CP itemu ma nazwę tylko numeryczną, 2 albo 3 cyfry:

^\d{2,3}$

Poprawne: 01, 02, 10, 99, 100, 102. Błędne: 1, abc, 01a, 0001.

W itemie mogą występować tylko pliki dozwolone przez aktualny kontrakt CP oraz numeryczne katalogi dzieci. Użytkownik w opisie użył nazwy config.txt, ale aktualne packages/content-provider/files/README.md mówi, że realny filesystem CP używa config.yaml i body.txt. Nie zgaduj: sprawdź aktualny kontrakt. Jeżeli nadal obowiązuje config.yaml, importer ma użyć rzeczywistego formatu CP, a nie tworzyć nowy config.txt. Jeżeli repo ma udokumentowany osobny format importowy config.txt, zastosuj go tylko na podstawie tej dokumentacji.

Folder może nie mieć body.txt; Text ma spełniać aktualny kontrakt body. Odrzucaj nieoczekiwane pliki. Nie akceptuj symlinków, absolute paths, .., path traversal / Zip Slip, device files ani nietypowych wpisów archiwum.

1.5. Walidacja configu

Nie wystarczy sprawdzić nazw plików. Dla każdego itemu zweryfikuj aktualny CpConfig, co najmniej wymagane pola (type, name, id, address) zgodnie z bieżącym kontraktem. Nie ufaj address z ZIP; docelowy address ma wynikać z realnego miejsca importu albo być wyliczony przez istniejącą domenową operację CP. ZIP nie może wskazać innego repo użytkownika. Nie dodawaj Ref bez potwierdzonego kontraktu.

1.6. Import atomowy / all-or-nothing

To jest wymaganie krytyczne:

upload → bezpieczne unzip → pełna walidacja całego drzewa → plan importu → dopiero zapis

Jeżeli jakikolwiek item jest niepoprawny, import ma zakończyć się FAIL i nic nie może zostać dodane do CP. Nie wolno zostawić połowy drzewa. Jeżeli aktywny backend nie ma natywnej transakcji, nie udawaj atomowości — zaprojektuj transakcję, staging+commit albo pełny rollback. Jeżeli nie da się bezpiecznie zagwarantować all-or-nothing, zgłoś blocker zamiast wdrażać partial import.

1.7. Kod importu MUSI należeć do domeny Content Provider

Nie wkładaj reguł importu CP do page.tsx, Next.js route ani cp-gui poza minimalnym UI/upload adapterem. Repo ma osobną domenę:

packages/content-provider/

Aktualny układ obejmuje m.in. common, entry, files, postgre, mongo, api. Root README mówi, że common zawiera wspólne modele/kontrakty, entry jest publicznym routerem/factory i callerzy nie mają wybierać backendu.

Reguły definiujące poprawne drzewo CP, dozwolone pliki, walidację config/body, plan importu, numerację i relacje parent/child muszą znaleźć się w odpowiednim pakiecie packages/content-provider/. Backend-independent parser/validator/DTO umieść w istniejącym wspólnym pakiecie, jeśli pasuje; filesystem-specific staging/unzip/path checks w pakiecie filesystem, jeśli to jego odpowiedzialność; publiczne wywołanie wystaw przez aktualny publiczny entry point. Nie twórz nowego subpackage bez potrzeby. Dashboard ma pozostać cienki.

1.8. Import do aktualnego folderu

Importowany root Folder ma zostać dodany jako jedno dziecko aktualnie otwartego Folder, a jego poddrzewo odtworzone pod nim. Nie zastępuj aktualnego folderu. Zachowaj hierarchię, nazwy logiczne, typy, body i bezpieczne dodatkowe pola config. Politykę konfliktów (ta sama nazwa, numeric index, id) ustal przed zapisem. Nie nadpisuj istniejących danych po cichu; domyślnie konflikt ma zatrzymać import przed commit, chyba że aktualny kontrakt CP ma jednoznaczną bezpieczną semantykę.

1.9. Staging i izolacja użytkownika

Logiczny staging to 02_files_refrenced/<username>/02_files_zip/temp. username pochodzi z sesji, nie z requestu. Nie składaj ścieżek bez containment check. Każdy import musi pozostać w katalogu bieżącego użytkownika.

1.10. Limity i ZIP bomb

Dodaj limity: maksymalny rozmiar ZIP, liczba entries, łączny rozmiar po rozpakowaniu, rozmiar pojedynczego pliku, głębokość drzewa oraz ochronę przed ZIP bomb / podejrzanym compression ratio. Odrzuć encrypted ZIP, jeśli biblioteka nie ma bezpiecznej jawnej obsługi. Nie polegaj wyłącznie na Content-Length.

1.11. Minimalny UX

Przycisk Import w widoku Folder ma otwierać file picker .zip. Pokaż stany Uploading..., Validating..., Importing...; blokuj podwójne kliknięcie; po błędzie pokaż konkretny powód; po sukcesie toast i odświeżenie listy dzieci. Nie buduj osobnego import wizard.

2. Zabezpieczenia przed podstawowymi błędami AI Codera

2.1. Minimalizacja tokenów bez pomijania wiedzy

Minimalizuj zużycie tokenów:

nie analizuj całego repo bez potrzeby;

nie wykonuj szerokiego audytu, jeśli znane są właściwe moduły;

nie czytaj tych samych dużych plików wielokrotnie;

nie powtarzaj audytów, backupów i testów już potwierdzonych w bieżącym Story lub raporcie;

wykorzystuj istniejące logi, checklisty, raporty i dokumentację;

czytaj tylko dokumentację i kod potrzebne do konkretnego zadania;

ogranicz raporty pośrednie;

szczegóły zapisuj w Story, a nie powtarzaj ich w czacie;

nie twórz nowego planu, jeśli plan został już zatwierdzony;

nie pytaj o rutynowe zgody, jeśli działanie jest bezpieczne i mieści się w zakresie.

Oszczędzanie tokenów nie oznacza:

pomijania dokumentacji;

zgadywania ścieżek;

pomijania testów regresyjnych;

rezygnacji z backupu przy zmianach danych;

twierdzenia, że coś działa bez realnej weryfikacji.

2.2. Dokumentacja i standardy według specjalizacji

Najpierw przeczytaj aktualny punkt wejścia dokumentacji projektu.

Aktualne repozytorium używa:

$repo_path/ai-docs/begin_here/

Nie zakładaj automatycznie ai-docs/start_here/, README.md, CLAUDE.md ani AGENTS.md. Jeżeli struktura repo ponownie się zmieni, sprawdź ją i użyj rzeczywistego punktu wejścia.

Kolejność:

1. ai-docs/begin_here/
2. dokumenty wskazane przez punkt wejścia;
3. dokumentacja właściwej specjalizacji;
4. dokumentacja bieżącego Story;
5. dopiero potem kod i skrypty objęte zadaniem.

Dokumentacja projektu jest segregowana według specjalizacji. Przed implementacją odszukaj folder specjalizacji związany z zadaniem i stosuj opisane tam standardy.

Przykłady:

ai-docs/bash-scripts/

oficjalne skrypty deploymentu, restartu, backupu, statusu i logów;

deployment wykonuj wyłącznie przez oficjalne skrypty repo;

nie zastępuj ich ad-hoc SSH lub ręcznym docker compose, jeśli istnieje standardowy skrypt;

dokumentacja baz danych / PostgreSQL / Mongo / offline backup

opisuje źródła prawdy;

zasady local, TEST, PROD i offline-readonly-backup;

określa, które bazy są aktywne, zapasowe i tylko do odczytu;

nie zmieniaj źródła danych ani connection stringów bez przeczytania tych zasad;

ai-docs/history/

standardy historii, atomowości, statusów i GUI History;

ai-docs/beeper/

MongoDB Beeper, izolacja użytkowników i synchronizacja;

dokumentacja tabel / Google Sheets

Daily, Dates, outbox, mapping kolumn i testy tables-sync;

dokumentacja DBA

interfejsy, provider, repo context i przepływ Dashboard → DBA → baza.

Nie twórz własnego standardu obok istniejącego. Nie duplikuj dokumentacji tylko dlatego, że spodziewana nazwa folderu różni się od rzeczywistej.

2.3. Obowiązkowy punkt powrotu przed rozpoczęciem pracy

Ten punkt musi być przekazywany do AI Codera w każdym prompcie dotyczącym zmian w repozytorium.

Zanim AI Coder zacznie modyfikować kod, dokumentację, konfigurację lub skrypty:

sprawdź aktualny stan repozytorium:

git status --short
git log -5 --oneline

ustal dokładnie, które zmiany istniały przed rozpoczęciem bieżącego zadania;

zapisz punkt początkowy pracy:

jeżeli istnieją bezpieczne, niezatwierdzone zmiany zastane przed zadaniem, utwórz osobny commit bazowy obejmujący wyłącznie ten zastany stan;

jeżeli working tree jest czysty, nie twórz pustego commita — zapisz aktualny commit SHA jako punkt początkowy;

zanotuj commit SHA punktu początkowego w Story, checkliście albo krótkim raporcie roboczym;

dopiero po zapisaniu punktu początkowego rozpocznij własne zmiany.

Cel:

stan przed zadaniem jest jednoznacznie zapisany
→ zmiany AI Codera są od niego oddzielone
→ w razie odrzucenia rozwiązania można natychmiast wrócić
  dokładnie do stanu z momentu rozpoczęcia pracy

Commit bazowy nie może zawierać:

.env, sekretów ani credentiali;

dumpów, backupów i dużych plików tymczasowych;

build artifacts;

przypadkowych plików;

zmian, których pochodzenia AI Coder nie rozumie.

Jeżeli zastane zmiany są niejasne, należą do równoległej pracy albo nie mogą zostać bezpiecznie zacommitowane, nie wolno ich nadpisywać ani usuwać. Trzeba je pozostawić nienaruszone, zapisać ich listę i odseparować własny zakres pracy.

AI Coder musi pamiętać punkt początkowy przez całe zadanie. Jeżeli użytkownik odrzuci wykonane zmiany, agent ma umieć szybko przywrócić stan dokładnie z zapisanego commit SHA, bez cofania wcześniejszej pracy użytkownika i bez używania destrukcyjnego git reset --hard bez wyraźnej zgody.

2.4. Nie zakładaj struktury systemu — najpierw sprawdź stan rzeczywisty

Nigdy nie pisz kodu na podstawie przypuszczeń dotyczących struktury systemu.

Przed implementacją sprawdź rzeczywisty stan:

strukturę katalogów i plików;

format oraz lokalizację istniejących danych;

rzeczywisty kształt rekordów w bazie;

aktualną konfigurację środowiska;

używane ścieżki, mounty, porty i źródła danych.

Nie zakładaj, że system działa zgodnie z wyobrażonym modelem tylko dlatego, że tak wyglądał kiedyś lub wydaje się logiczny.

Jeżeli implementacja zależy od istniejących danych lub infrastruktury, najpierw zweryfikuj ich rzeczywisty stan, a dopiero potem projektuj rozwiązanie.

Jeżeli błąd pojawił się po deploymencie, nie zakładaj automatycznie regresji w kodzie.

Najpierw sprawdź:

logi kontenerów;

mounty i dyski sieciowe;

połączenia z bazami danych;

dostępność usług i sieci;

konfigurację runtime.

Dopiero po wykluczeniu problemów infrastruktury traktuj błąd jako potencjalną regresję kodu.

Nie zgaduj. Najpierw sprawdź rzeczywisty stan systemu, potem pisz kod.

2.5. Celowana analiza aktualnego repozytorium

Przed zmianami:

sprawdź aktualny HEAD;

sprawdź bieżące Story i checklistę;

sprawdź tylko pliki bezpośrednio objęte zadaniem;

znajdź istniejący wzorzec w tej samej specjalizacji;

potwierdź rzeczywiste nazwy funkcji, skryptów, env i ścieżek;

nie opieraj się na pamięci ani starym raporcie, jeśli repo może być nowsze;

nie zgaduj architektury na podstawie labela w UI;

przy konfiguracji źródeł danych potwierdź realny runtime host, port, bazę, backend read i backend write.

Przykładowe wzorce:

deployment → oficjalne skrypty z dokumentacji bash-scripts
izolacja użytkownika → repo context / session
tabele → centralny schema + tests/tables-sync
historia → istniejący provider/read model
Dev Panel → realny runtime config, nie default lub opis

2.6. Najważniejsze testy regresyjne przed commitem

Przed wykonaniem commita uruchom najważniejsze testy regresyjne dotyczące dziedziny, w której wprowadzono zmiany.

Reguła:

zmieniłeś dany obszar
→ uruchom testy regresyjne tego obszaru
→ dopiero po PASS wykonaj commit

W szczególności:

zmiany logowania, sesji, bazy lub Dev Panelu:

smoke test /login;

prawidłowe logowanie;

odczyt chad_admin/users-list;

podstawowy zapis po zalogowaniu;

weryfikacja właściwego backendu;

zmiany Daily, Dates, tabel, historii, outboxów lub Google Sheets:

pnpm test:tables-sync;

odpowiednie unit/integration/e2e;

create/update/delete;

historia;

outbox;

reconciliation;

zmiany deploymentu:

build;

status;

healthcheck;

smoke test środowiska;

potwierdzenie, że drugie środowisko nie zostało zrestartowane;

zmiany bazy:

identity bazy;

county i hashe;

integrity checker;

backup i rollback, jeśli dane są modyfikowane;

zmiany offline-readonly-backup:

SELECT działa;

INSERT/UPDATE/DELETE/CREATE są blokowane;

switch server → backup → server;

logowanie i odczyt działają;

zapis jest blokowany wyłącznie w trybie read-only.

Każdy naprawiany bug musi otrzymać test zabezpieczający przed ponownym wystąpieniem.

Nie uznawaj zadania za zakończone, jeśli:

test nie został uruchomiony;

test jest zablokowany, ale raport mówi PASS;

build przeszedł, lecz realny flow nie został sprawdzony;

pojawiła się regresja w pozornie niezwiązanym wspólnym obszarze.

2.7. Bezpieczeństwo danych i migracji

Przy pracy z danymi:

nie wykonuj globalnego delete, drop, truncate ani czyszczenia bez ścisłego guardu;

nie nadpisuj nowszych danych starszymi;

nie uznawaj pustej lub małej bazy za właściwą bez sprawdzenia jej identity;

nie migruj danych tylko dlatego, że istnieją w starym backendzie;

najpierw ustal source of truth;

przed mutacją realnych danych wykonaj backup;

dla migracji wymagaj dry-run, countów, hashów, integrity i rollbacku;

zachowaj źródło do czasu akceptacji;

nie fabrykuj brakujących danych lub historii;

testowe mutacje wykonuj wyłącznie na przeznaczonych do tego użytkownikach;

test2 może być resetowalnym sandboxem;

test3 służy do kontrolowanych testów środowiska;

nie mutuj pawel_f, kamil_s ani innych realnych użytkowników bez wyraźnego polecenia.

Lokalna baza offline-readonly-backup:

jest wyłącznie awaryjnym snapshotem do odczytu;

nie jest development database;

nie jest test database;

nie jest migration target;

nie jest fallbackiem do zapisu;

nie może zostać użyta do naprawiania logowania przez seedowanie danych.

2.8. Architektura i warstwa DBA

Każda operacja biznesowa ma przechodzić przez obowiązującą warstwę DBA i jej interfejsy.

Prawidłowy przepływ:

Dashboard / API / Console
→ packages/dba
→ właściwy provider
→ PostgreSQL / Beeper Mongo / inne zatwierdzone źródło

Zasady:

Dashboard i route API mają być cienkimi adapterami;

nie omijaj DBA bez wyraźnej decyzji architektonicznej;

repoGuid pochodzi z sesji/repo context, nie z dowolnego query/body;

nie mieszaj kodu providerów w dużych wspólnych plikach;

wspólne kontrakty mają być niezależne od konkretnej bazy;

CHAD używa PostgreSQL jako źródła danych;

MongoDB pozostaje dla Beepera;

offline-readonly-backup jest wyłącznie lokalnym awaryjnym odczytem;

outboxy, historia i dane muszą zachować wymaganą atomowość.

Jeżeli dokumentacja DBA w repo wskazuje nowszy standard, stosuj ją zamiast starych przykładów z tego promptu.

2.9. Izolacja użytkowników

Jeżeli zadanie dotyczy danych użytkownika:

użytkownik jest rozwiązywany z sesji;

repoGuid nie może być dowolnie przyjmowany z query/body;

użyj obowiązującego repo context;

sprawdź cross-user isolation;

nie ujawniaj danych innego użytkownika;

Google Sheets mapping musi być per użytkownik;

spreadsheetId nie może mieć niekontrolowanego globalnego fallbacku;

Beeper używa osobnych baz beeper_<repoGuid> zgodnie z aktualną dokumentacją.

2.10. Git i równoległa praca

Przed zmianami sprawdź:

git status --short
git log -5 --oneline

Jeżeli inny agent pracuje równolegle:

nie cofaj jego zmian;

nie wykonuj git reset --hard;

nie rób force-push;

nie nadpisuj plików zmienionych przez drugiego agenta;

ogranicz zakres do własnego zadania;

przed commitem pobierz aktualny stan origin;

rozwiązuj wyłącznie rzeczywiste konflikty;

nie commituj przypadkowych plików, build artifacts, dumpów, backupów ani .env;

nie naprawiaj obcych zmian „przy okazji”.

Commity mogą być wykonywane swobodnie, jeżeli użytkownik tak ustalił. Push i deploy muszą przestrzegać zasad środowiska.

2.11. Deployment

Jeżeli zadanie dotyczy deploymentu:

najpierw przeczytaj dokumentację ai-docs/bash-scripts/ i właściwe dokumenty deploymentu;

używaj oficjalnych skryptów;

nie wykonuj ręcznych obejść bez potrzeby;

TEST i PROD mogą mieć różne obrazy/porty, ale muszą stosować zatwierdzony model promocji;

deploy jednego środowiska nie może restartować drugiego;

po deployu wykonaj status, logi, healthcheck i smoke test;

dla zmian ryzykownych przygotuj rollback.

Granice:

TEST można wdrażać, jeśli prompt na to pozwala;

PROD tylko po wyraźnej zgodzie użytkownika;

jeżeli deployment nie jest częścią zadania, nie wykonuj go;

nie zmieniaj shared infrastruktury, gdy wystarczy restart pojedynczej usługi.

2.12. Autonomia

Działaj samodzielnie.

Nie pytaj o rutynowe zgody.

Nie zatrzymuj się po samym planie, jeśli użytkownik zlecił wykonanie.

Zatrzymaj się tylko przy realnym ryzyku:

utraty danych;

braku backupu;

niepewnym rollbacku;

niejasnym source of truth;

konflikcie z równoległą pracą;

zmianie architektury poza zakresem;

deploymentcie PROD bez zgody;

operacji destrukcyjnej na realnych danych.

Autonomia nie daje zgody na:

kasowanie danych;

usuwanie wolumenów;

force-push;

resetowanie cudzej pracy;

wdrażanie PROD;

ukrywanie błędów testów.

2.13. Uczciwość testów i raportu

Nie twierdź, że coś działa, jeśli wykonano tylko:

analizę kodu;

typecheck;

build;

test jednostkowy, gdy wymagany był realny flow;

test lokalny, gdy problem dotyczył serwera;

test TEST, gdy raport dotyczy PROD.

W raporcie rozróżnij:

nieuruchomione
zablokowane
FAIL
PASS lokalnie
PASS na TEST
PASS na PROD

Raport końcowy ma być krótki i zawierać tylko:

co faktycznie zmieniono;

jakie testy faktycznie uruchomiono;

wynik build/deploy;

commit SHA;

niewykonane kroki i prawdziwe blokady.

Nie dodawaj ogromnego diffu ani zbędnych podsumowań.

2.14. Wznowienie pracy

Jeżeli zadanie jest kontynuacją:

Wznów od pierwszego niewykonanego kroku.
Nie powtarzaj potwierdzonych audytów, backupów i testów.
Najpierw przeczytaj bieżące Story, checklistę oraz ostatni raport.

Nie zaczynaj całego zadania od nowa.

2.15. Obowiązkowe przebudowanie lokalnego środowiska po zmianach

Po wykonaniu zadania nie kończ pracy na samym buildzie, typechecku ani testach uruchomionych bezpośrednio w repo.

Częstym błędem AI Codera jest zmiana kodu bez przebudowania i ponownego uruchomienia lokalnego środowiska Docker. W efekcie użytkownik nie widzi zmian w lokalnej wersji, mimo że agent raportuje zakończenie zadania.

Jeżeli zmiana dotyczy aplikacji uruchamianej lokalnie w Dockerze:

przeczytaj dokumentację ai-docs/bash-scripts/;

znajdź aktualne oficjalne skrypty dla lokalnego środowiska Mac Docker;

użyj oficjalnej ścieżki repozytorium, obecnie związanej z:

bash-scripts/dashboard/03_local_mac_docker/

wykonaj właściwy rebuild obrazu;

uruchom lub zrestartuj lokalne kontenery oficjalnym skryptem;

sprawdź status, logi i healthcheck;

wykonaj realny smoke test zmienionej funkcji na działającej lokalnej aplikacji.

Nie zastępuj oficjalnych skryptów ręcznym docker compose, ad-hoc komendami ani samym pnpm build, jeżeli repozytorium posiada zatwierdzony workflow local_mac_docker.

Nie raportuj zadania jako zakończonego lokalnie, dopóki:

kod został zmieniony
→ obraz lokalny został przebudowany
→ kontener został uruchomiony lub zrestartowany
→ zmiana została sprawdzona na działającej lokalnej wersji

Jeżeli oficjalny rebuild lub restart nie został wykonany, raport musi jasno mówić:

lokalne środowisko Docker nie zostało przebudowane

Nie wolno sugerować, że użytkownik powinien widzieć zmianę w lokalnej aplikacji, jeśli wykonano jedynie build lub testy w repozytorium.

3. Szczegółowy zakres implementacji

3.1. Celowana analiza repo

Sprawdź aktualny HEAD oraz tylko potrzebne pliki/dokumenty, w szczególności:

human-docs/dashboard/msg-planner/features/msg-planner.md
packages/dashboard/app/(dashboard)/dashboard/msg-planner/page.tsx
packages/dashboard/app/api/msg-planner/route.ts

packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx
packages/dashboard/app/api/folders/**
packages/cp-gui/
packages/content-provider/README.md
packages/content-provider/common/
packages/content-provider/entry/
packages/content-provider/files/
packages/content-provider/postgre/
packages/dba/src/item-ops.ts
packages/dba/src/cp-model.ts
ai-docs/deploy/qnap-data-path.md

Odszukaj dokumentację specjalizacji z ai-docs/begin_here/; nie audytuj całego repo.

3.2. Msg Planner — comparator

Wydziel testowalny parser/comparator. Semantyka: data malejąco, dla tej samej daty sufiks malejąco, brak sufiksu poniżej sufiksów. Wymagany przykład:

26-08-04c
26-08-04b
26-08-04
26-07-08

Nie zmieniaj nazw w storage.

3.3. Import — validate/plan i commit

Domena importu ma mieć wyraźny etap bez zapisów (validateAndPlan) oraz commit (commitImport) lub równoważny podział. Plan ma zawierać pełne drzewo, parent-child, typy, nazwy, body, config, source relative paths, docelowe adresy/loca i konflikty.

3.4. Bezpieczne ZIP extraction

Kontroluj entries przed zapisem. Dla każdego: normalizuj path, odrzuć absolute path, .., symlink, sprawdź containment w <temp>/<guid>, wymuś limity. Nie używaj bez kontroli unzip archive.zip -d ... dla danych użytkownika.

3.5. Walidator drzewa

Walidator przechodzi całe drzewo przed importem i zwraca strukturalne błędy z code, path, message, bez stack trace dla klienta.

3.6. Zachowanie indeksów

Sprawdź, czy publiczny kontrakt CP pozwala utworzyć item pod konkretnym indeksem, czy tylko przydziela następny. Nie zakładaj. Jeżeli zachowanie indeksów wymaga domenowej operacji importowej, dodaj ją do packages/content-provider zamiast omijać API bezpośrednim SQL/filesystem write.

3.7. Route Dashboard

Route odpowiada tylko za sesję, upload, podstawowy gate pliku, przekazanie do domeny i mapowanie błędów na HTTP. Reguły CP nie mogą mieszkać w route.

3.8. Cleanup

Cleanup po PASS, validation FAIL, commit FAIL i exception. Usuwaj tylko konkretny temp/<import-guid>, nigdy cały temp.

3.9. Dokumentacja domeny

Uzupełnij dokumentację packages/content-provider o kontrakt ZIP importu: struktura, dokładnie jeden root Folder, dozwolone pliki, numeric folders, config/body, bezpieczeństwo, atomowość, konflikty i cleanup.

4. Zakazy i granice

Nie wkładaj walidacji CP ZIP do page.tsx; nie wkładaj całego importera do Next.js route; nie zapisuj bezpośrednio SQL z Dashboard; nie hardcoduj /share/cp_1; nie ufaj username/repoGuid/address z klienta; nie rozpakowuj ZIP bez Zip Slip protection; nie akceptuj więcej niż jednego root item; nie importuj części drzewa po validation error; nie nadpisuj konfliktów po cichu; nie dodawaj Ref bez kontraktu; nie przebudowuj całego Folders GUI; nie zmieniaj niezwiązanych funkcji Msg Planner; nie wdrażaj PROD.

5. Weryfikacja i testy

5.1. Msg Planner

26-08-04b przed 26-08-04;

26-08-04c, 26-08-04b, 26-08-04;

nowsza data przed starszą;

nazwy bez sufiksu;

niepasujące nazwy bez crasha;

realny combobox pokazuje właściwą kolejność.

5.2. ZIP — poprawne fixture

jeden root Folder bez dzieci;

Folder z Text;

nested Folder;

indeksy 2-cyfrowe i 102;

Folder bez body;

Text z poprawnym body;

dodatkowe dozwolone pola config.

5.3. ZIP — błędne fixture

zero root itemów;

dwa root itemy;

1, abc, 0001;

niedozwolony plik;

brak/uszkodzony config;

niewspierany type;

brak body tam, gdzie kontrakt wymaga;

../evil;

absolute path;

symlink;

ZIP bomb / limit decompressed bytes;

zbyt wiele entries;

encrypted archive;

konflikt istniejącego root child;

cross-user staging/path attempt.

5.4. Atomowość

Osobny test: root OK + child A OK + child B INVALID => po FAIL nic z tego drzewa nie istnieje w CP. Dodaj także test awarii w commit phase i sprawdź transakcję/rollback.

5.5. Cleanup

Po PASS, validation FAIL i commit FAIL katalog konkretnego importu nie może pozostać. Inne aktywne importy nie mogą zostać usunięte.

5.6. Realny smoke

Na użytkowniku testowym: otwórz Folder, Import, wybierz fixture ZIP, sprawdź status, po sukcesie odświeżenie dzieci, wejdź do root, sprawdź nested children/body/config, refresh i temp cleanup. Nie mutuj pawel_f/kamil_s.

6. Kryteria akceptacji

Msg Planner sortuje 26-08-04c > 26-08-04b > 26-08-04;

Folders ma Import dla Folder;

file picker przyjmuje ZIP;

staging jest per-user i per-import GUID;

dokładnie jeden root CP Folder item;

folder names 2-3 cyfry;

nazwa config jest zgodna z realnym CP contract;

Folder może nie mieć body zgodnie z kontraktem;

całe drzewo walidowane przed zapisem;

import all-or-nothing;

Zip Slip/symlink/ZIP bomb defenses;

konflikty nie nadpisują danych po cichu;

cleanup po PASS i FAIL;

reguły importu są w packages/content-provider, nie w Dashboard;

Dashboard jest cienkim adapterem;

aktualny publiczny entry/DBA/provider flow jest zachowany;

izolacja użytkowników działa;

testy PASS;

local Docker przebudowany;

realny smoke PASS;

commit tylko tego zakresu;

PROD nietknięty.

7. Krótki format raportu końcowego

Punkt startowy:
Msg Planner:
CP Import:
Pakiet domenowy:
Testy:
Local Docker:
Smoke:
Commit:
Niewykonane:
Blockery:

Bez dużego diffu i zbędnych podsumowań. Szczegóły mają być w Story.

## Input 2

Prompt uzupełniający dla Claude Code — popraw warstwy DBA → Content Provider i zapisz tę zasadę w dokumentacji

To jest uzupełnienie bieżącego zadania ZIP importu. Nie zaczynaj zadania od nowa i nie powtarzaj zakończonych analiz/testów. Wznów pracę od aktualnego Story i pierwszego niewykonanego kroku.

1. Korekta architektury — obowiązkowa

W poprzednim pytaniu pojawiła się fałszywa alternatywa:

packages/dba
VS
packages/content-provider

To nie są konkurencyjne miejsca dla tej samej warstwy. One mają działać warstwowo.

Docelowa architektura CHAD ma być:

Dashboard / cp-gui
        ↓
      API route
        ↓
    packages/dba
        ↓
packages/content-provider
        ↓
      cp-entry
        ↓
konkretny provider:
postgre / files / mongo / net-adapter

Czyli:

Dashboard/cp-gui korzysta z DBA;

DBA jest publiczną warstwą aplikacyjną/orchestracyjną dla CHAD;

DBA ma korzystać z packages/content-provider dla operacji domenowych na CP Items;

packages/content-provider zawiera właściwe kontrakty i zasady Content Providera;

cp-entry wybiera właściwy backend/provider;

konkretny provider wykonuje fizyczną operację.

Nie implementuj nowej funkcji w taki sposób, żeby utrwalała obecny skrót:

Dashboard → DBA → bezpośredni postgres-cp-provider

jeżeli można bezpiecznie poprowadzić nowy kod zgodnie z:

Dashboard → DBA → Content Provider → provider

2. Obecny stan może być przejściowo niespójny

Repo jest w trakcie migracji. Jeżeli znajdziesz istniejące operacje, które dziś działają inaczej, np.:

DBA → postgres-cp-provider bezpośrednio

to:

nie przepisuj całego projektu w tym Story;

nie rób szerokiej migracji wszystkich starych metod przy okazji;

nowy kod projektuj już zgodnie z docelowym podziałem warstw;

jeżeli mała, bezpieczna korekta istniejącej ścieżki jest konieczna dla tej funkcji — wykonaj ją;

inne znalezione naruszenia zapisz jako jawne zadania/propozycje migracyjne;

architekturę należy poprawiać stopniowo:

stary skrót DBA → provider
→ zastępowany sukcesywnie
DBA → Content Provider → provider

nie utrwalaj nowych bezpośrednich zależności DBA od konkretnej implementacji backendu, jeżeli Content Provider ma już odpowiedni kontrakt albo można dodać mały brakujący kontrakt.

Najważniejsza zasada:

istniejący kod może być jeszcze przejściowy,
ale nowy kod nie powinien zwiększać długu migracyjnego.

3. Import ZIP — właściwy podział odpowiedzialności

Dla bieżącego importu CP Folder z ZIP rozdziel kod tak:

3.1. packages/content-provider/files

Ten package jest naturalnym miejscem na logikę filesystem/archive-specific, ponieważ już odpowiada za fizyczny format CP na dysku.

Tutaj mogą znaleźć się m.in.:

zip extraction / staging
Zip Slip protection
symlink/device-file rejection
limity ZIP / ZIP bomb checks
walidacja fizycznej struktury katalogów
reguła folderów 2–3 cyfry
odczyt config.yaml / body.txt z archiwum
parser drzewa ZIP → neutralny model/import plan
cleanup katalogu temp

Nie wkładaj tych zasad do page.tsx ani do Next.js route.

3.2. packages/content-provider/common

Jeżeli potrzebujesz backend-independent typów/kontraktów, umieść tutaj np.:

CpImportPlan
CpImportNode
CpImportValidationError
CpImportResult
ImportFolderOptions

Nie wkładaj tutaj Node/fs-specific implementacji.

3.3. packages/content-provider/entry

Publiczna operacja Content Providera powinna być wystawiona przez jego aktualny entry/router, tak żeby caller nie wybierał konkretnego backendu.

Semantycznie ma istnieć operacja podobna do:

importFolderTree(...)

albo inna nazwa zgodna z aktualnym stylem repo.

Nie wymuszam tej konkretnej sygnatury — sprawdź istniejące kontrakty.

3.4. provider postgre

Jeżeli import docelowo zapisuje CP Items do PostgreSQL, provider PostgreSQL ma wykonać właściwą atomową operację/transakcję, korzystając z obecnego modelu cp_items.

Nie wkładaj SQL do:

Dashboardu;

cp-gui;

packages/content-provider/files;

route API.

files odpowiada za format wejściowy ZIP/filesystem, nie za zapis do PostgreSQL.

3.5. packages/dba

DBA ma być warstwą, którą wywołuje Dashboard.

DBA odpowiada za rzeczy specyficzne dla CHAD/aplikacji, np.:

session/repo context
user ownership
read-only system folder rules
permissions/admin unlock
orchestration aplikacyjna
mapowanie błędów domenowych do kontraktu CHAD

Następnie wywołuje operację packages/content-provider.

Nie duplikuj w DBA:

walidatora struktury ZIP;

parsera drzewa CP;

zasad config.yaml/body.txt;

logiki provider-specific SQL.

4. Docelowy flow importu

Bieżący feature powinien dążyć do:

Folders UI
  ↓
Next.js upload route
  ↓
DBA import operation
  ↓
Content Provider entry
  ↓
content-provider/files:
  upload/staging/unzip/validate/parse → ImportPlan
  ↓
Content Provider import operation
  ↓
cp-entry
  ↓
postgre provider
  ↓
transakcja cp_items

Jeżeli aktualna implementacja wymaga technicznie nieco innego przepływu, zachowaj te same granice odpowiedzialności.

5. Bardzo ważne — popraw dokumentację na samym początku ścieżki dla AI

To nie może zostać wyłącznie wiedzą w Story.

Aktualne repo używa:

ai-docs/begin_here/

Nie ai-docs/start_here/.

Najpierw potwierdź aktualny HEAD i rzeczywistą strukturę. Następnie dopisz tę zasadę do dokumentacji czytanej przez AI na samym początku, tak żeby kolejny agent nie zadał ponownie pytania „DBA czy Content Provider?”.

Minimum:

znajdź główny entry-point / routing dokumentacji w:

ai-docs/begin_here/

w najwcześniejszym właściwym dokumencie dopisz krótki, jednoznaczny diagram:

Dashboard/API/Console
→ DBA
→ Content Provider
→ cp-entry
→ provider

dodaj zasadę:

DBA i Content Provider nie są alternatywnymi architekturami.
DBA jest warstwą wyżej i powinno delegować operacje CP do Content Providera.

dodaj zasadę migracyjną:

stare bezpośrednie ścieżki DBA → konkretny provider mogą jeszcze istnieć;
należy je stopniowo usuwać;
nowy kod nie powinien tworzyć kolejnych takich zależności;
przy pracy w danym obszarze poprawiaj lokalnie ten przepływ, jeśli jest to bezpieczne,
bez robienia szerokiego refaktoru całego systemu.

dodaj routing/link do właściwej, bardziej szczegółowej dokumentacji Content Provider/DBA;

jeżeli istnieje dokument typu 05_endpoint-rules.md lub inny nadrzędny dokument mówiący obecnie „CP access logic must live exclusively in packages/dba”, nie zostawiaj sprzeczności:

popraw sformułowanie;

rozróżnij API/application access w DBA od domenowej implementacji CP;

zsynchronizuj dokumenty.

Dokumentacja powinna jasno mówić:

DBA:
- publiczna warstwa aplikacyjna dla CHAD
- repo/user context
- permissions
- orchestration

Content Provider:
- domenowe operacje CP
- CpItem contracts
- reguły tworzenia/odczytu/importu
- backend-independent behavior

Provider:
- fizyczny backend
- PostgreSQL/files/Mongo/etc.

6. Dokumentacja packages/content-provider

Zaktualizuj też właściwe README/architecture w:

packages/content-provider/

tak aby było jasne:

caller aplikacyjny nie powinien wybierać providera bezpośrednio;
DBA deleguje operacje CP do publicznego entry Content Providera;
entry wybiera backend;
files może implementować fizyczne formaty/import/parser ZIP;
postgre implementuje trwały zapis do PostgreSQL.

Dodaj dokumentację importu ZIP w odpowiednim miejscu packages/content-provider/files, obejmującą:

format archiwum;

dokładnie jeden root Folder item;

katalogi ^[0-9]{2,3}$;

config.yaml;

body.txt;

Folder może nie mieć body.txt;

pełną walidację przed mutacją;

ochronę Zip Slip;

cleanup;

atomowość/all-or-nothing na poziomie docelowego zapisu;

granice odpowiedzialności między files, entry, postgre, dba.

7. Test architektury / regresji

Oprócz istniejących testów importu dodaj albo zaktualizuj testy tak, aby potwierdzić co najmniej:

Dashboard route nie importuje konkretnego CP providera
DBA nie zawiera parsera ZIP/filesystem CP
ZIP validator/parser jest w Content Provider
PostgreSQL mutation przechodzi przez Content Provider entry/provider
cross-user isolation nadal jest egzekwowana w warstwie DBA

Jeżeli repo ma dependency-boundary tests/lint, rozszerz je zamiast pisać ad-hoc grep test.

8. Zakazy

Nie:

wybieraj „packages/dba zamiast packages/content-provider”;

przenoś całej domeny CP do DBA;

przenoś session/user permissions do Content Providera;

wkładaj SQL do content-provider/files;

wkładaj Node ZIP extraction do content-provider/common;

przebudowuj całego DBA w tym Story;

naprawiaj wszystkich historycznych naruszeń architektury naraz;

twórz nowego równoległego routera backendów;

omijaj cp-entry, jeśli jest aktualnym publicznym entry pointem;

zostawiaj sprzecznej dokumentacji w ai-docs/begin_here.

9. Kryteria akceptacji

Zadanie uzupełniające jest zakończone, gdy:

nowa logika importu nie siedzi w DBA jako domena CP;

ZIP/filesystem rules są w packages/content-provider, preferencyjnie files dla części filesystemowej;

DBA wywołuje Content Provider;

Content Provider wywołuje właściwy provider;

PostgreSQL-specific write pozostaje w providerze PostgreSQL;

Dashboard route jest cienki;

ai-docs/begin_here od pierwszych dokumentów jasno pokazuje:

Dashboard → DBA → Content Provider → provider

dokumentacja zawiera zasadę stopniowego usuwania starych skrótów DBA → provider;

nie ma sprzecznego dokumentu mówiącego, że domenowa logika CP ma żyć wyłącznie w DBA;

dokumentacja packages/content-provider opisuje własność importu;

testy importu i granic warstw przechodzą;

nie wykonano niepowiązanego szerokiego refaktoru.

10. Raport końcowy

Podaj krótko:

Architektura:
Dokumentacja begin_here:
Content Provider:
DBA:
Import ZIP:
Testy:
Commit:
Blockery:

Nie wykonuj ponownie zakończonych części bieżącego zadania. To jest korekta/uzupełnienie architektury i dokumentacji do istniejącej implementacji.
</content>
