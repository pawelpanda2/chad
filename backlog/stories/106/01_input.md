# Story 106 — Inputs

## Input 1

CHAD — prompt dla Claude Code: zdjęcia przypisane do kontaktów

1. Opis konkretnego zadania użytkownika

Dodaj do istniejącego modułu Google Contacts nowy feature pozwalający przypisywać własne zdjęcia do kontaktu. To nie jest zmiana zdjęcia profilowego kontaktu w Google ani zapis przez People API. Zdjęcia mają być lokalnymi plikami CHAD powiązanymi ze stabilnym ID kontaktu.

1.1. Docelowy katalog

Pliki zapisuj na już podpiętym volume pod:

cp_1/02_files_refrenced/[nazwa_uzytkownika]/01_files_photos

Dla pawel_f:

cp_1/02_files_refrenced/pawel_f/01_files_photos

Zachowaj dokładną nazwę 02_files_refrenced. Nie poprawiaj jej na referenced, jeżeli rzeczywisty mount używa obecnej nazwy.

1.2. Najpierw sprawdź rzeczywisty mount

Nie zakładaj, że powyższy zapis jest bezpośrednią ścieżką widoczną z procesu Dashboardu. Najpierw sprawdź Dockerfile, compose, mount host→container, istniejący storage plików, audio recordings i uprawnienia LOCAL/TEST/PROD. Ustal runtime path na podstawie faktycznego mountu.

Nie dodawaj nowego volume, nie zmieniaj Dockerfile ani kolejności buildów packages, jeśli obecny mount wystarcza. Każdą zmianę Docker/compose uzasadnij konkretnym błędem bez tej zmiany.

1.3. Izolacja użytkowników

[nazwa_uzytkownika] musi pochodzić wyłącznie z aktualnej, zweryfikowanej sesji CHAD.

Zakazy:

nie przyjmuj username z query/body/formularza;

nie przyjmuj ścieżki od klienta;

blokuj ../, encoded traversal i separatory katalogów;

użytkownik nie może odczytać ani usunąć zdjęć innego użytkownika;

nie używaj wspólnego folderu bez podziału per użytkownik.

1.4. GUI

W istniejącym widoku Google Contacts dodaj przy każdym kontakcie wejście do zdjęć.

Minimalny flow:

kontakt → Photos / Add photo → wybór pliku → podgląd → Upload/Save

Wymagania:

zachowaj Search, grupy, Refresh i Disconnect;

zachowaj panel listy około 400 px na desktopie;

nie przebudowuj całej strony;

pokaż liczbę zdjęć kontaktu, jeśli > 0;

pokaż miniatury i większy podgląd;

pozwól dodać wiele zdjęć do jednego kontaktu;

pokaż loading, sukces, błąd i empty state;

po uploadzie odśwież zdjęcia bez przeładowania całej strony;

nie pokazuj użytkownikowi ścieżek hosta/kontenera.

1.5. Powiązanie zdjęcia z kontaktem

Sam plik w folderze nie wystarcza. Zapisz jednoznaczną relację:

użytkownik CHAD + stabilne Google contact resourceName/ID + photo metadata + plik

Nie używaj nazwy kontaktu ani telefonu jako identyfikatora. Są zmienne i nieunikalne. Użyj stabilnego ID z aktualnego modelu Google Contacts.

Plik fizyczny powinien mieć generowaną po stronie serwera, odporną na kolizje nazwę. Metadane powinny zawierać co najmniej: owner, Google contact ID, storage key, oryginalną nazwę, MIME, rozmiar, datę utworzenia. Nie przechowuj absolutnej ścieżki jako publicznego kontraktu.

Najpierw sprawdź aktualny model danych i warstwę DBA. Relacja i metadane mają przechodzić przez zatwierdzony interfejs DBA/storage. Nie twórz przypadkowego JSON-a obok plików, jeśli repo ma standard dla referencji do plików.

1.6. Walidacja uploadu

Po stronie serwera:

akceptuj minimum JPEG, PNG i WebP;

sprawdzaj MIME i magic bytes, nie tylko rozszerzenie;

odrzucaj SVG, HTML i pliki wykonywalne;

ustaw rozsądny limit rozmiaru zgodny ze standardem repo;

ogranicz liczbę plików na request;

nie ufaj nazwie przesłanej przez browser;

nie nadpisuj istniejącego pliku;

sprzątaj częściowy plik po błędzie;

nie loguj zawartości zdjęcia ani sekretów.

1.7. Odczyt zdjęć

