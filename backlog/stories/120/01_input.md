# Story 120 — Input

## Input 1

Claude/Cursor — canonical CP Item URLs + Open in new tab + niezawodna historia Back/Forw (v11)

1. Opis konkretnego zadania użytkownika

To jest kontynuacja świeżo wdrożonego mechanizmu linków [UUID] → CP Item w shared Preview. Nie zaczynaj tej funkcji od nowa i nie przepisuj parsera, który już działa.

Najpierw przeczytaj bieżące Story/checklistę/ostatni raport oraz sprawdź working tree, ponieważ implementacja linków CP Item mogła jeszcze nie być wypchnięta do publicznego main.

Masz trzy ściśle powiązane cele:

1. CP link ma być prawdziwym linkiem i wspierać:
   prawy klik → Open link in new tab
   Cmd/Ctrl+click
   middle-click

2. aktualnie otwarty CP Item ma być reprezentowany w URL,
   a Folders ma odtwarzać go po refresh/direct-link

3. wspólne Back/Forw ma naprawdę zapamiętywać ścieżkę użytkownika
   przez kilkanaście przejść, szczególnie po klikaniu CP linków

To zadanie jest ważne architektonicznie: URL ma stać się źródłem prawdy dla aktualnie otwartego itemu, a historia ma opierać się na rzeczywistych zmianach URL zamiast na prywatnym stanie poszczególnych stron.

1.1. CP-link musi być prawdziwym <a href> / Next <Link>

Aktualny link [UUID] w Preview został już wdrożony. Teraz popraw go tak, aby nie był wyłącznie:

onClick → fetch → router.push(...)

bez prawdziwego href.

Wymagane zachowanie przeglądarki:

lewy klik
→ otwarcie itemu w tej samej karcie

prawy klik
→ standardowe menu przeglądarki
→ Open Link in New Tab

Cmd+click / Ctrl+click / middle-click
→ nowa karta

To wymaga semantycznego linku:

<Link href="...">tekst</Link>

albo prawdziwego <a href>. Nie implementuj własnego context menu i nie używaj buttona stylizowanego jak link.

1.2. Canonical URL Folders zawiera address aktualnego itemu

Obecnie Folders jest pod:

http://localhost:12020/dashboard/folders

Jeśli aktualnie otwarty item ma address:

21d11bdc-f1f4-44d1-b61a-3fa6b039c641/14/13/01

URL ma być:

http://localhost:12020/dashboard/folders/21d11bdc-f1f4-44d1-b61a-3fa6b039c641-14-13-01

Czyli dla CP address:

<repoGuid>/<numeric child index>/<numeric child index>/...

canonical route slug ma postać:

repoGuid-14-13-01

1.3. Slug musi być odwracalny mimo myślników w UUID

Nie rób naiwnego:

slug.replaceAll("-", "/")

bo UUID już zawiera myślniki.

Wydziel jeden współdzielony, testowalny helper, np. semantycznie:

cpAddressToRouteSlug(address)
cpRouteSlugToAddress(slug)
cpAddressToFoldersHref(address)

Dla przykładu:

slug:
21d11bdc-f1f4-44d1-b61a-3fa6b039c641-14-13-01

decode:
repoGuid = 21d11bdc-f1f4-44d1-b61a-3fa6b039c641
loca     = 14/13/01
address  = 21d11bdc-f1f4-44d1-b61a-3fa6b039c641/14/13/01

Użyj stałego, walidowanego formatu UUID jako pierwszej części oraz jawnie walidowanych segmentów loca. Nie dopuszczaj path traversal ani dowolnego path injection.

1.4. Direct deep-link musi działać od zera

To ma działać po wklejeniu w nowej karcie:

/dashboard/folders/<address-slug>

bez wcześniejszego React state i bez localStorage:

→ sesja rozwiązuje user/repo access
→ decode slug
→ pobierany jest właściwy CP Item
→ Folders pokazuje dokładnie ten item
→ address/item-id są poprawne

To jest warunek konieczny dla Open in new tab.

1.5. /dashboard/folders nadal działa i używa last-address fallback

Base route ma pozostać poprawny.

Priorytet źródeł:

1. URL slug
2. localStorage last address — tylko gdy URL nie wskazuje itemu
3. obecny domyślny/root folder

Jeśli localStorage jest stary, item nie istnieje lub user nie ma dostępu — zignoruj/usuń wpis i wróć do root bez crasha.

1.6. URL aktualizuje się przy każdej realnej zmianie current CP Item

