# Story 75 — Input

## Input 1

Prompt dla Claude Code — Cloude13_sheets / Daily Tracker → Google Sheets

Pracujesz w repozytorium CHAD:

```text
$repo_path
```

## Rola i cel

Jesteś wykonawcą zadania z obszaru specjalizacji:

```text
Cloude13_sheets
```

Celem jest doprowadzenie do tego, aby dane dotyczące datingu zapisywane i aktualizowane w widoku **Daily Tracker** były również bezpiecznie synchronizowane do **Google Sheets**.

Nie zakładaj z góry, że synchronizacja ma być realizowana bezpośrednio z frontendu ani że każdy zapis ma wykonywać synchroniczny request do Google. Najpierw ustal rzeczywisty przepływ danych Daily Trackera i zaprojektuj rozwiązanie zgodne z architekturą CHAD.

## Obowiązkowy początek

Najpierw przeczytaj aktualny punkt wejścia dokumentacji:

```text
$repo_path/ai-docs/start_here/
```

Następnie:

1. sprawdź, gdzie aktualnie znajduje się dokumentacja Daily Trackera;
2. sprawdź, czy istnieje już dokumentacja dotycząca integracji z Google, eksportów, zewnętrznych API, kolejek, synchronizacji albo retry;
3. sprawdź, czy istnieje folder specjalizacji związany z Sheets/Google Sheets;
4. jeżeli nie istnieje, utwórz właściwy folder specjalizacji pod `ai-docs/` zgodnie z aktualną konwencją repo, bez dublowania istniejącej dokumentacji;
5. przeczytaj dokumentację bieżących Story związanych z Daily Trackerem, MongoDB, DBA i historią tylko wtedy, gdy jest potrzebna do tego zadania.

Nie zakładaj istnienia ani nadrzędności:

```text
README.md
CLAUDE.md
AGENTS.md
```

Nie analizuj całego repo bez potrzeby.

## Minimalizacja zużycia tokenów

- Zacznij od dokumentacji i konkretnych modułów Daily Trackera.
- Nie wykonuj szerokiego audytu całego monorepo.
- Nie czytaj tych samych dużych plików wielokrotnie.
- Korzystaj z istniejących wzorców DBA, repo context, błędów, retry i konfiguracji.
- Ogranicz raporty pośrednie w czacie.
- Szczegóły zapisuj w Story.
- Nie uruchamiaj Playwright ani pełnego deploymentu, dopóki nie jest to potrzebne.
- Nie pytaj o rutynowe zgody.
- Pytaj wyłącznie o dane zewnętrzne, których naprawdę nie da się ustalić z repo, np. identyfikator docelowego arkusza lub decyzję o koncie Google.

## Tryb pracy

To jest zadanie:

```text
analiza → plan → implementacja lokalna → testy
```

Działaj samodzielnie. Nie zatrzymuj się po samym planie, o ile implementacja może zostać bezpiecznie wykonana bez prawdziwych sekretów i bez deploymentu PROD.

Jeżeli do uruchomienia integracji są wymagane prawdziwe dane Google, przygotuj kompletną implementację, konfigurację, walidację i testy z mockiem/fake adapterem, a następnie jasno wypisz jedynie brakujące wartości konfiguracyjne. Nie umieszczaj sekretów w repo.

## Story

Przed zmianami:

1. przeczytaj aktualny standard Story wskazany przez `ai-docs/start_here/`;
2. sprawdź najwyższy istniejący numer Story;
3. utwórz kolejne Story;
4. zapisz pełny input zadania;
5. przygotuj plan;
6. aktualizuj checklistę podczas pracy;
7. na końcu zapisz raport;
8. przyszłe pomysły oddziel od wykonanego zakresu.

Nie zgaduj ścieżki Story ani nazw plików — sprawdź aktualną konwencję.

## Najpierw ustal rzeczywisty przepływ Daily Trackera

Znajdź i opisz minimalny rzeczywisty przepływ:

```text
Daily Tracker UI
→ Next.js API / server action
→ packages/dba
→ provider / MongoDB / Content Provider
```

Ustal:

- gdzie znajduje się widok Daily Trackera;
- jakie endpointy lub server actions obsługują odczyt i zapis;
- jaki model danych jest zapisywany;
- czy Daily Tracker zapisuje jeden dokument dzienny, wiele rekordów, tabelę, JSON, YAML lub dane CP;
- które pola dotyczą datingu;
- jak identyfikowany jest użytkownik i dzień;
- czy zapis jest create, update, upsert czy patch;
- czy istnieje historia zmian;
- czy dane są już przechowywane w MongoDB, `cp_items`, Content Providerze lub innym miejscu;
- czy jeden zapis z UI może powodować kilka operacji;
- gdzie najlepiej umieścić integrację, aby nie duplikować logiki.

