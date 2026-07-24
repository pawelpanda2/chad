# Story 82 — Input

## Input 1

Prompt dla Claude Code — Folders / cp-gui: tworzenie itemów i edycja Text

Pracujesz w repozytorium CHAD:

$repo_path

Tryb zadania

Implementacja naprawcza. Działaj samodzielnie: przeanalizuj aktualny kod, utwórz kolejne Story zgodnie z obowiązującym standardem, zaimplementuj rozwiązanie, wykonaj właściwe testy, zrób commit i możesz wdrożyć na TEST. Nie wdrażaj na PROD.

Punkt startowy i minimalizacja tokenów

Najpierw odczytaj aktualny punkt wejścia dokumentacji wskazany przez repozytorium. Sprawdź rzeczywistą bieżącą strukturę ai-docs; nie zakładaj bez weryfikacji istnienia README.md, CLAUDE.md, AGENTS.md ani konkretnej nazwy pliku startowego.

Następnie przeczytaj tylko dokumentację potrzebną do:

Content Providera i jego migracji z legacy .NET/Blazor do TypeScript;

warstwy DBA i wspólnego modelu CpItem;

cp-gui;

strony Dashboard Folders;

standardu Story;

zasad TEST deploymentu.

Nie wykonuj szerokiego audytu monorepo. Nie twórz dodatkowych podsumowań, dużych diffów ani list plików w czacie. Szczegóły zapisuj w Story.

Cel użytkownika

W zakładce/page:

packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx

należy uruchomić pełną obsługę zapisu, która obecnie jest celowo wyłączona:

dodawanie nowego child itemu typu Text;

dodawanie nowego child itemu typu Folder;

edycja body aktualnie otwartego itemu typu Text;

zapis zmienionego body;

poprawne odświeżenie GUI po utworzeniu lub zapisie;

zachowanie izolacji użytkowników i przejście wszystkich operacji biznesowych przez DBA.

To nie jest wyłącznie zmiana wizualna. Obecnie Add, wybór typu, nazwa oraz edytor są disabled, a istniejąca strona używa tylko GET /api/folders.

Obowiązkowe miejsca do analizy

Zacznij od tych aktualnie znanych plików, ale zweryfikuj ich stan w bieżącym branchu:

packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx
packages/dashboard/app/api/folders/route.ts
packages/dashboard/app/api/folders/repos/route.ts

packages/cp-gui/README.md
packages/cp-gui/src/components/ContentProviderBrowser.tsx
packages/cp-gui/src/components/FolderView.tsx
packages/cp-gui/src/components/TextView.tsx
packages/cp-gui/src/adapters/backend-adapter.ts

packages/dba/src/item-ops.ts
packages/dba/src/data-router-instance.ts
packages/dba/src/data-commands.ts
packages/dba/src/cp-model.ts

human-docs/dba/post-parent-item.md
human-docs/features/folders-features.md
human-docs/content-provider/next-tasks/typescript-migration-plan.md
backlog/stories/57/
backlog/stories/60/
backlog/stories/68/

Znane istniejące operacje DBA:

createOrGetChild(parent, name, type, body?)
putItemBody(address, body)
getItemByAddress(address)
getChildrenOf(parentAddress)

Nie omijaj ich bez mocnego powodu. Nie twórz bezpośrednich zapisów do MongoDB ani bezpośrednich wywołań legacy CP z Dashboardu.

Legacy Blazor jako referencja zachowania

Projekt jest w trakcie migracji z Blazor. Odszukaj w aktualnym repo rzeczywistą lokalizację starego frontendu i przeczytaj odpowiedniki:

Repos.razor
FolderView.razor
TextView.razor

Nie kopiuj mechanicznie starej architektury ani błędów Blazor. Użyj jej jako referencji dla:

układu i znaczenia formularza Add;

dostępnych typów;

sposobu przekazania parent loca/address;

zachowania po utworzeniu itemu;

edycji i zapisu body;

walidacji nazwy;

komunikatów błędów.

Jeżeli legacy Blazor nie istnieje już w bieżącym branchu, użyj historii Git lub dokumentacji Story 57 jako źródła referencyjnego. Nie zgaduj zachowania.

Wymagana architektura

Przepływ ma pozostać:

Folders UI
→ cienki Next.js API route
→ publiczna operacja/interfejs DBA
→ DbaDataRouter
→ aktywny provider / follower zgodnie z konfiguracją

