# Story 95 — Input

## Input 1

Prompt dla Claude Code — Folders: edycja Body / Config

1. Opis zadania użytkownika

Pracujesz w aktualnym repozytorium CHAD ($repo_path).

W podstronie:

packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx

dodaj przycisk Config bezpośrednio obok istniejącego Delete.

Przycisk ma przełączać aktualny widok itemu:

Body ↔ Config

Wymagania:

domyślnie aktywny jest obecny widok Body;

kliknięcie Config pokazuje edytowalny JSON currentItem.Config i zmienia napis przycisku na Body;

kliknięcie Body wraca do dotychczasowego widoku body i zmienia napis na Config;

Config ma tylko edytor i Save — bez zakładki Preview;

body zachowuje obecne Preview/Editor/Save;

funkcja działa dla Text i Folder;

dla Folder tryb Body nadal pokazuje listę dzieci, a nie edytowalne derived body;

body i config mają niezależne stany edycji;

samo przełączanie nie zapisuje i nie może gubić niezapisanych zmian;

zapis configu nie może zmieniać ani kasować body;

zapis body nie może zmieniać configu;

po nawigacji do innego itemu oba stany inicjalizują się danymi nowego itemu.

Najpierw sprawdź aktualny HEAD i rzeczywisty kod. Nie opieraj się wyłącznie na tym promptcie.

2. Zabezpieczenia przed podstawowymi błędami AI Codera

2.1. Minimalizacja tokenów bez pomijania wiedzy

Nie analizuj całego repo.

Czytaj tylko dokumentację i kod potrzebne dla Folders, edytora, route API i DBA CpItem.

Nie powtarzaj potwierdzonych audytów.

Szczegóły zapisuj w Story, nie w czacie.

Nie pytaj o rutynowe zgody.

Minimalizacja tokenów nie pozwala pominąć dokumentacji, testów ani realnego smoke testu.

2.2. Dokumentacja i specjalizacja

Najpierw przeczytaj:

$repo_path/ai-docs/begin_here/

Kolejność:

1. ai-docs/begin_here/
2. dokumenty wskazane przez punkt wejścia
3. dokumentacja cp-items / Folders / DBA
4. bieżące Story
5. kod

Sprawdź standard Story w:

ai-docs/begin_here/03_story-standard.md

Nie zgaduj numeru ani nazw plików Story.

2.3. Celowana analiza repo

Sprawdź co najmniej:

packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx
packages/dashboard/app/api/folders/route.ts
packages/dashboard/app/api/folders/**
packages/dashboard/components/shared/text-editor-with-toolbar.tsx
packages/dba/src/item-ops.ts
packages/dba/src/data-commands.ts
packages/dba/src/cp-model.ts
packages/dba/src/data-router-instance.ts

Odszukaj route'y używane obecnie do create, save body i delete.

Potwierdź:

format CpItem;

relację Config i Settings;

sposób przechowywania configu w aktualnym providerze PostgreSQL;

czy istnieje bezpieczna operacja aktualizacji configu;

które pola configu są systemowe;

jak działa read-only system folders;

czy zapis pełnego itemu zachowuje _id, address i body.

Nie przywracaj ani nie używaj packages/net-content-provider jako aktywnej zależności.

2.4. Testy regresyjne

Każdy nowy flow musi mieć test.

Sprawdź:

przełączanie Body/Config;

poprawny zapis configu;

błędny JSON;

ochronę pól systemowych;

zachowanie body po zapisie configu;

zachowanie configu po zapisie body;

nawigację między itemami;

read-only system folder;

cross-user isolation;

ponowny odczyt po zapisie.

Przed commitem wykonaj typecheck/build zmienionych packages, testy DBA, route API, komponentu/UI oraz realny smoke test lokalny. Sam typecheck nie wystarcza.

2.5. Bezpieczeństwo danych

Do mutacji testowych użyj wyłącznie przeznaczonego użytkownika testowego zgodnie z dokumentacją, np. test2 albo test3.

Nie mutuj pawel_f, kamil_s ani danych PROD.

Backend musi blokować:

zmianę repo;

cross-user address;

path traversal;

zmianę _id / config.id;

zmianę address;

utratę custom fields;

zapis częściowego configu kasujący resztę;

nadpisanie body podczas zapisu configu.

2.6. Architektura i DBA

Prawidłowy przepływ:

Folders UI
→ cienki Next.js route
→ packages/dba
→ provider
→ PostgreSQL

Nie zapisuj bezpośrednim SQL-em.

Jeżeli brak publicznej operacji DBA, dodaj małą generyczną operację, np.:

updateItemConfig(address, config)

Powinna:

pobrać istniejący item;

zachować body;

zweryfikować config;

zachować pola tożsamości;

zapisać pełny CpItem przez router DBA;

zwrócić zapisany item.

2.7. Izolacja użytkowników

użytkownik z sesji;

repoGuid nie jest zaufany z query/body;

address musi należeć do repo użytkownika;

cross-user update → 403;

walidacja serwerowa, nie tylko frontend.

2.8. Git i równoległa praca

Przed zmianami:

git status --short
git log -5 --oneline

Nie cofaj cudzych zmian, nie używaj git reset --hard, force-push ani nie commituj .env, dumpów i artefaktów. Commit może obejmować tylko to zadanie.

2.9. Deployment

Nie wdrażaj na PROD.

TEST tylko wtedy, gdy aktualne zasady Story albo użytkownik wyraźnie tego wymagają. Używaj oficjalnych skryptów z ai-docs/bash-scripts/.

2.10. Autonomia

Działaj samodzielnie. Zatrzymaj się tylko przy realnym ryzyku utraty danych, niejasnym source of truth, konflikcie równoległej pracy albo zmianie architektury poza zakresem.

2.11. Uczciwy raport

Rozróżnij PASS, FAIL, zablokowane, nieuruchomione. Nie raportuj działania po samym buildzie.

2.12. Wznowienie pracy

Jeżeli istnieje bieżące Story dotyczące Folders, wznów od pierwszego niewykonanego kroku. Nie zaczynaj audytu od nowa.

2.13. Obowiązkowy local Docker rebuild

Po zmianach:

kod → build/test → oficjalny rebuild obrazu → restart kontenera
→ status/logi/healthcheck → realny smoke test

Użyj aktualnych oficjalnych skryptów wskazanych przez ai-docs/bash-scripts/, obecnie związanych z:

bash-scripts/dashboard/03_local_mac_docker/

Nie zastępuj ich ręcznym docker compose.

3. Szczegółowy zakres implementacji

3.1. Przycisk

Dla Text i Folder:

Delete | Config

Po przełączeniu:

Delete | Body

Użyj jednego stanu:

type EditorMode = "body" | "config";

Nie duplikuj całego widoku.

3.2. Body

Dla Text zachowaj obecny TextEditorWithToolbar, Preview, Editor, Save, komunikaty i read-only protection.

Dla Folder zachowaj listę dzieci. Po powrocie z Config znów pokaż listę dzieci.

3.3. Config

ukryj body/listę dzieci;

pokaż sformatowany JSON: JSON.stringify(config, null, 2);

tylko Editor + Save, bez Preview;

zachowaj lokalny tekst przy błędzie;

Save disabled, gdy JSON niepoprawny, brak zmian, trwa zapis albo folder jest chroniony;

pokaż błąd parsera;

po sukcesie pokaż Saved.

Jeżeli rozszerzasz wspólny edytor np. o:

showPreview={false}

domyślna wartość musi zachować działanie innych stron.

3.4. Walidacja configu

Config musi być obiektem JSON, nie null, tablicą ani typem prostym.

Wymagane pola:

id
type
name
address

Backend ma wymagać, aby id i address były identyczne z istniejącym itemem.

Domyślnie blokuj również zmianę type, bo Text ↔ Folder może uszkodzić model body/children.

name może być edytowalne tylko wtedy, gdy aktualny DBA ma potwierdzony, bezpieczny kontrakt rename aktualizujący zależności. W przeciwnym razie zablokuj zmianę name i zapisz rename jako dalszą propozycję.

Zachowaj wszystkie custom fields.

3.5. API

Dodaj albo rozszerz cienki route, np.:

PUT /api/folders/config

Minimalny request:

{
  "loca": "01/02",
  "config": {}
}

Backend:

pobiera użytkownika z sesji;

buduje address w jego repo;

pobiera item przez DBA;

sprawdza istnienie;

sprawdza read-only protection i istniejący admin unlock;

waliduje config;

zachowuje body;

zapisuje przez DBA;

zwraca pełny zapisany item w formacie strony.

Statusy:

400 invalid config
401 no session
403 wrong repo / protected
404 item not found
409 forbidden identity/type/name change
500 provider error

3.6. Synchronizacja stanu

Po zapisie:

aktualizuj currentItem.Config;

aktualizuj currentItem.Settings;

zachowaj currentItem.Body;

zastąp bieżący wpis w nav.items, bez nowej pozycji historii;

ustaw tekst configu na dane zwrócone przez backend;

wyczyść dirty state;

po refreshu zapis ma pozostać.

Nie wykonuj fetchu, który może skasować niezapisane body.

3.7. Niezapisane zmiany

przełączanie zachowuje osobno draft body i draft config;

zapis jednego trybu nie zapisuje drugiego;

nawigacja inicjalizuje oba drafty nowym itemem;

zastosuj istniejący standard ostrzeżenia przed opuszczeniem dirty editora, jeżeli już istnieje; nie buduj nowego globalnego systemu.

4. Zakazy i granice

Nie:

zmieniaj działania Delete;

zmieniaj Add child;

omijaj DBA;

zapisuj raw SQL;

edytuj derived children map jako config;

dodawaj Preview do Config;

przywracaj legacy CP;

wykonuj dużego refaktoru;

wdrażaj PROD.

5. Weryfikacja

W realnej lokalnej aplikacji:

otwórz Text;

zmień body bez zapisu;

przełącz na Config;

zmień bezpieczne custom field i zapisz;

wróć do Body i potwierdź zachowanie draftu;

zapisz body;

odśwież i potwierdź oba zapisy;

wykonaj to samo dla Folder;

sprawdź błędny JSON;

sprawdź zmianę id/address/type/name;

sprawdź protected folder;

sprawdź cross-user request;

sprawdź Back/Forward.

6. Kryteria akceptacji

Config jest obok Delete.

Config ↔ Body działa dla Text i Folder.

Config pokazuje sformatowany JSON.

Config ma tylko Editor, bez Preview.

Poprawny config zapisuje się i pozostaje po refreshu.

Błędny JSON nie zapisuje się.

Pola tożsamości są chronione.

Body i config nie nadpisują się wzajemnie.

Drafty nie giną przy samym przełączaniu.

Zapis przechodzi przez API → DBA → provider.

Izolacja użytkowników i read-only protection działają.

Testy przechodzą.

Local Docker został przebudowany i funkcja sprawdzona.

Commit obejmuje tylko zadanie.

PROD nie został zmieniony.

7. Krótki raport końcowy

Zmiana:
Testy:
Local Docker:
Smoke:
Commit:
Blockery:

Bez dużego diffu i zbędnego podsumowania.
