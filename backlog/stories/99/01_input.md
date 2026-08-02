# Story 99 — Input

## Input 1

Prompt dla AI Codera — integracja msg workout z Beeper Conversations

1. Opis konkretnego zadania użytkownika

Pracujesz w aktualnym repozytorium CHAD:

$repo_path

Najpierw sprawdź aktualny HEAD, working tree, aktywne Story, strukturę ai-docs/ oraz bieżącą implementację Beeper → Conversations.

Nie zatrzymuj się na planie. Wykonaj analizę, implementację, testy, local runtime, TEST, dokumentację, commit i push. Nie wdrażaj PROD.

1.1. Cel

Połącz istniejące msg workout zapisane w repo użytkownika z konkretnymi wiadomościami wyświetlanymi w:

/dashboard/beeper → Conversations

Dany lead ma folder-item:

msg workout

a w nim text-itemy reprezentujące konkretne workouty wiadomości.

Każdy text-item msg workout ma zostać przypisany do dokładnie jednej wiadomości Beepera.

Pilot wykonaj najpierw na leadzie:

26-07-27_pn_Klaudia_delfin

Nie zakładaj ścieżki folderów. Najpierw znajdź rzeczywisty item leada oraz jego child item msg workout zgodnie z modelem Content Providera.

1.2. Kardynalność

Obowiązuje:

jeden msg workout → jedna wiadomość Beeper

Jeden workout nie może wskazywać wielu wiadomości.

Jedna wiadomość może mieć wiele różnych msg workout, jeśli kilka text-itemów rzeczywiście dotyczy tej samej wiadomości.

1.3. Zapis linku w config text-itemu

Po jednoznacznym dopasowaniu dodaj do config konkretnego text-itemu:

links:
  beeper:
    messageId: "..."
    timestamp: "2026-08-01T14:16:00Z"

Wymagania:

najpierw znajdź rzeczywiste stabilne pole identyfikujące wiadomość w aktualnym modelu, np. beeperMessageID, _id lub inne;

nie zgaduj nazwy pola;

messageId musi jednoznacznie i stabilnie wskazywać wiadomość;

timestamp zapisuj jako ISO 8601;

nie nadpisuj innych wpisów w links;

nie zmieniaj istniejącego links.beeper automatycznie;

zapis ma być idempotentny.

1.4. Reguły matchingu

Wykonuj dopasowanie etapami, od najbardziej pewnego.

Etap 1 — data i godzina w nazwie

Obsługiwany format:

26-08-01__14-16Z

Z oznacza UTC.

Jeżeli nazwa zawiera dzień i godzinę:

ogranicz kandydatów do tego leada;

porównaj timestampy;

zaakceptuj tolerancję maksymalnie:

±30 minut

linkuj automatycznie tylko przy jednym jednoznacznym kandydacie;

przy kilku kandydatach utwórz propozycję, nie wybieraj arbitralnie.

Etap 2 — tylko dzień w nazwie

Przykłady:

26-08-01
26-08-01b

Suffix b rozróżnia workouty, ale sam nie wskazuje czasu.

jeśli w danym dniu istnieje dokładnie jedna możliwa wiadomość, linkuj automatycznie;

jeśli istnieje kilka, przejdź do p1_you / p1_she;

jeśli nadal brak jednoznaczności, utwórz propozycję.

Przy nazwie zawierającej wyłącznie dzień strefa czasowa nie jest kluczowa. Użyj obowiązującej konwencji dat projektu.

Etap 3 — exact normalized p1_you / p1_she

Na początku body może znajdować się:

p1_you; bla bla bla

albo:

p1_she; bla bla bla

Znaczenie:

p1_you — wiadomość wysłana przez użytkownika;

p1_she — wiadomość wysłana przez drugą osobę.

Najpierw wykonaj exact normalized matching:

trim;

normalizacja końców linii;

normalizacja wielokrotnych spacji;

zachowanie tekstu i znaczenia;

obowiązkowe sprawdzenie kierunku wiadomości.

Jeżeli wynik jest jednoznaczny, linkuj automatycznie.

Etap 4 — fuzzy matching

Jeżeli exact matching nie działa:

wykonaj fuzzy matching;

uwzględnij tekst, kierunek, dzień, kolejność rozmowy, bliskość czasową i lead context;

fuzzy matching nigdy nie linkuje automatycznie;

fuzzy matching tworzy wyłącznie propozycję;

confidence musi wynikać z jawnych składników, a nie z jednej magicznej liczby.

1.5. Brak daty

Jeżeli nazwa text-itemu nie zawiera daty:

nie linkuj automatycznie;

pokaż go w kompaktowej sekcji:

Undated msg workouts

na górze prawego panelu w Conversations.

Sekcja:

widoczna tylko, gdy istnieją takie elementy;

bez zbędnych opisów;

pozwala otworzyć konkretny workout;

nie zasłania rozmowy;

nie tworzy dużej karty informacyjnej.

1.6. Propozycje dopasowania

Gdy nie można automatycznie i jednoznacznie powiązać wiadomości, zapisz propozycję w repo użytkownika.

Logiczna struktura itemów:

<repo użytkownika>/
└── links/
    └── msg workout/
        └── <nazwa leada>

Dla pilota:

links/msg workout/26-07-27_pn_Klaudia_delfin

Pamiętaj o rzeczywistym modelu Content Providera:

repo folder jest GUID-em;

fizyczne children są numeryczne;

nazwa itemu jest w config;

użyj DBA i metod CP;

nie twórz ręcznie fizycznych folderów o nazwie links.

Minimalny body YAML propozycji:

lead: "26-07-27_pn_Klaudia_delfin"
msgWorkoutItemId: "..."
msgWorkoutItemName: "26-08-01b"
status: "proposed"
analyzedAt: "2026-08-01T14:20:00Z"
reason:
  type: "ambiguous-time"
  summary: "Several Beeper messages matched the same day."
candidates:
  - messageId: "..."
    timestamp: "2026-08-01T14:16:00Z"
    direction: "she"
    confidence: 0.87
    reasons:
      - "same-day"
      - "p1_she fuzzy match"
      - "closest timestamp"

Wymagania:

zapisz powód;

zapisz kandydatów;

zapisz confidence i jego składniki;

nie zapisuj pełnych prywatnych rozmów, gdy wystarczy bezpieczny fragment lub hash;

proposal key musi być stabilny względem konkretnego workoutu;

przewidź statusy proposed, accepted, rejected, obsolete;

nie twórz duplikatów propozycji.

1.7. Analizuj tylko nowe workouty

Analizuj tylko te msg workout, które:

nie mają links.beeper;

nie były wcześniej przeanalizowane;

nie mają istniejącej propozycji;

nie mają statusu accepted/rejected/obsolete;

nie zostały ręcznie powiązane.

Ponowne uruchomienie:

nie tworzy drugiej propozycji;

nie nadpisuje ręcznego linku;

nie zmienia zaakceptowanej decyzji;

nie analizuje ponownie elementów bez potrzeby.

1.8. Integracja GUI

W Beeper → Conversations istnieje prawy pasek powiązany z wiadomościami.

Dla wiadomości posiadającej link do workoutu:

na wysokości tej wiadomości pokaż kompaktowy element:

msg workout

marker musi być przy właściwej wiadomości;

kliknięcie rozwija workout na pełną wysokość prawego paska;

zamknięcie przywraca zwykły widok;

nie otwieraj nowej strony;

zachowaj minimalistyczny styl;

przy kilku workoutach dla jednej wiadomości pokaż kompaktową listę;

nie pokazuj markera przy wiadomości bez linku.

GUI korzysta z zapisanego links.beeper. Nie uruchamiaj fuzzy matchingu podczas renderowania.

1.9. Backend

Prawidłowy przepływ:

Dashboard → API → packages/dba → Content Provider / Beeper Mongo

Źródła:

msg workout → repo użytkownika / Content Provider
wiadomości → beeper_<repoGuid> / MongoDB

Nie wolno:

odczytywać filesystemu z komponentu;

otwierać Mongo z komponentu;

omijać DBA;

przyjmować repoGuid z query/body;

zgadywać fizycznych ścieżek CP;

kopiować istniejących metod CP.

Jeżeli potrzebujesz operacji wielu itemów, najpierw sprawdź istniejące kontrakty IRepoService, IManyItemWorker / aktualne odpowiedniki i metody typu GetManyByNames. Wszystkie wywołania CP opakuj w packages/dba.

1.10. Dokumentacja

Utwórz nową specjalizację:

ai-docs/msg-workout/

Minimum:

ai-docs/msg-workout/
├── ai-start.md
├── architecture.md
├── beeper-linking.md
├── matching-rules.md
├── proposal-schema.md
├── gui-integration.md
└── tests.md

Nie twórz pustych plików.

Opisz dokładnie:

granice specjalizacji;

flow CP + Beeper Mongo;

schema links.beeper;

stabilny messageId;

exact/fuzzy matching;

tolerancję ±30 minut;

p1_you / p1_she;

proposal YAML;

idempotencję;

Undated;

integrację prawego panelu;

testy.