Zasady:

jedna operacja biznesowa musi być dostępna przez warstwę DBA;

operuj na wspólnym CpItem;

nie importuj providera Mongo/CP bezpośrednio w Dashboardzie;

nie duplikuj logiki routingu flag;

repoGuid pochodzi wyłącznie z uwierzytelnionej sesji/repo context;

nie ufaj repoGuid, parent address ani item address przesłanym przez klienta;

backend musi potwierdzić, że parent/item należy do repo użytkownika;

nie wolno umożliwić zapisu do repo innego użytkownika;

zachowaj idempotencję createOrGetChild, ale GUI musi jasno obsłużyć przypadek istniejącej nazwy.

API

Rozszerz istniejący endpoint lub utwórz cienkie, logiczne route’y dla:

Create child

Dane wejściowe minimalnie:

parent loca/address
type: Text | Folder
name
opcjonalne początkowe body dla Text

Backend:

pobiera użytkownika z sesji;

wylicza bezpieczny pełny address wewnątrz user.repoGuid;

pobiera parent przez DBA;

potwierdza, że parent istnieje i ma typ Folder;

waliduje name i type;

wywołuje createOrGetChild;

zwraca utworzony/istniejący CpItem oraz zaktualizowaną reprezentację parenta lub dane pozwalające odświeżyć widok.

Update Text body

Dane wejściowe minimalnie:

loca/address
body

Backend:

rozwiązuje repo z sesji;

buduje/normalizuje address wewnątrz repo użytkownika;

pobiera item przez DBA;

potwierdza, że istnieje i ma typ Text;

wywołuje putItemBody;

zwraca zapisany CpItem.

Użyj poprawnych metod HTTP (POST dla tworzenia, PUT/PATCH dla aktualizacji). Zwracaj spójne statusy i komunikaty: 400, 401, 403, 404, 409 lub 500 zależnie od przypadku.

GUI — tworzenie

Usuń disabled tylko tam, gdzie funkcja rzeczywiście działa.

Dla aktualnego itemu typu Folder:

aktywny przycisk Add;

aktywny wybór Text / Folder;

aktywne pole nazwy;

Ref nie może być dodany bez potwierdzenia aktualnego kontraktu i dokumentacji — domyślnie nie wdrażaj Ref;

nazwa musi być przycięta i nie może być pusta;

podczas requestu blokuj podwójne kliknięcie;

pokaż błąd z backendu;

po sukcesie wyczyść nazwę;

odśwież listę dzieci parent folderu;

najlepiej przejdź do nowo utworzonego itemu albo zachowaj zachowanie legacy, jeśli jest jednoznaczne;

historia Back/Forward nie może zostać uszkodzona.

Sprawdź również widoczny formularz Add w sekcji Text. Jeżeli w Blazor oznacza on tworzenie siblinga, nawigację Up/Down lub inną operację, odwzoruj to poprawnie. Nie pozostawiaj mylącego selecta Text -> Up, Folder -> Down wynikającego z niedokończonego portu. Jeżeli nie ma bezpiecznej i potwierdzonej semantyki, formularz tworzenia child powinien być dostępny tylko dla Folder.

GUI — edytor i zapis

Dla itemu Text:

Textarea ma być aktywny;

stan edytora musi aktualizować się po zmianie aktualnego itemu;

dodaj aktywny i jednoznaczny przycisk Save;

przycisk Save ma być disabled, gdy nic się nie zmieniło albo trwa zapis;

nie nadpisuj lokalnej niezapisanej treści przez przypadkowy rerender;

po sukcesie zsynchronizuj currentItem.Body, editorBody i wpis w historii nav.items;

po błędzie pozostaw treść użytkownika w edytorze;

pokaż stan zapisu i błąd;

przełączanie Preview/Editor ma pokazywać aktualną lokalną treść; po zapisie także dane zwrócone przez backend;

rozważ ostrzeżenie przed zmianą itemu przy niezapisanych zmianach, ale nie rozbudowuj zadania nadmiernie. Minimum: nie gub zmian wskutek automatycznego odświeżenia.

Nie implementuj edycji body dla Folder, ponieważ jego widoczny Body jest obecnie wyliczaną mapą dzieci, a nie własnym edytowalnym body.

cp-gui jako wspólna implementacja

Dokumentacja packages/cp-gui/README.md mówi, że cp-gui ma być jedną implementacją używaną samodzielnie i wewnątrz Dashboard Folders. Sprawdź, czy obecna strona Dashboard nadal duplikuje komponenty cp-gui.

