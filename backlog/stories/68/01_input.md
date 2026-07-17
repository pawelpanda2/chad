# Story 68 — Inputs

## Input 1

(Message was accompanied by an attached document, `Content_Provider_COMPENDIUM_WITH_API_AND_EXAMPLES.md`,
a single-file Content Provider knowledge compendium — project goals, `/invoke` worker/method
model, `IRepoService`/`IItemWorker`/`IManyItemsWorker`/`IMethodWorker` interfaces, and appendices
`cp-paths.md`, `data-access.md`, `import-dba.md`, `post-parent-item.md`, `resolve-paths.md`. Not
reproduced here verbatim since its content duplicates existing project documentation already
covered by `documentation/dba/*` and `documentation/content-provider/*`; not itself part of the
actionable request below.)

Potrzebna jest pilna, mała poprawka w:

net-content-provider/sharp-api

Wykonaj analizę aktualnego kodu, poprawkę, testy i commit. Nie twórz dużego refaktoru ani nowej architektury.

## Cel

Content Provider ma wyszukiwać repozytoria w dwóch niezależnych katalogach głównych.

Nowe katalogi:

1. /Dropbox/pawelpanda2/repos
2. /Dropbox/kamilgame042

W każdym z tych katalogów mogą bezpośrednio znajdować się foldery repozytoriów mające GUID w nazwie.

## Problem 1 — automatyczne doklejanie `/repos`

Aktualnie kod do skonfigurowanej ścieżki dokleja:

/repos

Trzeba to usunąć.

Przykład:

skonfigurowana ścieżka:

/Dropbox/pawelpanda2/repos

nie może zostać zamieniona na:

/Dropbox/pawelpanda2/repos/repos

Kod ma traktować każdą skonfigurowaną ścieżkę jako gotowy katalog główny zawierający foldery repozytoriów.

Podobnie:

/Dropbox/kamilgame042

ma być skanowane dokładnie jako:

/Dropbox/kamilgame042

bez doklejania `/repos`.

## Problem 2 — obsługa wielu ścieżek

W kodzie wcześniej istniała funkcja lub mechanizm pozwalający przekazać więcej niż jedną ścieżkę repozytoriów.

Znajdź tę wcześniejszą implementację w:

- aktualnym kodzie,
- historii Git,
- poprzednich konfiguracjach,
- nieużywanych klasach lub zakomentowanym kodzie.

Przywróć albo popraw obsługę listy ścieżek.

Content Provider ma przyjmować kolekcję ścieżek, np.:

```json
[
  "/Dropbox/pawelpanda2/repos",
  "/Dropbox/kamilgame042"
]
```

Nie implementuj tego jako jednego stringa rozdzielanego przecinkiem, jeśli projekt wcześniej miał model tablicy/listy.

Zachowaj kompatybilność ze starym pojedynczym ustawieniem tylko wtedy, gdy da się to zrobić prosto i bez komplikowania kodu.

## Problem 3 — ustawienie nowych ścieżek

W odpowiedniej konfiguracji sharp-api ustaw dokładnie:

/Dropbox/pawelpanda2/repos
/Dropbox/kamilgame042

Sprawdź wszystkie środowiska i miejsca konfiguracji:

appsettings,
konfigurację wstrzykiwaną przez skrypty,
Docker,
local,
QNAP test,
QNAP prod.

Nie zmieniaj ścieżek na macOS typu:

/Users/.../Dropbox/...

jeżeli te ustawienia dotyczą ścieżek widocznych wewnątrz kontenera.

Najpierw ustal, gdzie dokładnie te wartości są konfigurowane. Nie dodawaj ich w kilku konkurencyjnych miejscach.

## Oczekiwane działanie

Dla konfiguracji:

```
RepoPaths:
  - /Dropbox/pawelpanda2/repos
  - /Dropbox/kamilgame042
```

Content Provider ma wykonać logicznie:

```
scan("/Dropbox/pawelpanda2/repos")
scan("/Dropbox/kamilgame042")
```

i zebrać foldery repozytoriów z obu katalogów.

Nie może wykonywać:

```
scan("/Dropbox/pawelpanda2/repos/repos")
scan("/Dropbox/kamilgame042/repos")
```

## Walidacja ścieżek

Dla każdej skonfigurowanej ścieżki:

sprawdź, czy katalog istnieje;
czytelnie wskaż, która ścieżka nie istnieje;
nie ukrywaj błędu przez ogólny InvalidOperationException;
komunikat powinien zawierać dokładną skonfigurowaną ścieżkę;
nie przerywaj skanowania pierwszej poprawnej ścieżki tylko dlatego, że istnieje druga.

Jeżeli wymaganiem aktualnego systemu jest zatrzymanie startu po błędnej ścieżce, zachowaj to zachowanie, ale zwróć precyzyjny błąd.

## Duplikaty repozytoriów