Nie wystawiaj całego volume jako publicznego katalogu statycznego. Zdjęcia zwracaj przez kontrolowany endpoint, który:

wymaga sesji;

rozwiązuje ownera z sesji;

sprawdza własność metadanych;

przyjmuje ID zdjęcia, nie ścieżkę;

ustawia właściwy Content-Type i bezpieczne cache headers;

nie ujawnia ścieżki hosta ani kontenera.

1.8. Usuwanie

Dodaj usunięcie pojedynczego zdjęcia z potwierdzeniem:

Czy na pewno chcesz usunąć to zdjęcie?
Tak / Nie

Usunięcie ma sprawdzać sesję i własność, usuwać tylko wskazane lokalne zdjęcie oraz metadane i nie dotykać zdjęcia Google People API. Nie udawaj atomowej transakcji DB+filesystem; zastosuj jawny rollback/kompensację według wzorca repo.

1.9. Architektura

Preferowany przepływ:

Dashboard GUI → cienki endpoint/server adapter → packages/dba / storage service
→ metadane w zatwierdzonym źródle → plik na volume cp_1

Nie wkładaj logiki ścieżek, walidacji i filesystemu do komponentu React. Zdefiniuj interfejsy dla uploadu, listowania, odczytu, usunięcia, repozytorium metadanych i file storage.

Jeśli istnieje wzorzec audio recordings lub innych referenced files, użyj go jako punktu odniesienia, ale nie mieszaj domen i nie kopiuj ślepo.

1.10. Zakres

Wykonaj:

dodanie lokalnego zdjęcia do kontaktu;

listowanie wielu zdjęć kontaktu;

miniatury/podgląd;

usunięcie pojedynczego zdjęcia;

trwałe metadane relacji;

zapis na istniejącym volume;

izolację per użytkownik;

testy, dokumentację, lokalny rebuild i smoke test.

Poza zakresem:

modyfikacja zdjęcia w Google Contacts;

synchronizacja z telefonem;

crop/edycja/AI tagging;

masowy upload;

publiczne linki bez sesji;

deploy PROD.

1.11. Testy obowiązkowe

Dodaj testy dla:

ścieżki użytkownika wyliczonej z sesji;

odrzucenia username/path z requestu;

path traversal;

poprawnego JPEG/PNG/WebP;

fałszywego rozszerzenia i złego MIME/magic bytes;

limitu rozmiaru;

kolizji nazw;

stabilnego ID kontaktu;

wielu zdjęć kontaktu;

dwóch kontaktów o tej samej nazwie;

cross-user isolation dla list/read/delete;

braku ujawnienia fizycznej ścieżki;

błędu metadanych po zapisie pliku i sprzątnięcia;

błędu usuwania pliku;

stanów GUI;

regresji Search, grup, Refresh, Disconnect;

istniejących testów Google Contacts;

typecheck/build.

Testy filesystem wykonuj w katalogu tymczasowym. Nie zapisuj automatycznych fixture'ów do realnego pawel_f.

1.12. Realny smoke test

Po testach:

przebuduj lokalny Docker oficjalnym skryptem;

zaloguj się i otwórz Google Contacts;

wybierz kontrolowany kontakt;

dodaj nieszkodliwe zdjęcie testowe;

potwierdź fizyczny zapis pod runtime odpowiednikiem cp_1/02_files_refrenced/pawel_f/01_files_photos;

potwierdź miniaturę i trwałość po refreshu;

usuń zdjęcie;

potwierdź usunięcie pliku i metadanych;

potwierdź brak regresji Search/grupy/Refresh/Disconnect.

Nie pozostawiaj testowego zdjęcia w realnych danych. Preferuj użytkownika testowego, jeśli ma działającą integrację Google Contacts.

1.13. Kryteria akceptacji

Feature jest ukończony, gdy:

można dodać wiele zdjęć do konkretnego kontaktu;

relacja używa stabilnego ID kontaktu;

pliki trafiają do folderu właściwego użytkownika;

owner pochodzi z sesji;

zdjęcia są dostępne po odświeżeniu;

można je bezpiecznie podejrzeć i usunąć;

inny użytkownik nie ma dostępu;

walidacja działa po stronie serwera;

volume nie jest publiczny;

nie zmieniono zdjęć w Google;

istniejące funkcje Google Contacts działają;

testy, Docker rebuild i smoke test są rzeczywiście wykonane;

powstał osobny commit;

brak push i PROD.

2. Zabezpieczenia przekazywane do AI Codera

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

3. Kolejność wykonania

Zapisz punkt początkowy Git zgodnie z 2.3.

