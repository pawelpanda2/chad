# Story 96 — Input

## Input 1

Cursor — Knowledge zasilane przez cp_items z repo chad_shared

1. Opis konkretnego zadania użytkownika

Pracujesz w głównym repozytorium kodu CHAD:

$repo_path

Zmień istniejący moduł Dashboard → Knowledge, aby zachować obecny frontend, który użytkownikowi bardzo się podoba, ale zastąpić statyczne dane rzeczywistą strukturą cp_items przechowywaną w repo Content Providera:

chad_shared

To nie oznacza tworzenia nowego repozytorium Git. chad_shared jest wspólnym repo danych/Content Providera. Najpierw sprawdź jego rzeczywisty model i aktualne mapowanie w PostgreSQL/DBA.

1.1. Docelowa struktura danych

W repo chad_shared utwórz główny Folder Item:

knowledge

Jego kolejne dzieci typu Folder Item mają automatycznie tworzyć opcje/kafelki w menu głównym Knowledge.

Przykład:

chad_shared
└── knowledge                         Folder Item
    ├── verbal-game                   Folder Item → opcja menu Knowledge
    │   ├── podstawy-rozmowy          Folder Item → nagłówek/ramka w widoku
    │   │   ├── rozwijanie-tematu     Text Item → dokument
    │   │   └── pytania-otwarte       Text Item → dokument
    │   └── historie-i-opowiadanie    Folder Item → nagłówek/ramka
    │       └── struktura-historii    Text Item → dokument
    └── kolejna-kategoria             Folder Item → kolejna opcja menu
        └── sekcja                     Folder Item → nagłówek/ramka
            └── dokument               Text Item → dokument

Nie zakładaj dokładnego formatu nazw, loca, address ani konfiguracji Itemów. Zweryfikuj aktualny kontrakt CpItem i Content Providera.

1.2. Mapowanie cp_items na istniejący frontend

Zachowaj aktualny wygląd:

/dashboard/knowledge
/dashboard/knowledge/verbal-game

Nie przebudowuj stylistyki, ramek, siatki ani layoutu bez potrzeby.

Docelowe mapowanie:

knowledge/<category Folder Item>
→ kafelek/opcja w menu Knowledge

knowledge/<category>/<section Folder Item>
→ nagłówek w istniejącej ramce sekcji

knowledge/<category>/<section>/<document Text Item>
→ dokument widoczny pod nagłówkiem

W szczególności:

dzieci Folder Item bezpośrednio pod knowledge tworzą dynamiczne opcje menu;

wejście w opcję menu otwiera dynamiczny widok tej kategorii;

dzieci Folder Item kategorii są sekcjami/nagłówkami w ramkach;

dzieci Text Item sekcji są dokumentami pod nagłówkami;

kliknięcie dokumentu otwiera jego treść w spójnym widoku dokumentu;

kolejność ma wynikać z rzeczywistej kolejności/numeracji dzieci CP, nie z alfabetycznego sortowania wymyślonego przez frontend;

etykieta ma wynikać z właściwego pola nazwy Itemu zgodnie z aktualnym modelem;

body Text Item jest treścią dokumentu;

frontend nie może mieć zakodowanych na stałe GROUPS, kategorii ani dokumentów.

Obecny statyczny Verbal Game ma zostać podpięty do cp_items, nie usunięty wizualnie ani zastąpiony innym designem.

1.3. Dynamiczny routing

Nie twórz osobnego pliku route dla każdej przyszłej kategorii.

Zastosuj dynamiczny routing oparty na bezpiecznym identyfikatorze/slugu kategorii, np. po zweryfikowaniu aktualnej architektury:

/dashboard/knowledge/[category]
/dashboard/knowledge/[category]/[document]

Nie używaj dowolnej ścieżki CP przesłanej przez klienta. Backend sam rozwiązuje kategorię/dokument wewnątrz dozwolonego korzenia:

chad_shared/knowledge

Obsłuż:

brak kategorii;

pustą kategorię;

pustą sekcję;

brak dokumentu;

zduplikowane lub niebezpieczne slugi;