Jeżeli ten sam GUID repozytorium zostanie znaleziony w obu katalogach:

nie wybieraj losowo pierwszego;
nie nadpisuj jednego drugim;
zgłoś jednoznaczny błąd;
pokaż GUID oraz obie fizyczne ścieżki.

Nie rozszerzaj jednak tego zadania o duży system diagnostyczny — wystarczy bezpieczna i czytelna obsługa.

## Testy

Dodaj lub popraw testy obejmujące:

### Test 1

Jedna ścieżka już kończy się na /repos.

Konfiguracja:

/Dropbox/pawelpanda2/repos

Assert:

kod nie dokleja kolejnego /repos

### Test 2

Druga ścieżka nie kończy się na /repos.

Konfiguracja:

/Dropbox/kamilgame042

Assert:

kod również niczego nie dokleja

### Test 3

Dwie ścieżki jednocześnie.

Assert:

repozytoria z obu katalogów są dostępne

### Test 4

Nieistniejąca ścieżka.

Assert:

błąd zawiera dokładną brakującą ścieżkę

### Test 5

Ten sam GUID znaleziony w obu katalogach.

Assert:

błąd zawiera GUID i obie ścieżki

## Ważne ograniczenia

popraw tylko net-content-provider/sharp-api oraz konieczne konfiguracje i testy;
nie zmieniaj modelu folderów Content Providera;
nie zmieniaj sposobu odczytu config.yaml i body;
nie wprowadzaj nowego package'u;
nie dodawaj API ani zmian w Dashboardzie;
nie wykonuj niepowiązanego refaktoru;
nie usuwaj starego kodu przed sprawdzeniem historii Git;
nie wpisuj lokalnych ścieżek użytkownika do kodu domenowego;
ścieżki mają pochodzić z jednej właściwej konfiguracji.

## Repozytorium i submodule

packages/net-content-provider jest osobnym repozytorium podłączonym do CHAD jako git submodule.

Dlatego:

wykonaj zmianę i commit w repozytorium Content Providera;
wypchnij commit Content Providera na jego remote;
dopiero potem zaktualizuj wskaźnik submodule w repozytorium CHAD;
zrób osobny commit w CHAD aktualizujący wyłącznie wskaźnik submodule i konieczne konfiguracje CHAD;
nie mieszaj przypadkowych zmian z obu repozytoriów.

## Weryfikacja końcowa

Po implementacji pokaż:

gdzie kod wcześniej doklejał /repos;
jak teraz wygląda model konfiguracji wielu ścieżek;
listę zmienionych plików;
wyniki testów;
rzeczywiste wartości konfiguracji dla local/test/prod;
potwierdzenie, że skanowane są dokładnie:
/Dropbox/pawelpanda2/repos
/Dropbox/kamilgame042/repos
hash commita Content Providera;
hash commita CHAD aktualizującego submodule;
informację, czy oba repozytoria zostały wypchnięte.

Najpierw szybko przeanalizuj kod i historię Git, a następnie od razu wykonaj poprawkę. Zatrzymaj się tylko wtedy, gdy aktualna konfiguracja nie pozwala jednoznacznie ustalić, czy podane ścieżki dotyczą hosta czy wnętrza kontenera.
zrob z tego historyjke nowa

## Input 2

(Given in response to a clarifying question about what "zrob z tego historyjke nowa" meant.)

przeczytaj documentation/ai-docs/begin_here
tam jest wszystko opisane co to znaczy historyja i jak ja tworzyc

## Input 3

(Given in response to a clarifying question about whether the two new repo search paths —
`/Dropbox/pawelpanda2/repos` and `/Dropbox/kamilgame042` from Input 1 — are host paths or
container-internal paths, since neither matched any existing path convention and neither
directory exists on this Mac.)

Poprawka do mojego wcześniejszego opisu ścieżek — podałem je źle.

Prawidłowe ścieżki są następujące.

Na QNAP:

/shared/Dropbox/pawelpanda2/repos
/shared/Dropbox/kamilgame042/repos

Na Macu:

/Users/pawelfluder/Dropbox/repos
/Volumes/Dropbox/kamilgame042/repos

Traktuj je jako ścieżki hosta, nie ścieżki wewnątrz kontenera.

Nie zgaduj dodatkowych prefiksów i nie zamieniaj ich na inne warianty.

Zaktualizuj konfigurację odpowiednich środowisk tak, aby:

- QNAP używał dokładnie dwóch powyższych ścieżek QNAP,
- Mac używał dokładnie dwóch powyższych ścieżek Mac,

## Input 4

(Sent moments later, mid-turn, restating the same corrected paths — no new information beyond
Input 3.)

ma byc:
na qnap:
 /shared/Dropbox/pawelpanda2/repos /shared/Dropbox/kamilgame042/repos
 na mac:
/Users/pawelfluder/Dropbox/repos /Volumes/Dropbox/kamilgame042/repos