Nie projektuj mapowania kolumn na podstawie nazw widocznych wyłącznie na ekranie. Oprzyj je na rzeczywistym kontrakcie danych.

## Zasada architektoniczna

Dashboard nie może bezpośrednio posiadać logiki Google Sheets ani przechowywać credentiali.

Preferowany przepływ:

```text
Dashboard
→ cienki API adapter
→ packages/dba / warstwa aplikacyjna
→ interfejs eksportu/synchronizacji
→ adapter Google Sheets
```

Jeżeli aktualna architektura wskazuje lepszy istniejący punkt integracji, użyj go i uzasadnij.

Nie wykonuj requestu do Google bezpośrednio z komponentu klienckiego.

Nie przekazuj `repoGuid` z query/body jako źródła tożsamości użytkownika. Zachowaj aktualny standard izolacji użytkowników i repo context.

## Wymagania synchronizacji

Zaprojektuj synchronizację tak, aby:

1. zapis Daily Trackera do głównego źródła danych pozostawał operacją nadrzędną;
2. awaria Google Sheets nie powodowała utraty właściwego zapisu CHAD;
3. ten sam rekord nie tworzył przypadkowych duplikatów;
4. ponowienie było idempotentne;
5. update istniejącego dnia aktualizował właściwy wiersz albo właściwy zakres;
6. było wiadomo, który rekord CHAD odpowiada któremu wierszowi arkusza;
7. błędy były możliwe do zdiagnozowania;
8. sekrety nie trafiały do kodu, Git, logów ani dokumentacji;
9. integrację dało się wyłączyć flagą konfiguracyjną;
10. testy nie wymagały prawdziwego konta Google.

Preferuj stabilny klucz biznesowy, np. połączenie:

```text
user/repo context + data Daily Trackera + typ rekordu
```

ale nie narzucaj dokładnego klucza przed analizą modelu.

## Synchronicznie czy asynchronicznie

Porównaj dwa warianty:

### Wariant A — zapis synchroniczny po głównym zapisie

Dopuszczalny wyłącznie, jeżeli:

- request Google nie blokuje krytycznie UI;
- błąd Google nie cofa zapisu CHAD;
- timeout jest krótki i kontrolowany;
- istnieje retry lub zapis błędu.

### Wariant B — outbox / kolejka synchronizacji

Preferowany, jeżeli repo ma już wzorzec workerów, kolejek, Change Streams, błędów lub retry.

Oczekiwane właściwości:

- po zapisie Daily Trackera tworzony jest wpis synchronizacyjny;
- worker wysyła dane do Google Sheets;
- statusy np. `pending`, `processing`, `synced`, `failed`;
- licznik prób;
- ostatni błąd bez sekretów;
- `nextAttemptAt`;
- możliwość bezpiecznego replay;
- unikalny klucz operacji;
- brak duplikatów po restarcie.

Nie twórz ciężkiej infrastruktury, jeśli proste rozwiązanie zgodne z aktualnymi wzorcami repo wystarczy. Decyzję zapisz w `03_knowledge.md` lub odpowiedniku.

## Google Sheets — sposób dostępu

Sprawdź aktualne, oficjalne i wspierane podejście biblioteczne dla stosu Node.js/TypeScript używanego w repo.

Najbardziej prawdopodobny wariant serwerowy:

```text
Google Sheets API
+ konto serwisowe
+ arkusz udostępniony adresowi konta serwisowego
```

Nie zakładaj jednak, że repo nie ma już integracji OAuth lub wspólnego klienta Google.

Wymagania:

- klient wyłącznie po stronie serwera;
- credentiale przez zmienne środowiskowe lub bezpieczny plik montowany poza repo;
- żadnego JSON-a service account w Git;
- walidacja konfiguracji przy starcie lub pierwszym użyciu;
- czytelny błąd braku konfiguracji;
- maskowanie sekretów w logach;
- minimalny zakres uprawnień;
- dokumentacja konfiguracji lokalnej i środowiskowej bez prawdziwych wartości.

Rozważ konfigurację podobną do:

```text
GOOGLE_SHEETS_ENABLED=
GOOGLE_SHEETS_SPREADSHEET_ID=
GOOGLE_SHEETS_DAILY_TRACKER_SHEET_NAME=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=
```

Nazwy dostosuj do istniejącej konwencji env w repo. Obsłuż poprawnie `\n` w kluczu prywatnym, jeżeli klucz jest przekazywany jako zmienna środowiskowa.

## Model arkusza i mapowanie kolumn

Nie narzucaj ostatecznych kolumn bez analizy aktualnego modelu Daily Trackera.

Przygotuj jawne mapowanie:

```text
pole domenowe CHAD
→ kolumna Google Sheets
→ typ/format
→ wymagane/opcjonalne
→ reguła aktualizacji
```

