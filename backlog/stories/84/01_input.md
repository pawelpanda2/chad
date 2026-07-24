# Story 84 — Message Creator GUI (Claude16_creator)

## Input 1

Prompt dla Claude Code — Claude16_creator

Tryb zadania

PLAN ONLY / STORY PLANNING.

Masz przygotować pełne Story i szczegółowy plan wdrożenia nowego GUI kreatora wiadomości w CHAD. Nie implementuj kodu, nie twórz promptów OpenAI, nie wykonuj deployu. Po zapisaniu dokumentacji Story zatrzymaj się i poczekaj na akceptację planu.

Pracujesz w aktualnym lokalnym repozytorium CHAD pod:

$repo_path

1. Obowiązkowy punkt startowy

Najpierw przeczytaj, w tej kolejności:

$repo_path/ai-docs/begin_here/01_ai_start.md
$repo_path/ai-docs/begin_here/02_what-and-where.md
$repo_path/ai-docs/begin_here/03_story-standard.md
$repo_path/ai-docs/begin_here/05_endpoint-rules.md

Uwaga: aktualny punkt wejścia repo to ai-docs/begin_here/, nie starsze ai-docs/start_here/. Nie zgaduj ścieżek na podstawie starych Story lub dokumentów historycznych.

Następnie przeczytaj wyłącznie dokumentację potrzebną do tego Story:

$repo_path/human-docs/dashboard/common/features/responsive-layout-standard.md
$repo_path/human-docs/dashboard/common/features/shared-text-editor-toolbar.md
$repo_path/human-docs/dashboard/common/features/chad-user-data-isolation.md
$repo_path/human-docs/dashboard/leads/features/msg-workouts.md
$repo_path/human-docs/dashboard/leads/features/msg-workout-details.md
$repo_path/human-docs/features/messages-cp-conversations.md
$repo_path/human-docs/console/features/openai-prepared-prompt.md
$repo_path/human-docs/dba/features/msg-workout-new.md

Jeżeli któraś ścieżka została przeniesiona, znajdź jej aktualny odpowiednik przez celowane wyszukanie. Nie czytaj całej dokumentacji i nie wykonuj szerokiego audytu repo.

2. Utworzenie Story — zanim zaczniesz analizować kod

Zgodnie z 03_story-standard.md:

sprawdź najwyższy numer w $repo_path/backlog/stories/;

utwórz kolejny folder numeryczny;

utwórz wymagane pliki:

01_input.md
02_plan.md
03_knowledge.md
04_todos.md
05_tasks_and_checklist.md
06_others_from_report.md   # tylko jeśli rzeczywiście potrzebny

Do 01_input.md wpisz pełną treść sekcji „Wymagania użytkownika” z tego promptu, bez skracania i bez przepisywania własnymi słowami.

Ponieważ to etap planowania:

02_plan.md ma zawierać kompletny plan do zatwierdzenia;

03_knowledge.md ma zawierać tylko celowane odnośniki do faktycznie przeczytanych dokumentów i kodu wraz z krótkim uzasadnieniem;

04_todos.md pozostaw pusty, jeśli nie pojawią się rzeczywiście odłożone kwestie;

05_tasks_and_checklist.md jest obowiązkowy: przygotuj funkcjonalne taski, ustaw Ai Status na NOT DONE, pozostaw Real Status pusty i dodaj opis każdego tasku;

nie rozpoczynaj implementacji po stworzeniu Story.

3. Cel produktu

Zaprojektuj GUI i workflow kreatora wiadomości, który łączy w jednym miejscu:

realną rozmowę z Beepera;

kontekst podejścia;

moje propozycje wiadomości;

znalezione raporty;

analizy i propozycje AI według wybranej szkoły/mentora;

zapis kolejnych wyników jako dokumentów powiązanych z msg workout.

To ma być rozwinięcie istniejących mechanizmów CHAD, a nie drugi niezależny system.

4. Wymagania użytkownika

4.1. Integracja z Beeper