Przeczytaj ai-docs/begin_here/, bieżące Story Google Contacts i dokumentację storage/files/DBA/Docker.

Sprawdź rzeczywisty mount cp_1 i aktualny kod plików referencyjnych.

Ustal, czy według standardu jest to nowe Story czy kontynuacja; nie zgaduj numeru.

Udokumentuj host path → container path i decyzję o metadanych.

Zaimplementuj warstwę storage/DBA, kontrolowane endpointy i GUI.

Dodaj testy, uruchom regresję, typecheck i build.

Przebuduj lokalny Docker oficjalnym skryptem i wykonaj realny smoke test.

Uzupełnij Story i wykonaj commit.

Bez push i bez deployu PROD.

4. Dodatkowe zakazy

Nie zapisuj zdjęć jako base64 w bazie.

Nie wystawiaj volume publicznie.

Nie przyjmuj username ani ścieżki od klienta.

Nie identyfikuj kontaktu wyłącznie nazwą/telefonem.

Nie nadpisuj plików.

Nie zmieniaj People API ani zdjęcia Google.

Nie zmieniaj Dockerfile/compose lub kolejności buildów bez udowodnionej konieczności.

Nie commituj .env, zdjęć, sekretów ani zawartości volume.

Nie pushuj i nie wdrażaj PROD.

5. Krótki raport końcowy

1. Punkt początkowy Git SHA:
2. Story:
3. Rzeczywisty mount host → container:
4. Katalog bazowy zdjęć:
5. Model metadanych i relacji:
6. Zmienione elementy:
7. Walidacja i izolacja:
8. Testy + dokładny wynik:
9. Lokalny Docker + smoke test:
10. Commit SHA:
11. Blokady:

Nie dodawaj całego diffu ani zbędnych propozycji.

## Input 2

drugie zadanie to w podstronie
Links V2 zarowno w zakladce leads i conv dodac pomiedzy lista a search dla konewrsacji beeper combobox w ktorym sa grupy i domyslnie niech bedzie to ta sama domyslna grupa ustawiona w beeper / groups czyli teraz girls
i oczywiscie w tym comboboxie powinny byc te grupy do wyboru i lista powinna sie zmieniac/filtrowac w zaleznosci od wyboru

## Input 3 (mid-turn follow-up, Playwright smoke-test credentials)

"podam Ci zaraz hasla do uyztkonikow testowych i tez prawdziwego uztykownika
test2 password: changeme
test3 password: changeme
pawel_f password: changeme
wpisz je do pliku .env
tam bede bezpieczne"

## Input 4 (mid-turn follow-up, immediately after Input 3 — Lead Details Photos frame missing)

CHAD — prompt dla Claude/Cursor: brak ramki zdjęć w Lead Details + dane logowania do smoke testów

1. Opis zadania

Kontynuuj pracę nad featurem zdjęć przypisanych do leada/kontaktu.

Użytkownik ręcznie sprawdził stronę:

http://localhost:12020/dashboard/leads/details?leadName=26-08-01_nn_latina&leadLoca=03%2F06%2F97&returnTo=%2Fdashboard%2Fviews%3Fview%3Dleads

Na stronie Lead Details nie ma nowej ramki/sekcji do dodawania zdjęć. Na screenie są sekcje Contacts, Beeper, Google Contacts, Msg workouts i Delete lead, ale brakuje Photos.

To oznacza, że feature nie został poprawnie podłączony do realnego widoku Lead Details albo został dodany w innym miejscu niż oczekiwał użytkownik.

1.1. Oczekiwany rezultat GUI

Na stronie szczegółów leada dodaj nową ramkę:

Photos

Ramka ma wyglądać jak istniejące sekcje i być widoczna zawsze, także gdy lead nie ma zdjęć.

Minimalny flow:

Lead Details
→ Photos
→ Add photo
→ wybór pliku
→ Save/Upload
→ lista miniatur przypisanych do tego leada

Wymagania:

pusty stan No photos;

widoczny przycisk Add photo;

po uploadzie miniatura pojawia się bez pełnego reloadu;

zdjęcia są przypisane do aktualnego leada;

istniejące sekcje i układ nie mogą zostać zepsute;

nie przenoś tego feature'u wyłącznie do Google Contacts;

nie dodawaj zdjęć tylko na liście kontaktów Google.

1.2. Identyfikacja leada

Nie zakładaj, że leadName i leadLoca z query są źródłem prawdy. Najpierw sprawdź:

aktualny route/page Lead Details;

sposób pobierania leada;

stabilny identyfikator leada w DBA/DB;