Arkusz powinien zawierać przynajmniej techniczne pola umożliwiające idempotencję i diagnostykę, np.:

- stabilny identyfikator rekordu;
- identyfikator użytkownika/repo w bezpiecznej postaci zgodnej z projektem;
- data Daily Trackera;
- data utworzenia;
- data ostatniej aktualizacji;
- wersja schematu eksportu;
- status lub znacznik aktywności, jeśli model go wymaga.

Nie eksportuj automatycznie prywatnych treści datingowych, których nie potrzeba w arkuszu. Najpierw ustal dokładny zakres pól z istniejącego modelu i zadania. W dokumentacji wyraźnie oznacz, które dane mogą być wrażliwe.

## Nagłówki i ewolucja schematu

Zaprojektuj zachowanie dla:

- pustego arkusza;
- brakujących nagłówków;
- zmienionej kolejności kolumn;
- dodatkowych ręcznych kolumn użytkownika;
- niezgodnej wersji schematu;
- kilku środowisk używających jednego arkusza.

Nie nadpisuj ręcznych kolumn ani całego arkusza bez potrzeby.

Preferuj mapowanie po nazwach nagłówków zamiast ślepych numerów kolumn, jeżeli nie komplikuje to nadmiernie implementacji.

Dodaj ochronę przed przypadkowym połączeniem lokalnego/TEST/PROD do tego samego arkusza, np. przez osobne `spreadsheetId`, nazwę zakładki lub prefiks środowiska.

## Błędy i obserwowalność

Wykorzystaj istniejący standard błędów CHAD.

Loguj bez sekretów:

- typ operacji;
- stabilny identyfikator rekordu;
- nazwę arkusza;
- numer próby;
- czas requestu;
- kategorię błędu;
- status końcowy.

Rozróżnij:

- brak konfiguracji;
- brak dostępu do arkusza;
- nieistniejący arkusz/zakładkę;
- błędne nagłówki;
- limit API;
- timeout;
- błąd sieci;
- błąd walidacji danych.

Jeżeli projekt ma Dev Panel / Errors, zaproponuj lub dodaj integrację zgodnie z istniejącym standardem, ale nie rozszerzaj niepotrzebnie zakresu UI.

## Testy

Dodaj testy na poziomie odpowiadającym architekturze.

Minimum:

1. test mapowania modelu Daily Trackera do wiersza;
2. test stabilnego klucza/idempotencji;
3. test create nowego dnia;
4. test update istniejącego dnia;
5. test retry po błędzie;
6. test, że błąd Google nie usuwa ani nie cofa zapisu CHAD;
7. test wyłączonej integracji;
8. test braku konfiguracji;
9. test maskowania sekretów;
10. test izolacji użytkowników/repo context;
11. test niezmieniania ręcznych kolumn, jeśli rozwiązanie je wspiera.

Google API ma być ukryte za interfejsem i testowane przez fake/mock adapter. Nie wykonuj automatycznych testów zapisujących do prawdziwego arkusza bez osobnej konfiguracji testowej i wyraźnej zgody.

Jeżeli repo ma standard integration testów z realnym MongoDB, zastosuj go tylko w zakresie niezbędnym dla outboxa lub stanu synchronizacji.

## Kryteria akceptacji

Zadanie jest wykonane, gdy:

- zapis Daily Trackera nadal poprawnie zapisuje dane w głównym źródle CHAD;
- po poprawnej konfiguracji dane są tworzone lub aktualizowane w Google Sheets;
- ponowienie tego samego zapisu nie tworzy duplikatu;
- update tego samego dnia aktualizuje właściwy rekord;
- awaria Google nie powoduje utraty danych CHAD;
- integrację można wyłączyć;
- credentiale nie są w repo;
- istnieje dokumentacja konfiguracji;
- istnieją testy mapowania, idempotencji, błędów i retry;
- Story zawiera decyzję architektoniczną, checklistę i raport;
- raport jasno oddziela testy wykonane od niewykonanych.

## Git i bezpieczeństwo

Przed zmianami wykonaj:

```bash
git status --short
```

Nie używaj:

```text
git reset --hard
force-push
```

Nie commituj:

- `.env`;
- credentiali Google;
- plików service account;
- tokenów;
- dumpów;
- backupów;
- build artifacts;
- przypadkowych zmian użytkownika.

Nie cofaj ani nie porządkuj obcych zmian przy okazji.

## Granice zadania

Nie wykonuj deploymentu PROD.

Nie wykonuj deploymentu TEST bez wyraźnej zgody użytkownika.

Nie twórz prawdziwego arkusza Google i nie udostępniaj go kontu serwisowemu, jeżeli nie masz odpowiednich danych i zgody.

Nie zmieniaj architektury całego Daily Trackera.

Nie przenoś głównego źródła prawdy do Google Sheets. Google Sheets jest dodatkowym celem synchronizacji/eksportu, nie nadrzędną bazą CHAD.