Preferowany rezultat:

logika widoków i write API kontraktów znajduje się w packages/cp-gui;

Dashboard używa/reużywa tych komponentów lub cienkiego adaptera;

nie utrzymuj dwóch rozbieżnych implementacji FolderView / TextView.

Jednak nie rób dużej przebudowy niezwiązanej z zadaniem. Jeżeli pełne przełączenie Dashboardu na cp-gui jest obecnie ryzykowne, najpierw uruchom poprawne write flow w istniejącej stronie i zapisz dalszą konsolidację w 06_propositions.md. Nie wolno blokować naprawy przez nadmierny refactor.

Jeżeli używasz BackendAdapter, zaimplementuj realne:

postParentItem(...)
put(...)

zamiast pozostawionych wyjątków Stage 3, ale podłącz je do bezpiecznej warstwy API Dashboard/DBA, nie bezpośrednio do providera.

Walidacja i przypadki brzegowe

Obsłuż co najmniej:

pusta nazwa;

nazwa zawierająca /, \, .. albo próbę wyjścia poza parent;

nieobsługiwany typ;

parent nie istnieje;

parent nie jest Folder;

item do zapisu nie istnieje;

próba edycji Folder;

podwójne kliknięcie Add/Save;

istniejący child o tej samej nazwie;

backend/provider niedostępny;

request użytkownika A do adresu repo użytkownika B;

poprawne odświeżenie children map po utworzeniu;

zachowanie polskich znaków i wieloliniowego body.

Nie zmieniaj przy okazji zachowania przycisków wymagających cp-plugin (Folder, Content, Config, Terminal) poza zakresem potrzebnym do tej naprawy.

Testy

Wymagane minimum:

testy jednostkowe/integrowane DBA dla:

utworzenia Text;

utworzenia Folder;

find-or-create przy tej samej nazwie;

aktualizacji body;

odrzucenia zapisu nieistniejącego itemu;

testy API route:

brak sesji;

poprawny create;

poprawny update;

walidacja typu/nazwy;

izolacja repo;

próba edycji Folder;

typecheck/build:

packages/dba;

packages/cp-gui, jeżeli zmieniony;

packages/dashboard;

realny test przeglądarkowy lokalnie:

otwórz Folders;

wejdź do Folder;

utwórz Text;

wróć/odśwież i potwierdź obecność;

otwórz Text;

zmień kilka linii body;

zapisz;

odśwież stronę i potwierdź trwałość;

utwórz Folder i potwierdź możliwość wejścia do niego;

sprawdź Back/Forward;

po wdrożeniu na TEST wykonaj ten sam krótki smoke test.

Nie uznawaj samego typechecku za potwierdzenie działania zapisu.

Story, Git i deployment

Utwórz kolejne Story zgodnie z aktualnym standardem repo.

Zachowaj pełny input, plan, wiedzę, checklistę, raport i przyszłe propozycje w odpowiednich plikach.

04_todos.md / aktualna checklista ma być wyczyszczona lub oznaczona jako ukończona zgodnie ze standardem.

Nie modyfikuj obcych, niezwiązanych zmian.

Możesz swobodnie wykonać commit obejmujący wyłącznie to zadanie.

Możesz pushować commit i wdrożyć na środowisko TEST istniejącym skryptem repozytorium.

Po TEST sprawdź status, logi i wykonaj browser smoke test.

Nie wdrażaj na PROD i nie zmieniaj PROD.

Nie używaj force-push, git reset --hard, ręcznych obejść deploymentu ani nie commituj sekretów.

Kryteria akceptacji

Zadanie jest ukończone dopiero, gdy:

w Folders można dodać child Text;

w Folders można dodać child Folder;

nowy item jest widoczny bez ręcznego obchodzenia błędu;

item pozostaje po refreshu;

body Text można edytować i zapisać;

zapisane body pozostaje po refreshu;

Folder body nie jest edytowalne;

wszystkie zapisy przechodzą przez API → DBA → router;

izolacja repo jest egzekwowana po stronie serwera;

testy i build przechodzą;

funkcja działa lokalnie i na TEST;

PROD nie został dotknięty.

Na końcu podaj użytkownikowi tylko krótki status: commit, TEST, wynik smoke testu i ewentualny realny blocker. Nie generuj dodatkowych obszernych podsumowań w czacie.
