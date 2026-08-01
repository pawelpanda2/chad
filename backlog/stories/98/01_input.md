# Story 98 — Input

## Input 1

Prompt dla Claude Code — Folders: naprawa Save w shared editorze + Copy drzewa cp-items

1. Opis konkretnego zadania użytkownika

Pracujesz w aktualnym repozytorium CHAD:

$repo_path

Zakres dotyczy podstrony:

packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx

oraz współdzielonego standardowego edytora:

packages/dashboard/components/shared/text-editor-with-toolbar.tsx

Wykonaj dwa powiązane zadania.

1.1. Regresja: zniknął przycisk Save

W Folders zniknął przycisk Save, mimo że zapis jest podstawową funkcją standardowego edytora współdzielonego w wielu miejscach.

Napraw przyczynę w komponencie wspólnym, a nie lokalnym obejściem w Folders.

Aktualny kod wymaga szczególnej weryfikacji:

Save jest renderowany tylko przy isEditorMode;

isEditorMode wynika z activeTab === "editor";

przy showPreview={false} komponent może nadal startować z activeTab="preview";

w takim stanie sam edytor jest widoczny, ale toolbar uznaje, że nie jest w trybie Editor, więc ukrywa Save, WCH i status Saved.

To jest prawdopodobna przyczyna, ale najpierw potwierdź ją w aktualnym HEAD i działającej aplikacji.

Wymagany standard komponentu:

showPreview=true
→ Preview/Editor działają normalnie;
→ Save jest widoczny w Editor.

showPreview=false
→ edytor jest jedynym możliwym trybem;
→ komponent logicznie traktuje go jako Editor;
→ Save, WCH i Saved działają normalnie.

Nie naprawiaj tego przez wymuszanie defaultTab="editor" tylko w jednym callerze. Komponent współdzielony ma sam zachowywać poprawną semantykę.

Dodaj test regresyjny komponentu potwierdzający, że przy:

showPreview={false}
showSave={true}

przycisk Save jest widoczny i wywołuje onSave.

1.2. Nowa funkcja Copy w Folders

Nad panelem body/config, w tym samym rzędzie co przełącznik Body / Config, dodaj:

[Body/Config] [combobox zakresu] [Copy]

Combobox ma zawierać dokładnie:

body l1
body l2
all l1

Znaczenie:

body l1

Dla aktualnie otwartego Folder pobierz wszystkich jego bezpośrednich dzieci — dokładnie jeden poziom — i skopiuj ich body w uporządkowanym JSON-ie.

body l2

Dla aktualnie otwartego Folder pobierz bezpośrednie dzieci oraz dzieci każdego bezpośredniego child folderu. Maksymalna głębokość względem aktualnego folderu wynosi 2. Nie pobieraj głębiej.

all l1

Dla wszystkich bezpośrednich dzieci aktualnego folderu skopiuj razem config + body. Maksymalna głębokość wynosi 1.

Funkcja jest przeznaczona do wklejania kontekstu do AI. Wynik musi być czytelny, deterministyczny i poprawnym JSON-em.

1.3. Ustalony format JSON

Nie twórz mapy indeks → sam tekst, ponieważ AI straci typ, nazwę i strukturę.

Użyj jednego stabilnego kontraktu:

{
  "source": {
    "address": "repoGuid/01",
    "name": "folder-name",
    "type": "Folder"
  },
  "mode": "body l1",
  "maxDepth": 1,
  "items": [
    {
      "index": "01",
      "address": "repoGuid/01/01",
      "name": "child-name",
      "type": "Text",
      "body": "..."
    },
    {
      "index": "02",
      "address": "repoGuid/01/02",
      "name": "child-folder",
      "type": "Folder",
      "body": "",
      "children": []
    }
  ]
}

Zasady wariantów:

body l1 i body l2 zawierają index, address, name, type, body, ale nie pełny config;

all l1 zawiera config i body;

children występuje przy body l2 dla child folderów;

kolejność zawsze zgodna z numerycznym indeksem CP;

brak dzieci oznacza [];

JSON formatuj przez JSON.stringify(result, null, 2);