zmianę nazwy Itemu;

bezpośrednie wejście przez URL;

loading;

empty;

controlled error.

1.4. Folders — odblokowanie wyboru chad_shared

W Dashboard → Folders odblokuj możliwość wybrania repo:

chad_shared

Obecny wybór repo jest celowo ograniczony ze względu na izolację użytkowników. Nie odblokowuj dowolnego dostępu do wszystkich repozytoriów.

Wymagania:

użytkownik z odpowiednim uprawnieniem ma móc wybrać chad_shared;

po wyborze może przejść do knowledge;

może dodawać kolejne Folder Item i Text Item zgodnie z istniejącymi operacjami Content Providera/DBA;

zapisane Itemy mają pojawiać się automatycznie w Knowledge;

zwykły użytkownik bez uprawnienia nie może edytować wspólnego repo;

prywatne repo innych użytkowników nadal pozostają niewidoczne;

klient nie może podać arbitralnego repoGuid i ominąć autoryzacji;

lista dozwolonych repo musi pochodzić z backendu/sesji/uprawnień, nie z ukrytego selecta na froncie.

Najpierw ustal, kto aktualnie może edytować dane wspólne. Jeśli repo nie ma systemu ról, zastosuj najmniejszy istniejący bezpieczny guard, np. zgodny z administratorem/allowlistą już używaną w CHAD. Nie wynajduj równoległego systemu uprawnień bez sprawdzenia dokumentacji.

1.5. Tworzenie początkowego knowledge

Utworzenie Folder Item knowledge ma być:

idempotentne;

poprzedzone sprawdzeniem, czy taki Item już istnieje;

bez duplikowania istniejącej struktury;

wykonane przez obowiązującą metodę DBA/Content Providera;

bez ręcznego INSERT-u do bazy, jeśli istnieje domenowa metoda create/find-or-create;

bez kasowania lub nadpisywania innych dzieci chad_shared.

Jeżeli knowledge już istnieje, użyj go.

Nie migruj automatycznie wszystkich statycznych przykładowych tekstów do realnych dokumentów bez potwierdzenia. Możesz utworzyć minimalną strukturę potrzebną do zachowania obecnego Verbal Game, ale najpierw sprawdź Story i rzeczywiste dane. Nie fabrykuj treści dokumentów.

1.6. Źródło prawdy i architektura

Docelowy przepływ:

Knowledge UI
→ cienki Dashboard API/server layer
→ packages/dba
→ cp_items / zatwierdzony provider
→ repo chad_shared
→ root knowledge

cp_items są źródłem menu, sekcji oraz dokumentów.

Nie:

trzymaj drugiej kopii struktury w komponencie;

dodawaj statycznego fallbacku udającego dane CP;

czytaj bezpośrednio PostgreSQL z komponentu lub route;

wywołuj surowego Content Providera bezpośrednio z Dashboardu;

przekazuj klientowi repoGuid, host path lub wewnętrzne loca, jeżeli nie są potrzebne;

omijaj DBA.

Jeżeli brakuje metod do pobrania drzewa lub zapisu dzieci, dodaj minimalne operacje do odpowiedniego interfejsu DBA zgodnie z aktualnym standardem. Preferuj pojedynczy celowany request pobierający potrzebne dzieci zamiast wielu requestów N+1, np. istniejący wzorzec IManyItemWorker / GetManyByNames, jeżeli rzeczywiście pasuje do aktualnego kodu.

1.7. Model widoku Knowledge

Menu główne:

Knowledge
[ VERBAL GAME ] [ KOLEJNA KATEGORIA ] ...

ma powstawać z dzieci knowledge.

Widok kategorii zachowuje aktualny układ ramek:

[ Nagłówek Folder Item ]
  Dokument Text Item
  Dokument Text Item

[ Kolejny nagłówek Folder Item ]
  Dokument Text Item

Dokument:

pokazuje nazwę;

pokazuje body Text Item;

wykorzystuje istniejący standard layoutu/edytora/podglądu, jeśli jest odpowiedni;