Zaktualizuj główny router dokumentacji i dokumentację gui-beeper, aby prowadziły do msg-workout.

1.11. Pilot

Najpierw wykonaj pełny pilot dla:

26-07-27_pn_Klaudia_delfin

Pilot ma potwierdzić:

znalezienie leada;

znalezienie msg workout;

listę text-itemów;

parsowanie nazw;

parsowanie body;

kierunek p1_you / p1_she;

odczyt wiadomości Beeper;

automatyczny link przy jednoznaczności;

proposal przy niejednoznaczności;

zapis links.beeper;

zapis proposal YAML;

brak duplikatów po rerun;

marker GUI przy właściwej wiadomości;

rozwinięcie panelu;

Undated.

Dopiero po PASS pilota uogólnij rozwiązanie na pozostałe leady bieżącego użytkownika.

2. Zabezpieczenia przed podstawowymi błędami AI Codera

2.1. Minimalizacja tokenów bez pomijania wiedzy

nie analizuj całego repo;

zacznij od aktywnego Story i właściwych specjalizacji;

czytaj tylko msg-workout, gui-beeper, DBA, CP i testy;

nie powtarzaj audytów;

nie czytaj tych samych dużych plików wielokrotnie;

zacznij od pilota Klaudia;

zapisuj szczegóły w Story;

nie twórz zbędnych raportów pośrednich;

nie pytaj o rutynowe zgody.

Minimalizacja nie oznacza zgadywania, pomijania dokumentacji, backupu, testów ani realnej weryfikacji.

2.2. Dokumentacja i standardy

Najpierw przeczytaj aktualne:

ai-docs/begin_here/
ai-docs/gui-beeper/
ai-docs/dba/ lub aktualny odpowiednik
ai-docs/databases/
ai-docs/tests/
human-docs/dashboard/beeper/

oraz aktualną dokumentację Content Providera i item modelu.

Nie zakładaj README.md, CLAUDE.md ani AGENTS.md, dopóki repo ich nie wskaże.

2.3. Celowana analiza repo

Przed zmianą:

git status --short
git log -5 --oneline

Sprawdź wyłącznie właściwe obszary:

packages/dashboard/.../beeper/**
packages/dashboard/app/api/beeper-crm/**
packages/dba/**
aktualny Content Provider package
plugins/beeper-synch/**
ai-docs/gui-beeper/**
human-docs/dashboard/beeper/**
backlog/stories/**

Potwierdź strukturę config/body i aktualne identyfikatory wiadomości.

2.4. Testy regresyjne przed commitem

Obowiązkowo:

typecheck/build DBA;

typecheck/build Dashboard;

parser nazw dat;

ISO timestamp;

±30 minut;

jedna wiadomość danego dnia;

wiele wiadomości danego dnia;

exact p1_you;

exact p1_she;

direction mismatch;

fuzzy proposal;

brak daty;

istniejący link;

istniejąca propozycja;

accepted/rejected proposal;

rerun idempotency;

CP write/read roundtrip;

Beeper lookup;

cross-user isolation;

marker GUI;

expanded panel;

Undated;

Local Mongo readonly;

Server Mongo;

local Docker;

local browser;

TEST.

Każdy znaleziony bug otrzymuje test. SKIPPED i BLOCKED nie są PASS.

2.5. Bezpieczeństwo danych

Przed zmianą configów realnego leada:

wykonaj backup konkretnych itemów;

przygotuj rollback;

nie wykonuj globalnego delete;

nie resetuj repo ani Mongo;

nie zmieniaj istniejącego ręcznego linku;

nie usuwaj propozycji;

nie nadpisuj nowszych danych starszymi;

pilot ogranicz do wskazanego leada;

nie loguj pełnych prywatnych wiadomości.

2.6. Architektura DBA

Zachowaj:

GUI → API → DBA → CP/Mongo

Każda nowa operacja ma mieć publiczny kontrakt/interfejs DBA.

Nie wolno bezpośredniego filesystem access, bezpośredniego Mongo access z Dashboardu, prywatnych cross-package importów ani ręcznego tworzenia numerowanych folderów.

2.7. Izolacja użytkowników

repoGuid wyłącznie z sesji/context;

Beeper DB beeper_<repoGuid>;

właściwe repo CP tego samego użytkownika;

brak fallbacku do pawel_f;

brak cross-user matchingu;

proposals zapisuj w repo tego samego użytkownika;

testuj izolację na throwaway repoGuid.

2.8. Git i równoległa praca

nie używaj git reset --hard;

nie rób force-push;

nie cofaj cudzych zmian;

przed edycją odczytaj aktualny plik;

nie commituj .env, logów, dumpów ani runtime;

ogranicz commit do Story;

commit i push są dozwolone;

przed commitem pobierz origin.

2.9. Deployment

Kolejność:

kod → testy → local Docker oficjalnym skryptem → local browser → TEST oficjalnym skryptem → TEST browser

Nie używaj ręcznego docker compose, jeśli istnieje oficjalny skrypt.

Nie wdrażaj PROD.

2.10. Autonomia

Nie zatrzymuj się na planie.

Wykonaj Story, dokumentację, analizę, pilot, implementację, testy, local runtime, TEST, commit i push.

Zatrzymaj się tylko przy realnym ryzyku utraty danych, braku rollbacku, konflikcie równoległej pracy, niejasnym source of truth, operacji destrukcyjnej albo PROD.

2.11. Uczciwość raportu

Nie raportuj sukcesu po samym znalezieniu itemów, fuzzy matchingu, typechecku, proposal, API bez GUI, GUI bez backendowego linku, pilocie bez rerun albo local bez TEST.

Rozróżniaj:

NOT RUN
BLOCKED
FAIL
PASS PILOT
PASS LOCAL
PASS TEST
PASS PROD

PROD ma pozostać NOT RUN.

2.12. Wznowienie pracy

Jeżeli istnieje aktywne Story:

Wznów od pierwszego niewykonanego kroku.
Nie twórz drugiego Story.
Najpierw przeczytaj 04_todos.md i 05_tasks_and_checklist.md.
Nie powtarzaj potwierdzonych audytów.

3. Plan implementacji

3.1. Story

Jeżeli brak aktywnego Story:

utwórz kolejne;

pełny input do 01_input.md;

plan do 02_plan.md;

wiedzę do 03_knowledge.md;

TODO do 04_todos.md;

checklistę do 05_tasks_and_checklist.md;

follow-upy do 06_others_from_report.md.

3.2. Moduły

Preferowany podział, dostosowany do aktualnej konwencji:

packages/dba/
  msg-workout-linking.ts
  msg-workout-proposals.ts

packages/dashboard/
  api/msg-workout/**
  components/beeper/msg-workout-marker.tsx
  components/beeper/msg-workout-panel.tsx
  components/beeper/undated-msg-workouts.tsx

Nie twórz monolitycznego pliku.

3.3. Jawny wynik matchingu

Matching engine ma zwracać jawny typ:

type MatchResult =
  | { type: "linked"; messageId: string; timestamp: string; reason: unknown }
  | { type: "proposal"; candidates: unknown[]; reason: unknown }
  | { type: "undated"; reason: unknown }
  | { type: "already-linked" }
  | { type: "already-analyzed" }
  | { type: "no-candidates" };

Nie używaj null do kilku różnych znaczeń.

3.4. Batch

Dodaj bezpieczne operacje:

analyze one lead
analyze new msg workouts for current user

Nie dodawaj globalnego all-users batch bez potrzeby.

3.5. GUI

GUI:

odczytuje zapisane linki;

odczytuje proposals i Undated;

pokazuje marker;

otwiera panel;

nie wykonuje matchingu podczas renderowania.

4. Zakazy

Nie wolno:

automatycznie linkować fuzzy;

wybierać arbitralnie wiadomości;

linkować bez stabilnego messageId;

opierać linku tylko na timestampie;

tworzyć duplikatów propozycji;

nadpisywać ręcznego linku;

analizować ponownie starych elementów bez potrzeby;

manipulować filesystemem CP;

pomijać DBA;

logować pełnych rozmów;

wdrażać PROD;

robić force-push/reset hard.

5. Kryteria akceptacji

Zadanie jest DONE dopiero, gdy:

istnieje ai-docs/msg-workout/;

schema links.beeper jest wdrożona;

pilot 26-07-27_pn_Klaudia_delfin przeszedł;

exact matching linkuje automatycznie;

fuzzy tworzy proposal;

brak daty trafia do Undated;

rerun nie tworzy duplikatów;

marker pojawia się przy właściwej wiadomości;

kliknięcie rozwija prawy panel;

logiczne links/msg workout/<lead> powstaje przez item model CP;

local i TEST działają;

commit i push wykonane;

PROD nie został wdrożony.

6. Raport końcowy

Podaj wyłącznie:

Story.

Użyty stabilny identyfikator wiadomości.

Schema links.beeper.

Wynik pilota 26-07-27_pn_Klaudia_delfin.

Liczba automatycznych linków.

Liczba propozycji.

Liczba Undated.

Wynik rerun idempotency.

Status GUI.

Testy.

Local.

TEST.

Commit SHA.

Push.

Blockery.

PROD: NOT RUN.