Nie dodawaj dwukierunkowej synchronizacji z Google Sheets do CHAD w tym Story, chyba że użytkownik wyraźnie tego zażąda.

## Oczekiwany raport końcowy

W czacie podaj krótko:

1. numer i ścieżkę Story;
2. wybrany wariant architektury;
3. główne zmienione pliki;
4. wykonane testy;
5. brakujące zewnętrzne wartości/config;
6. czy potrzebna jest zgoda na TEST;
7. `git status --short`;
8. czego celowo nie wykonano.

Pełny raport zapisz w Story.

## Autonomia

Działaj samodzielnie i nie pytaj o rutynowe zgody.

Zatrzymaj się tylko, gdy wystąpi realne ryzyko:

- utraty lub ujawnienia danych;
- nadpisania istniejącego arkusza;
- braku bezpiecznego rollbacku;
- konfliktu z nieznaną pracą użytkownika;
- konieczności użycia prawdziwych credentiali;
- deploymentu TEST lub PROD;
- decyzji o eksporcie szczególnie wrażliwych danych, której nie da się wywnioskować z zaakceptowanego modelu.

W pozostałych przypadkach wykonaj analizę, Story, implementację i testy lokalne.

Docelowo router zostanie zastąpiony lub rozszerzony przez Outbox Pattern.

Dla Google Sheets oznacza to:

```Nadrzędna decyzja architektoniczna

Użytkownik chce prosty model konfiguracyjny:

```csharp
dba_function()
{
	CpItem = (dzialamy na objektach CpItem)
	
	if (config.mongoEnabled)
	{
		do_mongo_work();
	}
	
	if (config.sheetEnabled)
	{
		do_google_sheet_work();
	}

	if (config.contentProviderEnabled)
	{
		do_cp_work_async();
	}
}
```
```

Google Sheets nie powinno być wywoływane bezpośrednio z Dashboardu. Powinno być kolejnym targetem/followerem pod interfejsem DBA, przygotowanym pod późniejsze przeniesienie do outboxa.

podam ci tez dane do logowania do google sheets niedlugo jak bedzie na tym etapie ze bedziesz je potrzebowal

## Input 2

key: 4cf8371c8e86142ed6753b414982a11222a54a78
username: chad-admin
konto google: kamilgame042@gmail.com
czy to wystarczajace informacje?
mozesz to dac do .env lokalnego

## Input 3

stworzylem google sheet
https://docs.google.com/spreadsheets/d/1tdBlQrq0e4gXIKeUFeTre2pED6bpysQf5eVRHfB9Ytk/edit?gid=0#gid=0
cos jeszcze potrzebujesz?

## Input 4

juz powinno byc wlaczone

## Input 5

jednak ten dokument:
https://docs.google.com/spreadsheets/d/14nFkoS1jSWoTaeeD0phoE655anLwkNiVqXOzNiqDLrA/edit?gid=0#gid=0

powinien byc dodany uzytkownik

## Input 6

The user pasted the full Google service-account JSON key (a real secret
credential) directly into chat. **Redacted here on purpose** — this file
lives in `backlog/stories/75/`, which is tracked by git, and the project's
own security rules (`credentiale nie są w repo`, `.gitignore`'s `.env.*`
pattern) forbid ever committing a real private key. The actual key was
written only to the gitignored `.env.local` (see `05_tasks_and_checklist.md`
Task 3 and `06_others_from_report.md`). The `private_key` field itself was
never captured anywhere outside `.env.local`. The remaining fields are not
secret material on their own (Google does not allow key recovery from
them), but are still identifying, so they are described here in prose
rather than as a machine-parsable JSON block (which is what actually
tripped GitHub's push-protection secret scanner on the credential-shaped
structure the first time this file was committed):

- Service account type: `service_account`
- Project id: `chad-503119`
- Private key id: `4cf8371c8e86142ed6753b414982a11222a54a78`
- Client email: `chad-admin@chad-503119.iam.gserviceaccount.com`
- Client id: `114209805257310245996`
- Standard Google OAuth endpoints (`accounts.google.com`,
  `oauth2.googleapis.com`, `www.googleapis.com`) — unchanged defaults, not
  specific to this key.

## Input 7

cos dziwnego tam umeiszczasz w tym google sheet
ja chce miec wierna kopie tej tabeli (daily-tracker)
i nazwij tez tak ten sheet daily

(Sent alongside a screenshot of the live Dashboard's Views → Tracker table,
showing the real column groups TRAINING/ACTION/TEXTING/RESULTS and the real
column order including the "— AUTO" columns interspersed among the domain
columns — used directly as the source of truth for the column-order rework
in `03_knowledge.md`/`06_others_from_report.md`.)

## Input 8

daily i dates tez zrob od razu

## Input 9

kontynuuj