domyślnie jest tylko do odczytu w Knowledge;

edycja struktury i treści odbywa się przez Folders, nie przez tworzenie drugiego panelu CRUD w Knowledge.

Nie dodawaj wyszukiwarki, tagów, AI, ocen, favorites ani nowego edytora w tym zadaniu.

1.8. Cache i aktualizacja

Po dodaniu lub zmianie Itemu w Folders, Knowledge ma pokazać aktualną strukturę po ponownym wejściu/odświeżeniu.

Nie wprowadzaj trwałego statycznego cache bez invalidacji.

Jeżeli używasz Next cache, zapewnij właściwe no-store, revalidate albo kontrolowaną invalidację zgodną z aktualnym repo. Nie pozostawiaj sytuacji, w której nowy Folder Item istnieje w CP, ale kafelek nie pojawia się przez nieokreślony czas.

1.9. Zachowanie istniejącego frontendu

Aktualne pliki do sprawdzenia obejmują m.in.:

packages/dashboard/app/(dashboard)/dashboard/knowledge/page.tsx
packages/dashboard/app/(dashboard)/dashboard/knowledge/verbal-game/page.tsx
packages/dashboard/app/(dashboard)/dashboard/folders/
packages/dashboard/components/shared/dashboard-page-shell.tsx
packages/dashboard/components/shared/layout-tokens.ts

Aktualny frontend Knowledge ma statyczny kafelek VERBAL GAME, a strona Verbal Game statyczną tablicę GROUPS. Celem jest wymiana źródła danych, nie redesign.

Zachowaj:

DashboardPageShell;

obecny grid kafelków;

obecny grid sekcji;

LIST_ROW_WRAPPER_CLASS;

LIST_ROW_CLASS;

FRAME_SECTION_GAP_CLASS;

Back/Forw/up-level;

responsywność desktop/mobile.

Nie kopiuj tych klas do nowego równoległego systemu, jeśli można użyć aktualnych komponentów.

1.10. Testy

Dodaj testy regresyjne co najmniej dla:

knowledge bez dzieci → poprawny empty state;

dwa dzieci Folder Item pod knowledge → dwa kafelki menu;

Folder Item kategorii → ramka/nagłówek;

Text Item pod sekcją → dokument pod właściwym nagłówkiem;

zachowanie kolejności CP;

kliknięcie dokumentu → poprawne body;

brak statycznego GROUPS jako źródła;

nowy Item dodany w Folders → pojawia się w Knowledge;

dozwolony użytkownik może wybrać chad_shared;

niedozwolony użytkownik nie może wybrać/edytować chad_shared;

brak dostępu do prywatnego repo innego użytkownika;

arbitralny repoGuid/slug nie omija guardu;

path traversal i nieprawidłowe identyfikatory są blokowane;

brak dokumentu daje kontrolowane 404/empty, nie wyciek;

zwykły Folders dla własnego repo nadal działa;

istniejące inne widoki Dashboardu nie mają regresji.

Testowe mutacje wykonuj na kontrolowanej strukturze testowej, nie na realnych dokumentach użytkownika. Jeżeli test wymaga wspólnego repo, użyj jednoznacznego prefiksu fixture i usuń wyłącznie własne dane testowe po potwierdzeniu właściciela/identyfikatora.

1.11. Kryteria akceptacji

W chad_shared istnieje pojedynczy Folder Item knowledge.

Dzieci Folder Item knowledge automatycznie tworzą opcje menu Knowledge.

Nie ma statycznej listy kategorii jako źródła prawdy.

Folder Item w kategorii jest nagłówkiem w istniejącej ramce.

Text Item w sekcji jest dokumentem pod nagłówkiem.

Kliknięcie dokumentu pokazuje jego body.

Kolejność odpowiada kolejności dzieci CP.

Aktualny wygląd Knowledge pozostaje zasadniczo bez zmian.

Verbal Game działa na realnych cp_items.

Nową kategorię można dodać przez Folders bez zmiany kodu frontendowego.

W Folders można bezpiecznie wybrać chad_shared.