Nowy history entry przy:

kliknięciu childa;

GO do address;

wejściu przez CP link;

zmianie repo/root;

każdej innej istniejącej nawigacji do innego itemu.

Bez nowego history entry przy:

Save body/config;

refreshie tego samego itemu;

zmianie draftu;

Body/Config toggle;

Preview/Editor;

dialogach, Copy, Import.

Reguła:

zmiana current item identity → nowy URL/history entry
mutacja tego samego itemu → ten sam URL

1.7. Nie utrzymuj konkurencyjnych historii

Publiczny Folders nadal ma lokalne nav.items/nav.index/goBack/goForward, a dashboard ma DashboardHistoryProvider + NavGroup.

To jest potencjalna przyczyna poprzednich nieudanych prób.

Docelowo:

canonical URL
→ DashboardHistoryProvider
→ NavGroup Back/Forw

Nie:

Folders local history
+ Dashboard history
+ browser history
= trzy niezależne semantyki

Lokalny cache itemów może zostać, jeśli potrzebny, ale nie może definiować własnego Back/Forw sprzecznego ze shared navigation.

1.8. Back ma pamiętać kilkanaście przejść

To wymaganie jest krytyczne. Aktualny publiczny provider ma MAX_BACK = 5; to za mało.

Wymagane minimum:

MAX_BACK >= 20

albo sensowny limit 20–30.

Back ma odtwarzać rzeczywistą ścieżkę odwiedzin, np.:

Knowledge doc A
→ klik CP-link
→ Folders item B

Back
→ dokładnie Knowledge doc A

Nie parent folder B, jeśli shared history ma wcześniejszy URL.

1.9. Forward

Minimum:

Back B → A
→ Forw A → B

Jeśli provider naturalnie zachowuje więcej Forward, nie ograniczaj go sztucznie. Zachowaj browser-like semantics:

A → B → C
Back → B
nowa nawigacja → D
→ stary forward do C znika

1.10. Nowa karta ma własną historię

Right-click → new tab:

nowa karta ładuje item przez URL;

nie dziedziczy sztucznie stacka starej karty;

jeśli persistujesz stack, użyj sessionStorage, nie globalnego localStorage.

localStorage w tym zadaniu ma służyć tylko do last CP address.

1.11. localStorage — zapamiętaj ostatni CP address

Po każdej poprawnej zmianie aktualnego itemu zapisuj:

last address = currentItem.Address

Wpis musi być scope'owany przynajmniej per repo / właściwy user context. Nie używaj jednego globalnego lastFolderAddress, który miesza userów/repo.

LocalStorage nigdy nie jest źródłem autoryzacji. Każdy odczytany address przechodzi normalną walidację backendu.

1.12. Refresh zachowuje item

/dashboard/folders/<slug-A>
→ F5/Cmd+R
→ nadal item A
→ URL canonical bez zmiany

Dodatkowo:

odwiedź A
→ zapisz A jako last address
→ wejdź /dashboard/folders
→ przywróć A i canonical URL

1.13. Inne miejsca otwierające CP Item

Użytkownik chce, aby również w innych detail views identyfikator aktualnego itemu był w URL.

Zrób celowany audyt ekranów, które naprawdę otwierają konkretny CP Item, szczególnie Knowledge po otwarciu dokumentu.

Reguła:

detail identity → URL
refresh/direct link → ten sam detail

Jeśli dany ekran już ma stabilny pathname/query identyfikujący dokument, nie przebudowuj go bez potrzeby — tylko upewnij się, że shared history widzi go jako osobny URL.

1.14. UUID link source vs canonical address URL

Źródłowy Preview nadal przechowuje stabilny:

[CP_ITEM_UUID]

Canonical Folders URL pokazuje aktualny address.

Docelowo:

Preview UUID
→ resolve UUID w bieżącym repo/user scope
→ aktualny address
→ canonical href /dashboard/folders/<address-slug>

Aby prawy klik działał, href musi istnieć przed kliknięciem.

Preferuj:

bezpośredni canonical href, jeśli resolver zna address przy renderze;

jeśli nie — wewnętrzny prawdziwy route /dashboard/folders/by-id/<uuid>, który autoryzuje, resolve UUID i redirectuje do canonical address route.

Nie zostawiaj href="#" + JS handler.

1.15. Browser Back/Forward też musi działać

Sprawdź browser Back/Forward oraz shared przyciski. Provider nie może walczyć z browser history ani po popstate pushować odwiedzonego URL ponownie.