do schowka trafia czysty JSON, bez markdown fences.

1.4. Zakres UI

Copy ma być oddzielnym przyciskiem obok comboboxa.

Podczas pobierania pokaż Copying... i zablokuj wielokrotne kliknięcie.

Po sukcesie pokaż krótki toast zawierający tryb i liczbę skopiowanych itemów.

Po błędzie pokaż prawdziwy komunikat, bez czyszczenia aktualnego edytora.

Copy jest read-only i nie wymaga odblokowania system folder.

Kontrolki działają tylko dla Folder.

Dla Text zastosuj spójny obecny wzorzec: disabled z tooltipem albo ukrycie.

Copy nie zależy od aktywnego trybu Body/Config.

Copy zawsze używa zapisanych danych backendu, nie lokalnych niezapisanych draftów. Tooltip: Copies saved data.

2. Zabezpieczenia przed podstawowymi błędami AI Codera

2.1. Minimalizacja tokenów bez pomijania wiedzy

Nie analizuj całego repo ani nie wykonuj szerokiego audytu.

Wznów z aktualnego Story dotyczącego Folders, jeżeli istnieje.

Wykorzystaj istniejące testy, route'y i operacje DBA.

Szczegóły zapisuj w Story, raport pośredni ogranicz do blockerów.

Nie pytaj o rutynowe zgody.

Nie pomijaj testu regresyjnego Save ani realnego smoke testu.

2.2. Dokumentacja i standardy według specjalizacji

Najpierw przeczytaj aktualny punkt wejścia:

$repo_path/ai-docs/begin_here/

Kolejność:

1. ai-docs/begin_here/
2. dokumenty wskazane przez punkt wejścia
3. dokumentacja cp-items / Folders / shared editor / DBA
4. bieżące Story i ostatni raport
5. kod

Sprawdź aktualny standard Story w:

ai-docs/begin_here/03_story-standard.md

Nie zakładaj README.md, CLAUDE.md, AGENTS.md ani starego start_here.

2.3. Nie zakładaj struktury systemu — sprawdź stan rzeczywisty

Przed kodem potwierdź:

aktualny HEAD;

aktualny JSX Folders;

rzeczywiste propsy i zachowanie TextEditorWithToolbar;

wszystkie aktualne miejsca użycia komponentu wspólnego;

aktualny format CpItem;

sposób wyliczania dzieci Folder;

aktualne operacje getItem / getChildren;

source of truth i provider używany lokalnie;

istniejące wzorce clipboard/toast.

Nie zakładaj, że brak Save wynika z ostatniej zmiany config editor, dopóki nie potwierdzisz tego kodem i reprodukcją.

2.4. Celowana analiza repo

Sprawdź co najmniej:

packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx
packages/dashboard/components/shared/text-editor-with-toolbar.tsx
packages/dashboard/components/shared/body-text-editor.tsx
packages/dashboard/app/api/folders/route.ts
packages/dashboard/app/api/folders/**
packages/dba/src/item-ops.ts
packages/dba/src/cp-model.ts
packages/dba/src/data-router-instance.ts

Znajdź wszystkie użycia:

TextEditorWithToolbar
navigator.clipboard
getChildrenOf

Nie zmieniaj publicznego kontraktu komponentu bez sprawdzenia regresji u wszystkich callerów.

2.5. Testy regresyjne przed commitem

Wymagane:

shared editor:

showPreview=true: Save tylko w Editor;

showPreview=false: Save widoczny od razu;

kliknięcie Save wywołuje onSave;

WCH i Saved działają w editor-only mode;

eksporter:

body l1 bez grandchildren;

body l2 z grandchildren, ale bez depth 3;

all l1 z config+body, bez grandchildren;

numeryczne sortowanie indeksów;

pusty folder → items: [];

poprawne typy/body;

brak cross-user danych;

route/API:

401 bez sesji;

403 obce repo/address;

400 nieobsługiwany mode;

404 brak folderu;

błąd, gdy root nie jest Folder;

poprawne limity głębokości;

build/typecheck zmienionych packages;

realny lokalny smoke test Save body, Save config, Body/Config toggle oraz wszystkie tryby Copy.

Każdy bug musi otrzymać test zabezpieczający.

2.6. Bezpieczeństwo danych

Copy jest read-only:

nie wykonuj żadnego zapisu;

nie mutuj realnych danych;

nie ujawniaj danych innego użytkownika;

repoGuid zawsze z sesji/repo context;

address/loca z klienta nie jest zaufanym źródłem autoryzacji;

nie zwracaj sekretów ani connection stringów.

Dodaj rozsądny serwerowy limit liczby eksportowanych itemów i wielkości odpowiedzi. Po przekroczeniu zwróć jawny EXPORT_LIMIT_EXCEEDED; nie obcinaj wyniku po cichu.

2.7. Architektura i DBA

Prawidłowy przepływ:

Folders UI
→ cienki route eksportu
→ packages/dba
→ właściwy provider
→ PostgreSQL

Nie wykonuj rekurencyjnej serii requestów z przeglądarki po jednym itemie.

Preferuj jedną operację eksportową po stronie serwera, wykorzystującą generyczne metody DBA:

getItemByAddress
getChildrenOf

Czystą logikę budowy eksportu umieść w testowalnym helperze, nie w dużym page.tsx.

2.8. Izolacja użytkowników

użytkownik z sesji;

repoGuid z repo context;

klient podaje tylko względne loca i dozwolony mode;

backend buduje pełny address;

każdy descendant musi pozostać w tym samym repo;

test cross-user obowiązkowy.

2.9. Git i równoległa praca

Przed zmianami:

git status --short
git log -5 --oneline

Nie cofaj cudzych zmian, nie używaj git reset --hard, force-push ani nie commituj .env, dumpów i artefaktów. Commity są dozwolone. Commit ma obejmować tylko ten zakres.

2.10. Deployment

Nie wdrażaj na PROD.

Zadanie wymaga lokalnego rebuild i smoke testu. TEST tylko po wyraźnym poleceniu użytkownika albo jeśli bieżące Story już to jednoznacznie zatwierdza. Używaj oficjalnych skryptów z ai-docs/bash-scripts/.

2.11. Autonomia

Działaj samodzielnie. Nie zatrzymuj się po planie. Zatrzymaj się wyłącznie przy realnym ryzyku utraty danych, konflikcie równoległej pracy, niejasnym source of truth albo zmianie architektury poza zakresem.

2.12. Uczciwość testów i raportu

Nie twierdź, że działa po samym buildzie. Rozróżnij:

nieuruchomione
zablokowane
FAIL
PASS lokalnie
PASS na TEST
PASS na PROD

2.13. Wznowienie pracy

Jeżeli zadanie kontynuuje aktualne Story Folders:

Wznów od pierwszego niewykonanego kroku.
Nie powtarzaj zakończonego audytu config editor.
Przeczytaj checklistę i ostatni raport.

2.14. Obowiązkowy rebuild lokalnego środowiska

Po zmianach:

kod → testy/build → oficjalny rebuild local Mac Docker → restart
→ status/logi/healthcheck → smoke test działającej aplikacji

Użyj aktualnych oficjalnych skryptów wskazanych w ai-docs/bash-scripts/, związanych obecnie z:

bash-scripts/dashboard/03_local_mac_docker/

Nie zastępuj ich ręcznym docker compose.

3. Szczegółowy zakres implementacji

3.1. Naprawa shared editora

Sugerowany kierunek semantyki:

const isEditorMode = !showPreview || activeTab === "editor";

Najpierw potwierdź w aktualnym kodzie.

Sprawdź także:

dynamiczną zmianę showPreview;

zachowanie defaultTab;

skrót zapisu w editor-only mode;

showSave=false nadal ukrywa Save;

saving blokuje podwójny zapis;

brak regresji we wszystkich callerach.

Zaktualizuj komentarze komponentu: showPreview=false oznacza stały logiczny Editor mode.

3.2. Endpoint eksportu

Dodaj cienki endpoint zgodny z aktualną strukturą, np.:

GET /api/folders/export?loca=<relative>&mode=body-l1

Dozwolone wartości transportowe:

body-l1
body-l2
all-l1

Endpoint:

pobiera użytkownika z sesji;

rozwiązuje repoGuid;

buduje bezpieczny address aktualnego folderu;

potwierdza typ Folder;

pobiera drzewo do jawnej głębokości;

buduje DTO;

zwraca obiekt eksportu oraz itemCount.

Nie koduj JSON-a drugi raz jako string, jeśli nie wymaga tego istniejący kontrakt. UI wykonuje jedno JSON.stringify(data.export, null, 2).

3.3. Helper drzewa

Wydziel testowalny helper podobny do:

buildFolderExport({ root, mode, getChildren, maxItems })

Wymogi:

brak nieograniczonej rekurencji;

jawna głębokość 1 albo 2;

stabilna kolejność;

nie mutuj pobranych CpItem;

unikaj N+1 tam, gdzie istnieje batch API;

folder body ma być jego zapisanym body, nie sztucznie podmienioną children mapą, chyba że aktualny kontrakt jednoznacznie mówi inaczej.

3.4. Clipboard

Użyj:

await navigator.clipboard.writeText(json)

Obsłuż odrzucenie permission/API. Nie używaj deprecated document.execCommand("copy"), chyba że repo ma zatwierdzony fallback.

Stany UI:

idle
copying
success
error

Nie przechowuj dużego eksportu w stanie React dłużej niż potrzeba.

3.5. Lokalizacja kontrolek

Kontrolki mają znaleźć się powyżej panelu edytora/listy folderu, obok aktualnego przełącznika:

[Body/Config] [body l1 ▼] [Copy]

Nie wkładaj Copy do wewnętrznego toolbaru CodeMirror, bo jest operacją na drzewie folderu, nie na bieżącym tekście. Na telefonie rząd ma się zawijać zgodnie z istniejącym responsive standardem.

4. Zakazy i granice

Nie:

naprawiaj Save lokalnym duplikatem przycisku;

twórz drugiego standardowego edytora;

zmieniaj Delete/Add;

kopiuj drzewa przez serię requestów z klienta;

dodawaj all l2;

dodawaj depth bez limitu;

kopiuj danych spoza repo użytkownika;

kopiuj niezapisanych draftów;

zapisuj eksportu do bazy lub pliku;

wdrażaj PROD;

rób dużego refaktoru Folders;

przywracaj legacy Content Provider.

5. Weryfikacja

W lokalnej aplikacji:

otwórz Text → Editor → sprawdź Save i wykonaj zapis;

otwórz Config w trybie bez Preview → Save widoczny od razu;

zapisz config i sprawdź refresh;

otwórz Folder;

body l1 → skopiuj → JSON.parse → brak grandchildren;

body l2 → children i grandchildren, brak depth 3;

all l1 → config+body, brak grandchildren;

sprawdź pusty Folder;

sprawdź indeksy 02 i 10;

sprawdź błąd clipboard;

sprawdź brak sesji i cross-user request;

sprawdź, że Copy niczego nie zmienia;

sprawdź desktop i telefon;

sprawdź inne miejsca używające shared editora.

6. Kryteria akceptacji

Save wrócił w Folders.

Przyczyna została naprawiona w shared editorze.

Editor-only mode pokazuje Save, WCH i Saved zgodnie z propsami.

Inne użycia edytora nie mają regresji.

Nad panelem jest combobox i Copy.

Combobox ma dokładnie body l1, body l2, all l1.

Wynik jest deterministycznym, poprawnym JSON-em.

Głębokości są przestrzegane.

all l1 zawiera config+body.

Copy używa zapisanych danych serwera i nie wykonuje mutacji.

Izolacja użytkowników działa.

Eksport ma jawny limit i błąd po przekroczeniu.

Test regresyjny Save oraz testy eksportu/API przechodzą.

Local Docker został przebudowany.

Realny smoke test przeszedł.

Commit obejmuje tylko zadanie.

PROD nie został dotknięty.

7. Krótki raport końcowy

Zmiana:
Przyczyna Save:
Testy:
Local Docker:
Smoke:
Commit:
Blockery:

Bez dużego diffu, listy wszystkich plików i zbędnych podsumowań.
