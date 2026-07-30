# Story 94 — Input

## Input 1

Prompt dla AI Codera — Beeper: All → Conversations i widok split

1. Opis konkretnego zadania użytkownika

Pracujesz w aktualnym repozytorium CHAD:

$repo_path

Publiczne repo:

pawelpanda2/chad

Publiczny HEAD sprawdzony przy przygotowaniu promptu:

85a03d45dfdb08106b61129f363ef0fcc8fdff6b
feat(msg-auto): wire Message Creator to live Beeper CRM conversations; fix dark mode

Najpierw sprawdź lokalny git status, HEAD, aktywne Story i aktualne pliki. Lokalna wersja może być nowsza.

1.1. Cel

Przebuduj:

/dashboard/beeper

Obecne zakładki:

Permissions
All

zmień na:

Permissions
Conversations

Nie dodawaj trzeciej zakładki. Permissions ma pozostać funkcjonalnie bez zmian.

Po wejściu w Conversations ma pojawić się dwupanelowy ekran:

[ lista kontaktów ][ uchwyt ][ konwersacja ]

lewy panel: kontakty/rozmowy;

prawy panel: wybrana rozmowa;

pomiędzy nimi cienka pionowa belka;

na belce mały przycisk/„dzyndzel";

kliknięcie zwija lewą listę;

po zwinięciu widoczna jest prawie wyłącznie rozmowa;

kolejne kliknięcie rozwija listę;

uchwyt pozostaje dostępny po zwinięciu.

1.2. Wzorzec

Jako wzorzec układu przeanalizuj:

packages/dashboard/app/(dashboard)/dashboard/messages/page.tsx

czyli Manual Messages, ale nie kopiuj tej strony 1:1.

Sprawdź także:

packages/dashboard/app/(dashboard)/dashboard/beeper/page.tsx
packages/dashboard/app/(dashboard)/dashboard/beeper/[id]/**
packages/dashboard/components/shared/beeper-conversation-view.tsx
packages/dashboard/app/api/beeper-crm/**
packages/dba/src/beeper-crm.ts

Użyj istniejącego renderera rozmów i aktualnego Beeper CRM. Nie wracaj do starego filesystemowego /api/beeper/leads, jeśli bieżący model ma contacts/channels/messages.

1.3. Minimalistyczny wygląd — twarde wymagania

Nie dodawaj i usuń z nowego widoku:

Select a conversation
Select a lead from the list to view messages
WhatsApp conversation
Conversations — jako dodatkowy nagłówek panelu
licznik typu 153 contacts w nagłówku panelu
opisy działania
instrukcje
ikony pustego stanu
duże placeholdery
dodatkowe karty informacyjne

Gdy kontakt nie jest wybrany:

prawy panel ma być pusty

Bez tekstu, ikony i opisu.

Gdy rozmowa jest pusta, preferuj pustą przestrzeń. Błędy mogą być zgłaszane istniejącym toastem, ale nie stałą dużą kartą.

Nie dodawaj CardHeader nad rozmową. Nie pokazuj osobnego nagłówka z nazwą kontaktu, avatara ani nazwy sieci, chyba że są integralną częścią istniejącego renderera samych wiadomości.

1.4. Górna część strony

Zachowaj globalny DashboardPageShell, standardowy topbar i tytuł Beeper.

Układ ma być zwarty:

Beeper
[ Permissions ] [ Conversations ]
split view

minimalny odstęp pod zakładkami;

brak dodatkowego nagłówka Conversations;

brak dodatkowej sekcji przed split-view;

brak dużego margin-bottom;

brak wysokich paddingów;

nie zmieniaj globalnego sidebaru ani topbara;

nie dodawaj wyszukiwarki poza lewym panelem.

1.5. Lewy panel

Lista ma:

działać w tej samej podstronie;

nie otwierać /dashboard/beeper/[id] jako głównego zachowania;

wybierać kontakt i ładować rozmowę po prawej;

mieć własny pionowy scroll;

zajmować pełną dostępną wysokość;

mieć kompaktowe wiersze;

subtelnie zaznaczać aktywny kontakt;

nie przeładowywać całej strony;

nie resetować layoutu przy zmianie kontaktu.

Można zachować:

nazwa kontaktu
bardzo krótki podgląd ostatniej wiadomości
kompaktowe pole Search

Wyszukiwarka:

placeholder tylko Search;

bez nagłówka;

bez dużego CardHeader;

mały padding;

bez zbędnej przestrzeni.

Szerokość desktop:

około 280–360 px

Po zwinięciu:

0 px lub techniczne minimum

Nie używaj sztywnego lg:grid-cols-3, jeśli utrudnia collapse. Preferuj flex albo dynamiczny grid.

1.6. Separator i uchwyt

Dodaj cienki separator na pełną wysokość split-view.

Uchwyt:

mały;

wyśrodkowany pionowo;

bez tekstu;

ChevronLeft przy rozwiniętej liście;

ChevronRight przy zwiniętej;

dostępny klawiaturą;

aria-label="Collapse conversation list" albo Expand conversation list;

nie może wyglądać jak duży zwykły button;

nie potrzebuje drag-resize;

nie potrzebuje długiego tooltipa.

Dozwolona jest krótka subtelna animacja szerokości. Bez ciężkich animacji i migania.

1.7. Prawy panel

Użyj istniejącego:

BeeperConversationView

albo aktualnego wspólnego renderera, jeżeli nazwa się zmieniła.

Wymagania:

zajmuje resztę szerokości;

ma własny scroll;

rozmowa nie jest osadzona w kilku zagnieżdżonych kartach;

brak osobnego nagłówka;

brak opisów;

brak navigation do detail page;

po zwinięciu listy rozmowa rozszerza się;

zmiana kontaktu ładuje właściwe wiadomości;

brak Select a conversation.

Query param typu:

?view=conversations&contact=<id>

jest opcjonalny. Zastosuj go tylko, jeśli pasuje do aktualnej nawigacji i nie komplikuje zadania. Nie twórz nowej dynamicznej podstrony tylko dla split-view.

1.8. Dane i API

Prawidłowy flow:

UI
→ cienki API route
→ packages/dba
→ beeper_<repoGuid>

Nie wolno:

otwierać Mongo w komponencie;

otwierać Mongo bezpośrednio w route zamiast przez DBA;

brać repoGuid z query/body;

kopiować parsera rozmów;

kopiować permission logic;

pobierać wszystkich wiadomości wszystkich kontaktów naraz;

mieszać użytkowników.

Jeżeli brakuje endpointu rozmowy:

rozszerz istniejący endpoint lub dodaj cienki endpoint;

logikę odczytu umieść w DBA;

zwracaj tylko potrzebne dane;

zachowaj właściwą bazę per-user;

zachowaj Local Mongo readonly.

1.9. Permissions

Permissions musi nadal:

pokazywać Include/Exclude;

zachować filtr;

zachować Search;

zachować write guard w Local Mongo readonly;

działać po przełączaniu zakładek;

nie mieć regresji danych ani układu.

Zmiana All → Conversations nie może naruszyć kontraktu:

include=true  → pełny sync
exclude=true  → pominięcie
oba false     → metadata only

1.10. Responsive

Desktop jest priorytetem.

Na mobile/tablet:

nie pokazuj dwóch bezużytecznie wąskich paneli;

lista może zajmować cały ekran;

po wyborze kontaktu rozmowa może przejąć ekran;

mały uchwyt/back może przywrócić listę;

bez dodatkowych instrukcji i nagłówków;

nie psuj globalnego menu.

1.11. Oczekiwany rezultat

Po zakończeniu:

All nie istnieje jako nazwa zakładki;

jest Conversations;

po wejściu w nią widać listę i rozmowę;

kliknięcie kontaktu nie otwiera osobnej strony;

lista zwija się i rozwija;

po zwinięciu rozmowa zajmuje prawie całą szerokość;

brak wszystkich zakazanych napisów;

brak zbędnych przestrzeni;

używany jest istniejący renderer;

Local Mongo readonly nadal działa;

Server Mongo działa;

local i TEST zostały sprawdzone;

PROD nie został wdrożony.

2. Zabezpieczenia przed podstawowymi błędami AI Codera

2.1. Minimalizacja tokenów bez pomijania wiedzy

nie analizuj całego repo;

czytaj tylko bieżące Story, dokumentację gui-beeper, wskazane komponenty, API, DBA i testy;

nie czytaj tych samych dużych plików wiele razy;

nie twórz kilku wariantów layoutu;

nie przygotowuj dodatkowego mockupu HTML;

nie kopiuj całej strony Manual Messages;

nie wykonuj zbędnych podsumowań;

szczegóły zapisuj w Story;

nie pytaj o rutynowe zgody.

Minimalizacja nie oznacza pomijania dokumentacji, kodu, testów ani realnego browser smoke testu.

2.2. Dokumentacja i standardy

Najpierw przeczytaj aktualne:

ai-docs/begin_here/
ai-docs/gui-beeper/
ai-docs/tests/
human-docs/dashboard/beeper/

oraz aktywne Story związane z Beeperem.

Jeżeli reorganizacja dokumentacji zmieniła ścieżki, użyj faktycznego drzewa. Nie zakładaj automatycznie README.md, CLAUDE.md ani AGENTS.md.

2.3. Celowana analiza repo

Przed zmianą:

git status --short
git log -5 --oneline

Następnie sprawdź tylko:

beeper/page.tsx
beeper/[id]/**
messages/page.tsx
beeper-conversation-view.tsx
DashboardPageShell
layout-tokens
api/beeper-crm/**
dba/beeper-crm.ts
powiązane testy

Przed zapisaniem każdego współdzielonego pliku odczytaj aktualną wersję z dysku. Nie nadpisuj pracy równoległej sesji.

2.4. Testy regresyjne przed commitem

Obowiązkowo:

pnpm --filter dba typecheck
pnpm --filter dba build
npx tsc --noEmit -p packages/dashboard/tsconfig.json
pnpm --filter dashboard build

W realnym browserze sprawdź:

Permissions.

Nazwę Conversations.

Ładowanie listy.

Search.

Wybór kontaktu.

Rozmowę po prawej.

Brak navigation do detail page.

Collapse.

Expand.

Widoczny uchwyt.

Osobny scroll listy.

Osobny scroll rozmowy.

Pusty panel bez tekstu.

Brak Select a conversation.

Brak Select a lead....

Brak WhatsApp conversation.

Brak dodatkowego nagłówka Conversations.

Minimalny odstęp pod zakładkami.

Dark mode.

Desktop/tablet/mobile.

Server Mongo.

Local Mongo readonly.

Brak błędów 500.

Brak cross-user.

Dodaj testy dla labela, wyboru kontaktu, collapse/expand i pustego stanu. SKIPPED/BLOCKED nie jest PASS.

2.5. Bezpieczeństwo danych

To zadanie GUI:

nie migruj danych;

nie kasuj kontaktów;

nie zmieniaj Include/Exclude;

nie wykonuj drop, deleteMany({}), resetu Mongo ani wolumenów;

nie seeduj realnego użytkownika;

do mutacji używaj test3 albo throwaway repoGuid;

realne dane odczytuj tylko do smoke testu;

nie zapisuj prywatnych wiadomości w Story/logach.

2.6. Architektura DBA

Zachowaj:

Dashboard → API → DBA → Mongo

Nie duplikuj:

parsera rozmów;

rendererów;

metod pobierania kontaktów;

permission logic;

repo context.

Nową metodę DBA dodaj zgodnie z istniejącym interfejsem/eksportem.

2.7. Izolacja użytkowników

repoGuid wyłącznie z sesji/context;

baza beeper_<repoGuid>;

contact ID musi być sprawdzany w bazie bieżącego użytkownika;

brak fallbacku do pawel_f;

brak wspólnej bazy beeper;

Local i Server Mongo zachowują ten sam context;

testuj izolację, jeśli zmieniasz DBA/API.

2.8. Git i równoległa praca

nie używaj git reset --hard;

nie rób force-push;

nie cofaj cudzych zmian;

nie nadpisuj nieodczytanego pliku;

nie commituj .env, runtime, logów, screenshotów ani artefaktów;

ogranicz commit do Beeper GUI/API/DBA/testów/docs;

przed commitem pobierz origin;

commit i push są dozwolone.

2.9. Deployment

Kolejność:

kod
→ testy
→ local Docker oficjalnym skryptem
→ browser smoke test
→ TEST oficjalnym skryptem
→ browser smoke test TEST

Nie używaj ręcznego docker compose, jeśli istnieją oficjalne skrypty.

Dla TEST potwierdź aktualny standard; wcześniej był:

bash-scripts/dashboard/08_registry_test/deploy.sh

Dashboard się zmienia, więc TEST deploy jest wymagany. PROD — bez zgody nie wolno.

2.10. Autonomia

Nie kończ na planie ani typechecku. Wykonaj:

Story;

implementację;

testy;

local deploy;

local browser;

TEST deploy;

TEST browser;

dokumentację;

commit;

push.

Zatrzymaj się tylko przy ryzyku danych, konflikcie równoległej pracy, destrukcyjnej operacji, niejasnym source of truth albo PROD.

2.11. Uczciwość raportu

Nie raportuj sukcesu po samym:

rename labela;

buildzie;

screenshotcie;

teście listy bez rozmowy;

teście rozmowy bez collapse;

local bez TEST;

Server bez Local readonly.

Rozróżniaj:

NOT RUN
BLOCKED
FAIL
PASS LOCAL
PASS TEST
PASS PROD

PROD ma pozostać NOT RUN.

2.12. Wznowienie pracy

Jeżeli istnieje aktywne Story:

Wznów od pierwszego niewykonanego kroku.
Nie twórz drugiego Story.
Przeczytaj 04_todos.md i 05_tasks_and_checklist.md.
Nie powtarzaj potwierdzonych audytów.

Jeśli równoległa sesja zmieniła beeper/page.tsx, scal zmiany zamiast nadpisywać.

3. Plan implementacji

3.1. Story

Jeżeli brak aktywnego Story:

utwórz kolejne;

prompt do 01_input.md;

plan do 02_plan.md;

wiedza do 03_knowledge.md;

TODO do 04_todos.md;

checklista do 05_tasks_and_checklist.md;

follow-upy do 06_others_from_report.md.

3.2. Komponenty

Nie utrzymuj całego widoku w jednym ogromnym pliku. Preferuj rozsądny podział:

beeper-permissions-view.tsx
beeper-conversations-view.tsx
beeper-conversation-list.tsx
beeper-split-handle.tsx

Nie twórz kilkunastu mikrokomponentów.

3.3. Stan

Minimalny stan:

view
query
contacts
selectedContactId
isListCollapsed
loadingContacts
loadingConversation
conversation
error

3.4. Layout

Preferowany model:

<div className="flex min-h-0 flex-1 overflow-hidden">
  <aside className={collapsed ? "w-0" : "w-[320px]"} />
  <SplitHandle />
  <section className="min-w-0 flex-1 overflow-hidden" />
</div>

Dostosuj go do aktualnego DashboardPageShell. Nie dopuść, aby zamiast paneli scrollowała cała strona.

3.5. Empty state

Bez wybranego kontaktu:

<div className="h-full" />

Bez tekstu.

3.6. Accessibility

kontakt jako button;

aktywny przez aria-selected/aria-current;

handle jako button;

prawidłowy aria-label;

focus-visible;

Enter/Space;

uchwyt dostępny po zwinięciu.

4. Zakazy

Nie wolno:

zostawić labela All;

dodać Conversations obok All;

otwierać detail page jako główne zachowanie;

wyświetlać zakazanych napisów;

dodawać nagłówka Conversations;

kopiować całego Manual Messages;

używać starego API leadów bez uzasadnienia;

duplikować renderer;

dodawać dużych paddingów;

zmieniać Permissions bez potrzeby;

migrować danych;

wdrażać PROD;

robić force-push/reset hard.

5. Kryteria akceptacji

Zadanie jest DONE dopiero, gdy:

zakładka nazywa się Conversations;

działa split-view;

lista wybiera rozmowę bez navigation;

collapse i expand działają;

uchwyt pozostaje widoczny;

rozmowa rozszerza się po collapse;

brak wszystkich zakazanych napisów;

brak zbędnych przestrzeni;

istniejący renderer jest użyty;

Permissions nie ma regresji;

Server i Local readonly działają;

local i TEST przeszły realny browser test;

commit i push są wykonane;

PROD nie został wdrożony.

6. Raport końcowy

Podaj wyłącznie:

Story.

Główne pliki.

All → Conversations.

Split-view.

Collapse/expand.

Potwierdzenie braku zakazanych napisów.

Testy.

Local Docker/browser.

TEST deploy/browser.

Commit SHA.

Push.

Blockery.

PROD: NOT RUN.