1.16. Nie myl świeżej nawigacji A→B→A z Back

To bardzo ważny przypadek dla obecnego algorytmu, który rozpoznaje previous/next po równości URL.

A → B → A przez świeży klik/link

ma dać stack:

[A, B, A]

Back z ostatniego A ma prowadzić do B.

Nie wolno błędnie uznać świeżego kliknięcia A za operację Back tylko dlatego, że A jest poprzednim wpisem.

1.17. Push vs replace

Przejście do innego itemu = push semantics.

replace tylko dla technicznej canonicalizacji tej samej tożsamości lub kontrolowanego base-route restore, jeśli nie chcesz tworzyć pustego /folders jako osobnego kroku.

Udokumentuj wybór.

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

3.1. Aktualny publiczny punkt odniesienia

Na moment przygotowania promptu publiczny main ma:

packages/dashboard/components/shared/dashboard-history-provider.tsx z MAX_BACK = 5, RAM-only i heurystyką previous/next;

packages/dashboard/components/shared/nav-group.tsx, gdzie Back preferuje shared history, a potem structural upLevel;

packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx z własnym nav.items/nav.index, lokalnym goBack/goForward i inicjalnym ładowaniem root.

Jednocześnie świeżo wdrożone CP-linki mogą być tylko w working tree. Zawsze najpierw sprawdź lokalny HEAD/Story i nie cofaj nowszego kodu do publicznego snapshotu.

3.2. Wspólny codec route

Jeden moduł + testy:

address → slug;

slug → repoGuid/loca/address;

address → canonical Folders href;

walidacja.

Nie duplikuj w Folders, Preview, Knowledge i by-id route.

3.3. Dynamic route bez duplikowania Folders

Obsłuż:

/dashboard/folders
/dashboard/folders/<address-slug>

bez dwóch kopii dużego Folders componentu. Wydziel client component / użyj właściwego App Router patternu, jeśli potrzebne.

3.4. Inicjalizacja z URL

Przy slug nie wykonuj najpierw root fetch, który chwilę później jest zastępowany targetem i zanieczyszcza historię. Od razu rozwiązuj target.

3.5. Jeden helper nawigacji current item

Wszystkie wejścia do innego itemu powinny przechodzić przez jeden mechanizm semantyczny navigateToCpItem(...) lub równoważny. Unikaj niezależnego pushItem() + router.push() rozsianego po wielu handlerach.

3.6. Przeprojektuj DashboardHistoryProvider starannie

Nie wystarczy zmienić MAX_BACK z 5 na 20.

Musi poprawnie rozróżniać:

navigation wywołane przez jego Back/Forward;

świeżą nawigację do URL, który przypadkiem jest previous/next;

browser Back/Forward;

duplicate consecutive URL;

branching po Back.

Pokryj szczególnie A→B→A testem.

Jeśli Next App Router nie udostępnia wprost rodzaju nawigacji, możesz użyć kontrolowanego pending action/target dla własnych Back/Forward i traktować inne zmiany świadomie. Nie twórz kolejnej kruchej heurystyki bez testów.

3.7. Folders local nav

Po przejściu na URL-driven identity usuń/ogranicz lokalny stack jako source of truth dla Back/Forward. Cache jest dopuszczalny; konkurencyjna historia nie.

3.8. Back vs structural upLevel

Zachowaj aktualną zasadę NavGroup:

shared history first
→ jeśli brak historii → structural upLevel

Kluczowy test Knowledge → CP → Back.

3.9. Persistence

Wymagany jest localStorage last address. Pełnego stacka między kartami nie persistuj w localStorage.

Jeśli chcesz utrzymać historię po refreshu, sessionStorage jest właściwsze per-tab, ale nie jest to wymagane do ukończenia zadania, jeśli URL + last-address + bieżący stack spełniają wymagania.

3.10. Shared Preview links

Nie zmieniaj działającego parsera [UUID]. Popraw tylko rendering/nawigację, aby DOM zawierał realny href i standardowe modyfikatory kliknięć działały natywnie.

3.11. localStorage helper

Wydziel mały SSR-safe helper get/set/remove-invalid. Nie rozrzucaj raw localStorage po komponentach.

3.12. Move item

UUID link pozostaje stabilny po Move; canonical address URL może się zmienić. Nie próbuj utrzymywać starego address URL jako tożsamości itemu. Jeśli brak istniejącego redirect history, stary adres może normalnie dawać not-found.

3.13. Security

Slug i localStorage to niezaufany input. Backend nadal waliduje repo/session/access. UUID cross-user lookup ma być blokowany.