Rozmowa ma być osadzona bezpośrednio w kreatorze CHAD.

Użytkownik nie może ręcznie wklejać historii rozmowy.

Kreator ma pobierać właściwą rozmowę dla aktualnego leada.

Na desktopie rozmowa i panel kreatora/AI mają być widoczne obok siebie.

Na mobile układ może być sekwencyjny/stacked, ale musi pozostać czytelny i mieć poprawne niezależne scrolle.

Należy wykorzystać istniejący endpoint i logikę rozmów, a nie tworzyć drugi parser bez potrzeby.

4.2. Kontekst po podejściu

Użytkownik ma mieć formularz na około 3–5 zdań opisujących podejście.

Kontekst ma być zapisany per lead i ponownie ładowany przy następnym wejściu.

W przyszłości AI wykorzysta go do obliczenia początkowego kapitału.

W tym Story nie projektuj treści promptu ani teorii liczenia kapitału.

Plan ma wskazać najlepsze miejsce w GUI oraz model zapisu, ale nie dodawaj osobnej głównej zakładki bez uzasadnienia.

4.3. Dwupoziomowe zakładki — pierwszy poziom

Pierwszy poziom ma reprezentować źródło/autora perspektywy:

You
SD-PL
<kolejne dynamicznie dodane szkoły>

Zasady:

You oznacza moje własne materiały i propozycje.

Skrót zakładki to SD-PL.

Po wybraniu SD-PL w panelu ma być widoczny pełny tytuł:

Social Dynamics Poland

Architektura nie może zakładać, że istnieje tylko jedna szkoła.

Użytkownik musi móc w przyszłości dodawać kolejne szkoły jako kolejne zakładki.

Plan ma zaproponować konfigurowalny model szkoły, minimum:

stabilne id/slug;

krótka etykieta zakładki;

pełna nazwa;

kolejność;

enabled/disabled;

miejsce na przyszłe powiązanie z konfiguracją promptu/modelu, bez tworzenia promptów w tym Story.

Nie hardcoduj całego workflow wyłącznie pod SD-PL; SD-PL ma być pierwszą skonfigurowaną szkołą.

4.4. Drugi poziom pod You

Po wybraniu You pokaż drugi poziom:

My Proposals
My Reports

My Proposals

pokaż propozycje wiadomości użytkownika już zapisane dla wybranego leada/workoutu;

poprawnie obsłuż brak istniejących propozycji;

umożliw wpisanie nowych propozycji;

umożliw zapis;

nie nadpisuj przypadkowo odpowiedzi AI;

nie niszcz istniejących historycznych dokumentów msg workout;