Tylko uprawniony użytkownik może modyfikować chad_shared.

Prywatne repo innych użytkowników pozostają zablokowane.

Dashboard/API nie omijają DBA.

Nie ma N+1, jeśli aktualna warstwa wspiera pobranie zbiorcze.

Loading, empty, error i not-found są rozróżnione.

Testy regresyjne przechodzą.

Lokalne środowisko Docker zostaje przebudowane i realnie sprawdzone.

Story i dokumentacja są zaktualizowane.

Wykonano commit; bez pushu i bez deployu TEST/PROD.

2. Zabezpieczenia przed podstawowymi błędami AI Codera

2.1. Minimalizacja tokenów bez pomijania wiedzy

Minimalizuj zużycie tokenów:

nie analizuj całego repo bez potrzeby;

nie wykonuj szerokiego audytu;

nie czytaj wielokrotnie tych samych dużych plików;

nie powtarzaj testów i analiz potwierdzonych w bieżącym Story;

używaj istniejącej dokumentacji, kodu i checklist;

ogranicz raporty pośrednie;

nie twórz dodatkowych diagramów ani ogromnych podsumowań;

nie pytaj o rutynowe zgody.

Nie oszczędzaj tokenów kosztem dokumentacji, bezpieczeństwa danych i testów.

2.2. Dokumentacja i standardy specjalizacji

Najpierw przeczytaj:

$repo_path/ai-docs/begin_here/01_ai_start.md
$repo_path/ai-docs/begin_here/02_what-and-where.md
$repo_path/ai-docs/begin_here/03_story-standard.md
$repo_path/ai-docs/begin_here/05_endpoint-rules.md

Następnie wyłącznie dokumentację dotyczącą:

Dashboard → Knowledge;

Dashboard → Folders;

DBA;

Content Providera;

cp_items;

repo context i uprawnień;

wspólnego repo chad_shared;

aktualnego Story tej funkcji;

lokalnego Docker workflow.

Nie zakładaj ai-docs/start_here/, README.md, CLAUDE.md ani AGENTS.md.

2.3. Nie zakładaj struktury systemu

Przed implementacją sprawdź:

aktualny HEAD;

realną strukturę chad_shared;

rzeczywisty repoGuid chad_shared;

czy knowledge już istnieje;

aktualny kształt cp_items;

typy Folder i Text;

źródło nazwy i body;

kolejność dzieci;

bieżące metody read/write DBA;

aktualne zabezpieczenie Folders;

realny model autoryzacji wspólnych repo.

Nie zgaduj i nie wykonuj ręcznych zmian danych na podstawie wyobrażonej struktury.

2.4. Celowana analiza aktualnego repozytorium

Przed zmianami:

git status --short
git log -5 --oneline

Sprawdź bieżące Story i tylko pliki bezpośrednio objęte zadaniem. Znajdź istniejące wzorce pobierania drzewa, tworzenia Itemów i bezpiecznego wyboru repo.

2.5. Najważniejsze testy regresyjne przed commitem

Naprawiany/implementowany flow musi mieć test regresyjny.

Uruchom:

testy jednostkowe nowego mappera drzewa;

testy DBA dla odczytu i utworzenia knowledge;

test API/autoryzacji;

test Folders selection;

test Knowledge menu/category/document;

cross-user/shared-repo isolation;

typecheck/lint/build Dashboard i DBA;

realny smoke na lokalnie uruchomionej aplikacji.

Jeżeli zmiana dotknie centralnych tabel, historii, outboxów albo system folders, uruchom również obowiązujący pakiet pnpm test:tables-sync. Nie uruchamiaj go mechanicznie, jeśli zakres go nie dotyka.

2.6. Bezpieczeństwo danych i migracji

nie używaj globalnego delete/drop/truncate;

nie czyść chad_shared;

nie nadpisuj istniejących dzieci;

przed mutacją sprawdź rzeczywisty stan;

utworzenie knowledge ma być idempotentne;

nie fabrykuj treści;

nie mutuj danych pawel_f, kamil_s ani innych prywatnych repo;

