pracujesz w projektach:
Content Provider (.NET)
chad-dba
chad-dashboard
chad-console
content-finder

Nie zgaduj architektury.
Najpierw przeanalizuj istniejący kod i dokumentację, dopiero potem implementuj.

Obowiązkowa dokumentacja do przeczytania:
architecture/chad-dba/project-goal.md
architecture/chad-dba/import-dba.md
architecture/chad-dba/data-access.md
architecture/chad-dba/cp-paths.md
architecture/chad-dba/resolve-paths.md
architecture/chad-dba/post-parent-item.md
architecture/ai-docs/feature-documentation-rules.md

Następnie znajdź i przeczytaj
dokumentację wszystkich powiązanych bugów
architecture/[nazwa projektu]/bugs/

Jeżeli istnieje kilka podobnych feature'ów lub bugów, przeczytaj wszystkie, które mogą mieć związek z zadaniem.

Analiza przed implementacją

Przed napisaniem kodu:

Znajdź istniejącą implementację podobnego feature'a.
Sprawdź, czy podobna logika istnieje już w:
Content Provider,
chad-dba,
chad-dashboard,
chad-console,
content-finder.
Nie twórz drugiej implementacji tej samej logiki.
Jeżeli podobny komponent już istnieje:
użyj go,
wydziel wspólną logikę,
nie kopiuj kodu.
Jeżeli coś nie działa:
najpierw znajdź przyczynę,
pokaż flow,
dopiero potem popraw kod.
Najważniejsze zasady projektu

Nigdy:

nie zgaduj architektury,
nie czytaj filesystemu po logical names,
nie używaj FirstOrDefault jako obejścia problemu,
nie twórz drugiej implementacji istniejącej logiki,
nie psuj istniejących feature'ów,
nie przywracaj wcześniej naprawionych bugów.

Każda zmiana musi zachować zgodność z dotychczasową architekturą projektu.

Przed zakończeniem zadania sprawdź, czy nowa implementacja nie powoduje regresji.

Dokumentacja po zakończeniu

Po wykonaniu zadania zaktualizuj dokumentację.

Jeżeli powstał nowy feature:

architecture/[nazwa projektu]/features/[nazwa-feature].md

Jeżeli naprawiony został bug:

architecture/[nazwa projektu]/bugs/[nazwa-buga].md

Nie narzucam nazw plików.

Dobierz nazwę zgodnie z istniejącą konwencją projektu.

Dokumentacja feature powinna zawierać
cel,
architekturę,
flow,
użyte API,
wykorzystane komponenty,
edge cases,
dalsze etapy rozwoju,
test ręczny.
Dokumentacja buga powinna zawierać
objawy,
root cause,
analizę przyczyny,
opis rozwiązania,
wpływ na istniejące feature'y,
informację, jak uniknięto regresji,
test ręczny.
Test końcowy

Przed uznaniem zadania za zakończone:

sprawdź, że nowe wymaganie działa,
sprawdź, że nie zepsułeś istniejących feature'ów,
sprawdź, że nie wrócił żaden wcześniej naprawiony bug,
sprawdź requesty i błędy w Dev Panelu (jeżeli dotyczą zadania),
zaktualizuj dokumentację.

Dopiero po wykonaniu powyższych kroków uznaj zadanie za zakończone.
