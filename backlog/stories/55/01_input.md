# Story 55 — 01_input.md

## Input 1

Story 55

Przygotuj nowe Story 55 zgodnie z obowiązującym standardem Stories.

Najpierw utwórz dokumentację:

stories/
    55/
        01_input.md
        02_plan.md
        03_knowledge.md
        04_todos.md
        05_report.md

oraz zaktualizuj odpowiednie indeksy dokumentacji.

Nie rozpoczynaj implementacji przed przygotowaniem planu.

============================================================
Task 1 — Nagrywanie raportów
============================================================

Dodaj możliwość nagrywania raportów głosem.

Na razie interesuje mnie architektura oraz pierwsza implementacja.

Celem jest możliwość nagrania raportu głosowo zamiast wpisywania go ręcznie.

Najpierw przeanalizuj:

- istniejące rozwiązania Web Speech API,
- możliwość użycia OpenAI Whisper,
- możliwość użycia lokalnego rozpoznawania mowy,
- możliwość późniejszego rozszerzenia na urządzenia mobilne.

Nie implementuj rozwiązania utrudniającego późniejszą zmianę silnika rozpoznawania mowy.

============================================================
Task 2 — Standaryzacja przycisku Back
============================================================

Na wszystkich stronach dashboardu:

przycisk

Back

ma zostać przeniesiony na prawą stronę.

Przejrzyj wszystkie istniejące strony i ustandaryzuj jego położenie.

Nie twórz wyjątków bez uzasadnienia.

============================================================
Task 3 — Reports mobile layout
============================================================

W formularzu Reports:

w wersji mobilnej

przycisk

Create

powinien znajdować się w osobnym wierszu.

Przeanalizuj również wersję desktopową.

Jeżeli okaże się, że taki układ jest czytelniejszy również na desktopie,
zastosuj go także tam.

Najpierw oceń UX, potem podejmij decyzję.

============================================================
Task 4 — Domyślna zakładka Preview / Editor
============================================================

Obecnie edytor otwiera zawsze tę samą zakładkę.

To powinno być konfigurowalne.

Rozbuduj wspólny komponent edytora.

Dodaj możliwość ustawienia domyślnej zakładki.

Przykładowo:

defaultTab = Preview

lub

defaultTab = Editor

Nie implementuj tego wyłącznie dla Reports.

Ma to być opcja wspólnego komponentu.

Dla Reports:

po utworzeniu nowego raportu

powinna automatycznie otworzyć się zakładka

Editor.

Pozostałe miejsca pozostaw zgodnie z ich dotychczasową logiką lub dostosuj po analizie UX.

============================================================
Wymagania
============================================================

Przed implementacją:

- przeczytaj dokumentację zgodnie z what-and-where.md,
- przygotuj 02_plan.md,
- uzupełnij 03_knowledge.md,
- dopiero potem rozpocznij implementację.

Podczas pracy stale aktualizuj:

04_todos.md

Po zakończeniu Story:

04_todos.md ma być pusty.

Jeżeli pojawią się pomysły wykraczające poza Story 55,
zapisz je w:

06_propositions.md

Nie umieszczaj propozycji przyszłych zmian w 04_todos.md ani 05_report.md.

Na końcu przygotuj 05_report.md zgodnie z obowiązującym standardem, rozpoczynając od checklisty tasków do ręcznej weryfikacji.

## Input 2

Popraw jeszcze organizację dokumentacji AI.

Poprzednia reorganizacja nie została wykonana zgodnie z moją intencją.

Docelowo katalog:

documentation/ai-docs/knowledge/

powinien wyglądać tak:

01_ai_start.md
02_what-and-where.md
03_story-standard.md
04_deployment-rules.md

============================================================
01_ai_start.md
============================================================

To jest pierwszy dokument, który AI powinno przeczytać.

Powinien być bardzo krótki.

Jego celem jest jedynie wskazanie kolejności czytania dokumentacji.

Powinien zawierać między innymi:

- najpierw przeczytaj ten dokument;
- następnie przeczytaj `02_what-and-where.md`;
- `02_what-and-where.md` jest spisem treści całej wiedzy (knowledge);
- `03_story-standard.md` opisuje obowiązujący standard realizacji Story;
- podczas realizacji Story regularnie aktualizuj `04_todos.md`;
- `04_todos.md` służy wyłącznie do zapisywania bieżącego stanu pracy, aby po przerwaniu sesji AI mogło wznowić pracę;
- po zakończeniu Story `04_todos.md` powinien być pusty;
- dopiero potem rozpocznij analizę kodu i implementację.

To ma być krótki dokument startowy, a nie szczegółowy opis standardów.

============================================================
02_what-and-where.md
============================================================

Przenieś tutaj obecną zawartość `what-and-where.md`.

To jest indeks całej dokumentacji projektu.

============================================================
03_story-standard.md
============================================================

Tutaj pozostaje pełny opis standardu Story.

============================================================
04_deployment-rules.md
============================================================

Bez zmian.

============================================================

Po wykonaniu reorganizacji:

- popraw wszystkie odwołania do tych dokumentów;
- zaktualizuj indeksy dokumentacji;
- nie pozostaw starych nazw ani martwych odnośników.

Od tej pory każdy nowy Story ma zakładać, że AI rozpoczyna pracę właśnie od `01_ai_start.md`, dzięki czemu nie będzie trzeba powtarzać tych samych instrukcji w kolejnych promptach.

## Input 3

kontynuuj

## Input 4

(approval message, relayed by the user, for the 02_plan.md presented after Input 3)

Plan zatwierdzam z dwiema decyzjami:

1. Task 1:
Zastosuj Web Speech API jako pierwszą implementację za interfejsem `SpeechToTextEngine`.

Wymagania:
- UI nie może zależeć bezpośrednio od konkretnego silnika;
- brak wsparcia przeglądarki ma być obsłużony czytelnym komunikatem;
- zapisz w dokumentacji ograniczenie Chrome/Edge;
- Whisper opisz jako kolejny adapter / przyszły etap;
- nie przedstawiaj Web Speech API jako rozwiązania docelowego dla wszystkich urządzeń.

2. Task 3:
Przycisk Create ma być w osobnym wierszu na wszystkich breakpointach, także na desktopie.

Po tych ustaleniach możesz rozpocząć implementację Story 55.

## Input 5

jeszcze dodaj do tego story pilny task zeby pierwszy zakladka ktora sie otiwera to nie bylo Statuses tylko Forms