3.14. Dokumentacja

Zaktualizuj shared navigation/history, Folders i CP-link/shared Preview docs. Jasno opisz:

CP link source identity = UUID
Folders canonical URL identity = current address slug
URL drives selected item
localStorage = fallback last address only
DashboardHistoryProvider = Back/Forw session history

4. Zakazy i granice

Nie:

implementuj własnego context menu;

renderuj link jako button bez href;

używaj window.open() jako substytutu prawdziwego linku;

rób slug.replaceAll("-", "/");

używaj localStorage jako autoryzacji;

trzymaj wspólnego stacka historii w localStorage między kartami;

zostawiaj trzech konkurencyjnych history stacków;

zwiększaj tylko MAX_BACK i uznawaj historię za naprawioną;

traktuj A→B→A jako Back;

duplikuj całego Folders page dla dynamic route;

przebudowuj całego dashboardu;

zmieniaj działającego parsera [UUID] bez potrzeby;

omijaj DBA/Content Provider;

wdrażaj PROD;

pushuj bez zgody.

5. Weryfikacja — obowiązkowe scenariusze

5.1. Codec

uuid → uuid → round-trip
uuid/14 → uuid-14 → round-trip
uuid/14/13/01 → uuid-14-13-01 → dokładny round-trip
invalid UUID → reject
invalid segment → reject
path traversal → reject

5.2. Deep-link / refresh

nowa karta /folders/<slug> → właściwy item
refresh → ten sam item
URL ma priorytet nad innym localStorage

5.3. Base route + last address

odwiedź A → localStorage A
/folders → restore A
stale/deleted/forbidden A → fallback root bez crasha

5.4. Right click/new tab

Sprawdź realnie, że href istnieje w DOM i:

right-click oferuje Open Link in New Tab;

Cmd/Ctrl-click działa;

middle-click działa;

nowa karta ładuje target bez stanu starej karty.

5.5. Krytyczny Back

Knowledge doc A
→ CP-link B
→ Back
→ dokładnie Knowledge A
→ Forw
→ dokładnie Folders B

5.6. 15–20 przejść

Wykonaj realnie 15–20 nawigacji między Folders children, CP-links, Knowledge/details. Back x15 ma odtworzyć dokładnie odwrotną kolejność.

5.7. Branching

A → B → C
Back → B
fresh D
→ Forw do C już niedostępny

5.8. Revisit A→B→A

Fresh click do A tworzy nowy entry. Back prowadzi do B.

5.9. Browser Back/Forward

Sprawdź browser Back/Forward i synchronizację disabled state NavGroup.

5.10. Brak fałszywych entries

Save body/config, Preview/Editor, Body/Config, refresh same item nie tworzą historii.

5.11. Izolacja

Repo A/B last-address nie mieszają się. Forbidden slug/UUID nie ujawnia danych.

6. Kryteria akceptacji

CP-link ma prawdziwy href;

natywny right-click/new-tab działa;

canonical /dashboard/folders/<address-slug> działa;

hypheny UUID nie psują decode;

direct deep-link działa;

refresh zachowuje item;

/dashboard/folders restore'uje last address z localStorage;

URL wygrywa z localStorage;

current item changes tworzą history entries, save/toggle nie;

Back po Knowledge→CP wraca do dokładnego Knowledge dokumentu;

Back działa przez co najmniej 15–20 testowanych przejść;

Forward działa co najmniej jeden krok;

branching czyści forward;

A→B→A działa jako fresh navigation;

browser Back/Forward i NavGroup są zsynchronizowane;

nie ma konkurencyjnej lokalnej historii Folders;

nowa karta ma niezależną historię;

dynamic route nie duplikuje Folders GUI;

permissions/cross-user bez regresji;

dokumentacja zaktualizowana;

build/typecheck/testy PASS;

local Docker przebudowany oficjalnym workflow;

realny smoke PASS;

commit tylko w zakresie;

brak PROD i brak push bez zgody.

7. Raport końcowy

Punkt startowy:
CP link / new tab:
Address codec:
Folders canonical route:
Deep link:
localStorage:
History root cause:
History implementation:
MAX back:
Forward:
A→B→A test:
Knowledge→CP→Back test:
Browser Back/Forward:
Cross-user:
Testy:
Local Docker:
Smoke:
Dokumentacja:
Commit:
Niewykonane:
Blockery:

Bez dużego diffu i zbędnego podsumowania. Szczegóły zapisz w Story.