plan ma zdecydować, czy źródłem jest sekcja istniejącego dokumentu (np. konwencja //you), osobny child item czy nowy ustrukturyzowany model;

wybrana opcja musi zachować kompatybilność ze starymi workoutami i jasno opisać migrację lub brak migracji.

My Reports

pokaż automatycznie znalezione raporty powiązane z leadem;

użytkownik nie może ręcznie wklejać raportu, jeżeli istnieje w CHAD;

raporty mają być klikalne/otwieralne;

pokaż jasny empty state, jeżeli raportów brak;

plan ma wykorzystać istniejące wyszukiwanie raportów z DBA zamiast powielać traversal Content Providera w kliencie.

4.5. Drugi poziom pod szkołą, np. SD-PL

Każda szkoła ma otrzymać ten sam podstawowy drugi poziom:

Conversation Health
Capital
Next Message
Improve

Conversation Health

ocena rozmowy 1–10;

wynik ma być powiązany z konkretnym stanem rozmowy;

docelowo aktualizowany po nowych wiadomościach;

GUI ma odróżniać brak analizy od realnej oceny — nie pokazuj sztucznej wartości domyślnej.

Capital

aktualny poziom zainteresowania/kapitału;

zmiana względem poprzedniej analizy;

początkowy kapitał ma docelowo uwzględniać opis podejścia;

plan ma zaproponować sposób prezentacji aktualnej wartości oraz delty bez implementowania teorii mentora.

Next Message

wygenerowana propozycja następnej wiadomości według wybranej szkoły;

wyraźne akcje kopiowania i zapisania wyniku;

wynik musi wskazywać szkołę, z której pochodzi;

nie wysyłaj automatycznie wiadomości do Beepera w tym Story.

Improve

użytkownik wpisuje własną wersję wiadomości;

AI ma docelowo pokazać:

co zrobiono dobrze;

co zrobiono źle;

konkretne zalecenia;

poprawioną propozycję lub propozycje;

plan ma rozdzielić tekst wejściowy użytkownika od wyniku AI i nie może ich zapisywać do jednego pola w sposób uniemożliwiający późniejsze rozróżnienie.

4.6. Analiza całej rozmowy

Nie dodawaj piątej zakładki drugiego poziomu bez potrzeby. Zaprojektuj w planie widoczną akcję:

Analyze Full Conversation

Akcja ma uruchamiać pełną analizę aktualnej rozmowy i zwracać:

summary;

main strengths;

main mistakes;

recommendations.

Plan ma wskazać, gdzie wynik będzie wyświetlany i jak będzie zapisywany jako osobny dokument/wersja.

4.7. Wszystkie teksty GUI po angielsku

Wszystkie nowe teksty widoczne dla użytkownika mają być poprawnym angielskim, w szczególności:

You
My Proposals
My Reports
Social Dynamics Poland
Conversation Health
Capital
Next Message
Improve
Analyze Full Conversation
No proposals yet
No reports found
No conversation found
Save
Saved
Copy
Try Again

Kod, dokumentacja Story i komentarze mogą pozostać zgodne z aktualną konwencją repo, ale user-facing GUI ma być po angielsku.

5. Istniejąca implementacja, którą trzeba przeanalizować

Przeczytaj celowanie następujące pliki:

# istniejący flow Console → OpenAI → msg workout
$repo_path/packages/console/src/openai/askOpenAiAboutGirl.ts
$repo_path/packages/console/src/openai/dataProviders.ts
$repo_path/packages/console/src/contentProviderClient.ts

# zapis odpowiedzi AI
$repo_path/packages/dba/src/ai-answer.ts
$repo_path/packages/dba/src/beeper.ts
$repo_path/packages/dba/src/leads.ts
$repo_path/packages/dba/src/reports.ts
$repo_path/packages/dba/src/index.ts

# aktualny Msg Workout w Dashboardzie
$repo_path/packages/dashboard/app/(dashboard)/dashboard/leads/msg-workout/page.tsx
$repo_path/packages/dashboard/app/api/leads/msg-workout/route.ts
$repo_path/packages/dashboard/app/(dashboard)/dashboard/leads/details/page.tsx

# aktualna rozmowa Beeper/WhatsApp w Dashboardzie
$repo_path/packages/dashboard/app/(dashboard)/dashboard/messages/page.tsx
$repo_path/packages/dashboard/app/api/beeper/conversation/[leadName]/route.ts
$repo_path/packages/dashboard/app/api/beeper/leads/route.ts

# wspólne komponenty layoutu i edytora
$repo_path/packages/dashboard/components/shared/editor-page-shell.tsx
$repo_path/packages/dashboard/components/shared/dashboard-page-shell.tsx
$repo_path/packages/dashboard/components/shared/text-editor-with-toolbar.tsx
$repo_path/packages/dashboard/components/shared/nav-group.tsx

Zweryfikuj aktualne eksporty i lokalizacje. Nie zakładaj, że dokumentacja historyczna jest dokładniejsza niż kod.

6. Potwierdzony punkt wyjścia — zachowaj istniejące zachowanie

Aktualny kod już ma część potrzebnych mechanizmów:

Console pobiera raporty i rozmowę dla leada przez DBA;

Console buduje current_case i wywołuje OpenAI prepared prompt;

odpowiedź AI jest zapisywana jako nowy Text item pod msg workout;

Dashboard potrafi listować, otwierać i edytować istniejące workouty;

Dashboard ma endpoint pobierający rozmowę dla leada;

strona Messages ma istniejący parser i renderowanie dymków rozmowy;

route’y Dashboardu pobierają użytkownika z sesji i wywołują DBA w runWithRepoContext(...).

Plan ma wskazać, co można wydzielić i ponownie wykorzystać, zamiast kopiować kod między Messages, Leads i nowym kreatorem.

7. Wymagania architektoniczne

7.1. DBA jako granica biznesowa

Każda nowa operacja biznesowa ma istnieć w publicznym interfejsie/eksporcie packages/dba.

Dashboard client
→ cienki Next.js API route
→ publiczna funkcja DBA
→ skonfigurowany provider / MongoDB / Content Provider / OpenAI server-side

Zakazy:

brak bezpośredniego dostępu klienta do MongoDB lub Content Providera;

brak invokeContentProvider(...) w komponencie React;

brak powielania traversal logic w route, jeżeli należy do DBA;

brak sekretów OpenAI w client bundle;

brak repoGuid przyjmowanego z query/body jako źródła użytkownika.

7.2. Izolacja użytkowników

Każdy route dotykający danych użytkownika ma:

pobrać użytkownika przez getCurrentUserFromCookies();

zwrócić 401 NOT_AUTHENTICATED, jeżeli brak sesji;

wykonać DBA wewnątrz runWithRepoContext(user, ...);

nie ufać repoGuid z klienta.

Plan ma uwzględnić osobne dane szkół, propozycji, kontekstu podejścia i wyników AI per użytkownik/per lead.

7.3. Zapis wyników AI jako dokumentów

Wyniki nie mogą istnieć wyłącznie w stanie React.

Każde zatwierdzone wywołanie AI powinno tworzyć nowy dokument/wersję powiązaną z wybranym leadem i msg workout, analogicznie do istniejącego SaveAiAnswerToMsgWorkout(...).

Plan ma zaproponować dokładny model i naming, który rozróżnia minimum:

szkołę;

typ operacji: health / capital / next-message / improve / full-analysis;

datę/czas lub wersję;

wejście użytkownika, jeżeli dotyczy Improve;

wynik AI;

źródłowy stan rozmowy lub jego identyfikator/hash, aby było wiadomo, dla jakiej historii powstała analiza.

Nie zmieniaj i nie migruj destrukcyjnie istniejących itemów typu:

YY-MM-DD; ai bot

Plan ma zdecydować, czy uogólnić SaveAiAnswerToMsgWorkout, czy dodać nową, bardziej ogólną metodę DBA. Nie twórz kilku niemal identycznych funkcji per zakładka.

7.4. Dynamiczne szkoły

Plan ma rozdzielić:

definicję szkoły;

konfigurację przyszłego promptu/modelu;

zapis wyniku analizy;

GUI zakładek.

Dodanie nowej szkoły nie powinno wymagać kopiowania całego komponentu strony ani osobnego zestawu endpointów. Zaproponuj jeden wspólny kontrakt akcji szkoły.

7.5. Rozmowa i aktualizacja analiz

Ponieważ Conversation Health i Capital mają docelowo zmieniać się po nowych wiadomościach, plan musi określić:

jak wykryć, że rozmowa zmieniła się od ostatniej analizy;

jak oznaczyć wynik jako aktualny albo stale/outdated;

czy aktualizacja będzie ręczna, automatyczna przy otwarciu czy event-driven;

jak uniknąć kosztownego wywołania AI przy każdym renderze/refreshu;

jak zachować historię poprzednich ocen.

Na tym etapie nie implementuj mechanizmu ani promptu — zaplanuj kontrakt i rekomendowaną kolejność wdrożenia.

8. Oczekiwany układ GUI do zaplanowania

Plan powinien opisać co najmniej taki układ desktopowy:

┌──────────────────────────────────┬──────────────────────────────────────┐
│ Conversation                     │ Message Creator                      │
│                                  │                                      │
│ embedded Beeper conversation     │ Level 1: You | SD-PL | <schools>     │
│ own scrollbar                    │                                      │
│                                  │ Level 2: context-dependent tabs      │
│                                  │                                      │
│                                  │ selected panel content               │
└──────────────────────────────────┴──────────────────────────────────────┘

W planie oceń, czy lepszy jest podział 50/50, 55/45 lub regulowany split, ale zachowaj zasadę „conversation beside creator” na desktopie.

Dodatkowo uwzględnij:

jasny tytuł leada;

status źródła rozmowy;

loading/error/empty states;

osobne scrolle paneli;

zachowanie na mobile;

brak utraty niezapisanych propozycji przy zmianie zakładki;

dostępność klawiatury i czytelny focus;

wykorzystanie istniejących komponentów CHAD zamiast tworzenia alternatywnego design systemu.

9. Granice tego Story

W zakresie planu

information architecture;

dwupoziomowe zakładki;

layout desktop/mobile;

integracja istniejącej rozmowy Beeper;

edycja i zapis My Proposals;

wyświetlenie My Reports;

formularz approach context;

dynamiczny model szkół;

kontrakty API/DBA;

model wersjonowanych wyników AI;

stany loading/error/empty/stale;

testy i kolejność implementacji;

kompatybilność z istniejącym msg workout oraz flow Console.

Poza zakresem implementacji

treść promptów mentora;

konfiguracja promptu Social Dynamics Poland;

implementacja teorii kapitału;

dobór konkretnego modelu OpenAI;

automatyczne wysyłanie wiadomości do Beepera;

przebudowa całego Beeper CRM;

migracja historycznych danych bez osobnej decyzji;

implementacja kodu w tej sesji;

deploy TEST lub PROD.

Nie twórz fałszywych odpowiedzi AI ani placeholderowych ocen typu 7/10, które wyglądają jak realny wynik. Używaj stanów Not analyzed yet, Outdated, No data.

10. Co ma zawierać 02_plan.md

Plan ma być konkretny i wdrażalny. Zawrzyj:

Current state audit — krótko, tylko to, co faktycznie istnieje i będzie reused.

Recommended entry point — czy kreator rozszerza istniejący /dashboard/leads/msg-workout, czy powstaje nowy route powiązany z konkretnym leadem/workoutem; wybierz rozwiązanie i uzasadnij.

Information architecture — poziom 1 i poziom 2 zakładek, tytuły, akcje i empty states.

Responsive layout — desktop/tablet/mobile, scroll ownership.

Reusable components — które obecne komponenty wydzielić/reuse, zwłaszcza conversation parser/view.

Data model — approach context, proposals, reports references, school definitions, analysis runs, versioning.

DBA public API — proponowane interfejsy/metody i odpowiedzialności, bez implementowania.

Next.js API routes — cienkie route’y i payloady; rozważ jeden ogólny endpoint akcji AI zamiast czterech kopii.

OpenAI boundary — tylko kontrakt wejścia/wyjścia i miejsce wykonania server-side; bez prompt engineeringu.

Compatibility — stare workouty, ; ai bot, obecna Console i istniejący editor.

School extensibility — dodawanie/reorder/enable kolejnych szkół bez kopiowania kodu.

Conversation freshness — hash/version/timestamp i status stale.

Security and isolation — sesja, repo context, brak sekretów w kliencie.

Implementation sequence — małe etapy możliwe do osobnej weryfikacji.

Tests — unit/integration/UI/E2E/manual, dobrane do ryzyka.

Open decisions — tylko rzeczywiście nierozstrzygnięte; dla każdej podaj rekomendację, nie samo pytanie.

11. Minimalny zestaw scenariuszy testowych do uwzględnienia w planie

lead z rozmową, raportami i istniejącymi workoutami;

lead z rozmową, ale bez raportu;

lead bez rozmowy;

lead bez folderu msg workout;

stary workout z //you;

stary workout bez //you;

zapis nowych My Proposals i ponowne odczytanie;

brak nadpisania historycznej odpowiedzi AI;

przełączanie You ↔ SD-PL bez utraty niezapisanej treści;

dynamiczne dodanie drugiej szkoły bez kopiowania strony;

poprawny pełny tytuł Social Dynamics Poland po wyborze SD-PL;

user-facing copy wyłącznie po angielsku;

użytkownik A nie widzi danych użytkownika B;

wynik AI oznaczony jako outdated po zmianie rozmowy;

brak ponownego wywołania AI przy zwykłym rerenderze;

mobile layout i niezależne scrolle;

działanie starych ekranów Msg Workout i Messages bez regresji.

12. Zasady pracy i minimalizacja tokenów

wykonaj jeden git status --short na początku, nie powtarzaj bez potrzeby;

nie analizuj całego repo;

nie generuj szerokiego git diff ani listy każdego pliku w czacie;

nie czytaj tych samych dokumentów ponownie;

nie twórz implementacji próbnej;

nie zmieniaj kodu aplikacji;

możesz utworzyć i zacommitować wyłącznie dokumentację nowego Story;

nie pushuj;

nie wykonuj deployu;

nie pytaj o rutynowe zgody;

jeżeli odkryjesz niezgodność dokumentacji z kodem, zapisz ją krótko w 03_knowledge.md i oprzyj plan na aktualnym kodzie.

13. Oczekiwane zakończenie

Po przygotowaniu Story:

zatrzymaj się przed implementacją;

podaj tylko:

numer i ścieżkę Story;

krótkie, maksymalnie 8-punktowe podsumowanie rekomendowanego planu;

maksymalnie 3 decyzje wymagające akceptacji użytkownika, każda z Twoją rekomendacją;

nie dodawaj rozbudowanego raportu, git diff, git status ani listy wszystkich przeczytanych plików w odpowiedzi czatu — szczegóły mają być w Story.

### Sekcja „Wymagania użytkownika” (4.1–4.7) — treść wymagana w tym pliku

4.1. Integracja z Beeper

Rozmowa ma być osadzona bezpośrednio w kreatorze CHAD.

Użytkownik nie może ręcznie wklejać historii rozmowy.

Kreator ma pobierać właściwą rozmowę dla aktualnego leada.

Na desktopie rozmowa i panel kreatora/AI mają być widoczne obok siebie.

Na mobile układ może być sekwencyjny/stacked, ale musi pozostać czytelny i mieć poprawne niezależne scrolle.

Należy wykorzystać istniejący endpoint i logikę rozmów, a nie tworzyć drugi parser bez potrzeby.

4.2. Kontekst po podejściu

Użytkownik ma mieć formularz na około 3–5 zdań opisujących podejście.

Kontekst ma być zapisany per lead i ponownie ładowany przy następnym wejściu.

W przyszłości AI wykorzysta go do obliczenia początkowego kapitału.

W tym Story nie projektuj treści promptu ani teorii liczenia kapitału.

Plan ma wskazać najlepsze miejsce w GUI oraz model zapisu, ale nie dodawaj osobnej głównej zakładki bez uzasadnienia.

4.3. Dwupoziomowe zakładki — pierwszy poziom

Pierwszy poziom ma reprezentować źródło/autora perspektywy:

You
SD-PL
<kolejne dynamicznie dodane szkoły>

Zasady:

You oznacza moje własne materiały i propozycje.

Skrót zakładki to SD-PL.

Po wybraniu SD-PL w panelu ma być widoczny pełny tytuł:

Social Dynamics Poland

Architektura nie może zakładać, że istnieje tylko jedna szkoła.

Użytkownik musi móc w przyszłości dodawać kolejne szkoły jako kolejne zakładki.

Plan ma zaproponować konfigurowalny model szkoły, minimum:

stabilne id/slug;

krótka etykieta zakładki;

pełna nazwa;

kolejność;

enabled/disabled;

miejsce na przyszłe powiązanie z konfiguracją promptu/modelu, bez tworzenia promptów w tym Story.

Nie hardcoduj całego workflow wyłącznie pod SD-PL; SD-PL ma być pierwszą skonfigurowaną szkołą.

4.4. Drugi poziom pod You

Po wybraniu You pokaż drugi poziom:

My Proposals
My Reports

My Proposals

pokaż propozycje wiadomości użytkownika już zapisane dla wybranego leada/workoutu;

poprawnie obsłuż brak istniejących propozycji;

umożliw wpisanie nowych propozycji;

umożliw zapis;

nie nadpisuj przypadkowo odpowiedzi AI;

nie niszcz istniejących historycznych dokumentów msg workout;

plan ma zdecydować, czy źródłem jest sekcja istniejącego dokumentu (np. konwencja //you), osobny child item czy nowy ustrukturyzowany model;

wybrana opcja musi zachować kompatybilność ze starymi workoutami i jasno opisać migrację lub brak migracji.

My Reports

pokaż automatycznie znalezione raporty powiązane z leadem;

użytkownik nie może ręcznie wklejać raportu, jeżeli istnieje w CHAD;

raporty mają być klikalne/otwieralne;

pokaż jasny empty state, jeżeli raportów brak;

plan ma wykorzystać istniejące wyszukiwanie raportów z DBA zamiast powielać traversal Content Providera w kliencie.

4.5. Drugi poziom pod szkołą, np. SD-PL

Każda szkoła ma otrzymać ten sam podstawowy drugi poziom:

Conversation Health
Capital
Next Message
Improve

Conversation Health

ocena rozmowy 1–10;

wynik ma być powiązany z konkretnym stanem rozmowy;

docelowo aktualizowany po nowych wiadomościach;

GUI ma odróżniać brak analizy od realnej oceny — nie pokazuj sztucznej wartości domyślnej.

Capital

aktualny poziom zainteresowania/kapitału;

zmiana względem poprzedniej analizy;

początkowy kapitał ma docelowo uwzględniać opis podejścia;

plan ma zaproponować sposób prezentacji aktualnej wartości oraz delty bez implementowania teorii mentora.

Next Message

wygenerowana propozycja następnej wiadomości według wybranej szkoły;

wyraźne akcje kopiowania i zapisania wyniku;

wynik musi wskazywać szkołę, z której pochodzi;

nie wysyłaj automatycznie wiadomości do Beepera w tym Story.

Improve

użytkownik wpisuje własną wersję wiadomości;

AI ma docelowo pokazać:

co zrobiono dobrze;

co zrobiono źle;

konkretne zalecenia;

poprawioną propozycję lub propozycje;

plan ma rozdzielić tekst wejściowy użytkownika od wyniku AI i nie może ich zapisywać do jednego pola w sposób uniemożliwiający późniejsze rozróżnienie.

4.6. Analiza całej rozmowy

Nie dodawaj piątej zakładki drugiego poziomu bez potrzeby. Zaprojektuj w planie widoczną akcję:

Analyze Full Conversation

Akcja ma uruchamiać pełną analizę aktualnej rozmowy i zwracać:

summary;

main strengths;

main mistakes;

recommendations.

Plan ma wskazać, gdzie wynik będzie wyświetlany i jak będzie zapisywany jako osobny dokument/wersja.

4.7. Wszystkie teksty GUI po angielsku

Wszystkie nowe teksty widoczne dla użytkownika mają być poprawnym angielskim, w szczególności:

You
My Proposals
My Reports
Social Dynamics Poland
Conversation Health
Capital
Next Message
Improve
Analyze Full Conversation
No proposals yet
No reports found
No conversation found
Save
Saved
Copy
Try Again

Kod, dokumentacja Story i komentarze mogą pozostać zgodne z aktualną konwencją repo, ale user-facing GUI ma być po angielsku.