istniejące DTO/metadane zdjęć;

czy komponent ramki zdjęć istnieje, ale nie jest renderowany;

czy feature został omyłkowo przypisany do Google Contacts zamiast leada;

czy backend działa, ale GUI nie jest podłączone.

Nie identyfikuj zdjęć wyłącznie nazwą leada, jeśli istnieje stabilny ID.

1.3. Storage

Zdjęcia mają być zapisywane na istniejącym volume pod:

cp_1/02_files_refrenced/[nazwa_uzytkownika]/01_files_photos

Dla pawel_f:

cp_1/02_files_refrenced/pawel_f/01_files_photos

Nie zmieniaj tej ścieżki ani nazwy 02_files_refrenced. Sprawdź rzeczywisty mount host → container. Nie dodawaj nowego volume, jeśli obecny już istnieje.

1.4. Dane logowania do lokalnych smoke testów

Problem z brakiem danych logowania powtarza się wielokrotnie.

Użytkownik zgadza się podać dane logowania do lokalnego CHAD i chce, aby agent:

zapisał je w lokalnym pliku .env używanym przez środowisko;

używał ich do smoke testów przeglądarkowych;

opisał w ai-docs, gdzie kolejne AI ma znaleźć te zmienne.

Twarde zasady:

poproś użytkownika o dane tylko wtedy, gdy nie zostały jeszcze podane w bieżącej sesji;

zapisz wartości wyłącznie do właściwego lokalnego .env;

.env musi pozostać poza Gitem;

nie wpisuj wartości loginu ani hasła do ai-docs;

w dokumentacji zapisz wyłącznie nazwy zmiennych, nazwę lokalnego .env, sposób użycia w smoke teście i informację, że wartości są lokalne oraz chronione;

nie pokazuj hasła w logach, raporcie, terminal output ani screenshotach;

nie commituj .env;

nie kopiuj danych do .env.example;

nie zapisuj credentiali do Story, raportu, issue ani commita;

nie zgaduj nazw zmiennych — najpierw sprawdź istniejący login flow i konwencję env.

Dokumentacja ma opisywać zasadę w stylu:

Local browser smoke tests read login credentials from the local dashboard .env.
Required variable names: <actual names from repo>.
Never commit values.

1.5. Smoke test po naprawie

Po dodaniu ramki zdjęć:

uruchom lokalny Docker oficjalnym skryptem;

zaloguj się przy użyciu credentiali z lokalnego .env;

otwórz dokładnie podany URL;

potwierdź obecność ramki Photos;

dodaj kontrolowane zdjęcie testowe;

potwierdź miniaturę;

odśwież stronę;

potwierdź trwałość;

usuń zdjęcie;

potwierdź usunięcie metadanych i fizycznego pliku;

sprawdź rzeczywistą ścieżkę na volume;

nie pozostawiaj testowego zdjęcia w danych użytkownika.

Jeśli Playwright nie potrafi użyć istniejącej sesji, agent ma zalogować się automatycznie z credentiali lokalnego .env, bez pytania użytkownika za każdym razem.

1.6. Ustal, co wcześniej zrobiono źle

Przed poprawką ustal i zapisz w Story/raporcie roboczym:

gdzie faktycznie został dodany feature zdjęć;

dlaczego nie pojawił się w Lead Details;

czy komponent istnieje, ale nie jest renderowany;

czy backend działa;

czy upload działa poza GUI;

czy feature został omyłkowo przypisany do Google Contacts zamiast leada;

czy lokalny build/restart używał aktualnego kodu.

Nie przepisuj całego feature'u od nowa, jeśli brakuje tylko integracji z właściwą stroną.

1.7. Równoległa praca

Przed zmianami:

git status --short
git log -5 --oneline

Jeżeli Cursor/Claude pracują równolegle:

nie cofaj cudzych zmian;

nie commituj cudzych plików;

nie dotykaj niezwiązanego packages/dba/src/links-v2/;

nie wykonuj git reset --hard;

nie rób force-push;

ogranicz zakres do Lead Details, zdjęć, smoke credentials i dokumentacji AI;

jeśli wspólny plik zawiera obce zmiany, wykonaj minimalny punktowy diff.

1.8. Docker

Nie zmieniaj Dockerfile, kolejności buildów ani compose bez udowodnionej konieczności.

Dozwolone jest tylko:

wykorzystanie istniejącego .env;

przekazanie istniejących wymaganych zmiennych do lokalnego runtime, jeśli rzeczywiście nie są dostępne;

użycie istniejącego volume.