testowe dane zapisuj tylko w kontrolowanym zakresie;

nie wykonuj szerokiej migracji bez dry-run, backupu i rollbacku.

2.7. Architektura i DBA

Każda operacja biznesowa przechodzi przez:

Dashboard / API
→ packages/dba
→ właściwy provider
→ PostgreSQL / Content Provider model

Dashboard i route API są cienkimi adapterami. repoGuid nie może pochodzić z dowolnego query/body.

Nie omijaj DBA i nie umieszczaj surowych zapytań do cp_items w UI.

2.8. Izolacja użytkowników i shared repo

Odblokowanie chad_shared jest wyjątkiem kontrolowanym, nie usunięciem izolacji.

zwykły użytkownik nadal widzi wyłącznie własne repo;

uprawniony użytkownik może dodatkowo wybrać chad_shared;

dostęp read i write sprawdź oddzielnie, jeśli system to rozróżnia;

prywatne repo innych użytkowników pozostają niedostępne;

backend weryfikuje każdą operację niezależnie od UI;

nie polegaj na ukryciu opcji select jako zabezpieczeniu.

2.9. Git i równoległa praca

nie cofaj cudzych zmian;

nie używaj git reset --hard;

nie rób force-push;

nie commituj .env, dumpów, backupów, fixture runtime ani danych CP;

nie naprawiaj obcych problemów przy okazji;

commituj wyłącznie własny zakres.

Commit jest dozwolony. Push nie jest częścią zadania.

2.10. Deployment

Nie wykonuj deployu TEST ani PROD.

Nie zmieniaj shared infrastruktury, jeśli zadanie wymaga tylko kodu i kontrolowanego utworzenia Itemu.

2.11. Autonomia

Działaj samodzielnie. Nie zatrzymuj się po planie.

Zatrzymaj się tylko przy realnym ryzyku:

utraty danych;

niejasnym repoGuid lub source of truth;

braku bezpiecznego modelu uprawnień do chad_shared;

konflikcie z równoległą pracą;

szerokiej migracji danych;

potrzebie deployu PROD.

2.12. Uczciwość testów i raportu

Rozróżnij:

nieuruchomione
zablokowane
FAIL
PASS lokalnie
PASS w lokalnym Dockerze

Nie twierdź, że dynamiczne dane działają, jeśli sprawdzono tylko statyczny mock. Nie twierdź, że zapis do chad_shared działa, jeśli wykonano tylko test mappera.

Raport końcowy ma być krótki:

co zmieniono;

jaką realną strukturę utworzono lub zastano;

jakie testy wykonano;

wynik lokalnego rebuild/restart/smoke;

commit SHA;

prawdziwe blokady.

2.13. Wznowienie pracy

Jeżeli istniejące Story Knowledge zawiera część tej pracy:

Wznów od pierwszego niewykonanego kroku.
Nie powtarzaj potwierdzonych audytów i testów.
Najpierw przeczytaj Story, checklistę i ostatni raport.

Nie zakładaj nowego Story bez sprawdzenia aktualnego standardu i numeracji.

2.14. Obowiązkowe przebudowanie lokalnego środowiska

Po zmianach:

kod
→ testy
→ oficjalny rebuild lokalnego obrazu
→ restart lokalnych kontenerów
→ status/logi/healthcheck
→ realny smoke:
   Folders → chad_shared → knowledge
   Knowledge → kategoria → sekcja → dokument
→ commit

Najpierw przeczytaj ai-docs/bash-scripts/, następnie użyj aktualnych oficjalnych skryptów:

bash-scripts/dashboard/03_local_mac_docker/

Nie zastępuj ich ręcznym docker compose, jeśli zatwierdzony workflow istnieje.

2.15. Commit, push i dodatkowe raporty

wykonaj commit po PASS wymaganych testów;

nie wykonuj pushu;

nie wykonuj deployu TEST;

nie wykonuj deployu PROD;

nie generuj pełnego diffu;

nie twórz dodatkowych raportów poza aktualnym Story;

nie proś użytkownika o kolejne zadania w raporcie końcowym.