Przed zmianą Docker/compose pokaż konkretny reprodukowalny błąd.

1.9. Testy

Dodaj lub uzupełnij testy dla:

renderowania ramki Photos na Lead Details;

pustego stanu;

uploadu;

listowania;

usuwania;

trwałości po ponownym pobraniu;

powiązania ze stabilnym ID leada;

izolacji użytkowników;

braku zdjęć innego leada;

zachowania istniejących sekcji;

odczytu credentiali wyłącznie z lokalnego env w smoke helperze;

braku wycieku wartości env do klienta i logów.

1.10. Kryteria akceptacji

Zadanie jest gotowe dopiero, gdy:

na dokładnie wskazanym URL widoczna jest ramka Photos;

można dodać zdjęcie;

zdjęcie jest widoczne po odświeżeniu;

można je usunąć;

plik trafia na właściwy volume;

relacja dotyczy właściwego leada;

login do smoke testów działa automatycznie z lokalnego .env;

ai-docs opisuje nazwy zmiennych i lokalizację env, bez wartości;

.env nie został zacommitowany;

testy i realny smoke test przeszły;

zmiany są w osobnym commicie;

bez push i bez PROD.

2. Zabezpieczenia zgodne z v11

2.1. Punkt powrotu

Przed modyfikacjami zapisz aktualny SHA jako punkt początkowy. Jeśli working tree zawiera obce zmiany, nie nadpisuj ich i nie mieszaj ich z tym zadaniem.

2.2. Dokumentacja

Najpierw przeczytaj aktualny punkt wejścia ai-docs/begin_here/, dokumentację właściwej specjalizacji, bieżące Story i dopiero potem kod.

2.3. Nie zakładaj struktury

Sprawdź rzeczywisty route, storage, mount, model danych, env i runtime. Nie zgaduj ścieżek ani źródła prawdy.

2.4. DBA i izolacja

Operacje biznesowe mają przechodzić przez właściwą warstwę DBA. Użytkownik pochodzi z sesji, nie z query/body. Sprawdź cross-user isolation.

2.5. Testy i uczciwy raport

Nie raportuj PASS, jeśli wykonano tylko build lub mock. Rozróżnij testy uruchomione, zablokowane, FAIL i PASS lokalnie.

2.6. Lokalny Docker

Po zmianach wykonaj oficjalny rebuild/restart lokalnego Dockera oraz realny smoke test na działającej aplikacji.

2.7. Git

Możesz commitować własne zmiany. Nie pushuj i nie wdrażaj PROD. Nie używaj force-push ani git reset --hard.

3. Kolejność wykonania

Zapisz punkt początkowy Git.

Przeczytaj ai-docs/begin_here/.

Przeczytaj bieżące Story zdjęć i ostatni raport.

Sprawdź working tree i równoległe zmiany.

Otwórz implementację Lead Details.

Ustal, gdzie wcześniej dodano feature zdjęć.

Sprawdź backend/API/storage.

Dodaj ramkę Photos do właściwej strony.

Dodaj lub popraw binding do leada.

Skonfiguruj lokalne credentiale smoke testu w .env po otrzymaniu ich od użytkownika.

Dodaj bezpieczną dokumentację w ai-docs bez wartości.

Uruchom testy i build.

Przebuduj lokalny Docker.

Wykonaj pełny smoke test na podanym URL.

Usuń testowe zdjęcie.

Sprawdź diff i wykonaj commit tylko własnego zakresu.

Bez push i bez PROD.

4. Zakazy

Nie zapisuj loginu ani hasła w dokumentacji.

Nie commituj .env.

Nie dodawaj credentiali do .env.example.

Nie loguj hasła.

Nie pytaj ponownie o login po zapisaniu go w lokalnym env.

Nie dodawaj zdjęć wyłącznie do Google Contacts.

Nie przebudowuj całego Lead Details.

Nie zmieniaj Dockerfile bez realnego FAIL.

Nie dotykaj niezwiązanych modułów.

Nie commituj cudzych zmian.

Nie pushuj.

Nie wdrażaj PROD.

5. Krótki raport końcowy

1. Punkt początkowy Git SHA:
2. Story:
3. Przyczyna braku ramki Photos:
4. Zmienione pliki:
5. Rzeczywisty mount:
6. Lokalny env używany do smoke loginu:
7. Nazwy zmiennych zapisane w ai-docs:
8. Testy + wynik:
9. Smoke test dokładnego URL:
10. Commit SHA:
11. Blokady:

Nie pokazuj wartości credentiali, pełnego diffu ani zbędnych podsumowań.
