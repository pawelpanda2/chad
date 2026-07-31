# Story 97 — Input

**Note:** this Story was first created as `backlog/stories/96/` but a
parallel Claude Code session (running concurrently in the same working
directory — no worktree isolation, see repo-wide feedback memory on this)
claimed the same next-available number for an unrelated task ("Cursor —
Knowledge zasilane przez cp_items z repo chad_shared") and overwrote
`96/01_input.md` with its own input before this Story's `02_plan.md` had
been written. Per this repo's Story-standard rule against ever reverting
another session's concurrent work, this Story was renumbered to 97
(the next number free after the collision was noticed) rather than
touching `96/` again. `96/01_input.md` was left exactly as the other
session wrote it.

## Input 1

CHAD — prompt dla Claude Code: package MCP dla CpItem

1. Zadanie użytkownika

Stwórz w monorepo CHAD osobny package MCP, którego podstawowym zadaniem będzie udostępnienie agentom AI kontrolowanego dostępu do danych CpItem.

Cały system CHAD korzysta z modelu CpItem, dlatego MCP nie może tworzyć równoległego modelu danych ani bezpośrednio obsługiwać PostgreSQL, MongoDB lub plików Content Providera. Ma być cienką, bezpieczną warstwą wejściową korzystającą z aktualnych kontraktów i implementacji projektu.

Cel końcowy:

Odyseusz oraz później ChatGPT
→ łączą się z serwerem MCP CHAD
→ mogą odnajdywać, czytać, tworzyć i edytować CpItem
→ operacje przechodzą przez istniejącą warstwę CP/DBA
→ obowiązuje izolacja użytkownika/repoGuid
→ dostęp jest zweryfikowany realnym testem z Odyseusza

Nie kończ na planie ani szkielecie. Zaimplementuj package, podepnij go do monorepo, uruchom lokalnie i wykonaj rzeczywisty test klientem Odyseusz.

1.1. Zweryfikowany punkt odniesienia w aktualnym repo

W aktualnym repo istnieje wspólny kontrakt:

packages/content-provider/common/src/contracts.ts

Zawiera model:

interface CpItem {
  Body: string;
  Config: CpConfig;
  Settings: CpConfig;
  Address: string;
}

oraz operacje storage:

GetItem
GetByNames
GetManyByName
FindRecursively
Put
PostParentItem

Potraktuj repo jako źródło prawdy. Przed implementacją sprawdź aktualny HEAD i potwierdź, czy powyższy kontrakt nadal jest obowiązujący oraz przez jaką aktualną warstwę entry/router/provider powinien przechodzić nowy MCP.

1.2. Package

Utwórz osobny package w packages/.

Preferowana nazwa:

packages/mcp

Jeżeli aktualna konwencja workspace jednoznacznie wskazuje inną nazwę, zastosuj ją i krótko uzasadnij w Story. Nie twórz package poza workspace i nie dodawaj osobnego, niezależnego repozytorium.

Package ma:

być napisany w TypeScript;

korzystać z pnpm i konwencji monorepo;

mieć własny package.json, tsconfig, źródła, testy i skrypty uruchomieniowe;

używać oficjalnego, aktualnego SDK MCP;

nie kopiować typów CpItem, jeżeli można je importować ze wspólnego package;

nie importować wewnętrznych plików providerów, jeżeli istnieje publiczny entrypoint/interfejs;

nie uzależniać protokołu MCP od konkretnej bazy danych.

Przed wyborem wersji SDK sprawdź aktualną oficjalną dokumentację MCP. Obecny standard wspiera narzędzia, resources/prompts oraz transport lokalny stdio i zdalny Streamable HTTP. Nie opieraj implementacji na przestarzałym HTTP+SSE, chyba że Odyseusz rzeczywiście wymaga kompatybilności i zostanie to udokumentowane.

1.3. Architektura

Wymagany kierunek:

Odyseusz / ChatGPT / inny klient MCP
→ transport MCP
→ walidacja wejścia i autoryzacja
→ handler narzędzia MCP
→ publiczna warstwa aplikacyjna CP/DBA
→ aktualny router/provider
→ zatwierdzone źródło danych

Zakazy:

brak bezpośrednich zapytań SQL w package MCP;

brak bezpośredniego dostępu do MongoDB;

brak ręcznego czytania/zapisywania plików CP;

brak duplikowania logiki Put, PostParentItem, wyszukiwania lub repo context;

brak przyjmowania dowolnego repoGuid od modelu bez kontroli;

brak globalnego dostępu do wszystkich użytkowników;

brak nowej równoległej warstwy CRUD obok istniejących interfejsów.

1.4. Narzędzia MCP — wymagane minimum

Nazwy mogą zostać lekko dopasowane do aktualnej konwencji MCP, ale funkcjonalność ma pozostać rozdzielona i jednoznaczna.

cp_get_item

Czyta pojedynczy CpItem.

Wejście powinno używać rzeczywistych parametrów wymaganych przez aktualny kontrakt, np. loca albo bezpiecznego identyfikatora/adresu. Nie zgaduj znaczenia ścieżek.

Zwraca pełny, ustrukturyzowany CpItem:

Body
Config
Settings
Address

cp_get_by_names

Czyta element według sekwencji nazw zgodnie z istniejącą metodą GetByNames.

Nie zastępuj tej metody własnym przechodzeniem drzewa.

cp_get_many_by_name

Czyta wiele elementów zgodnie z istniejącą metodą GetManyByName.

Wprowadź rozsądny limit wyników i jednoznaczny błąd przy przekroczeniu limitu.

cp_find_recursively

Wyszukuje elementy zgodnie z istniejącą metodą FindRecursively.

Wymagane zabezpieczenia:

ograniczenie zakresu do repo użytkownika;

limit wyników;

limit długości frazy;

timeout lub anulowanie;

brak zwracania danych innych użytkowników.

cp_put_item

Edytuje istniejący element lub wykonuje operację odpowiadającą aktualnej semantyce Put.

Nie zmieniaj semantyki metody. Najpierw sprawdź aktualny kontrakt i istniejących callerów.

Wymagane:

walidacja type, name, loca i content;

ochrona przed zapisem poza repo;

czytelny wynik zawierający zapisany CpItem;

czytelne błędy domenowe;

test potwierdzający realny zapis i ponowny odczyt.

cp_create_item

Tworzy item przez istniejącą metodę odpowiadającą PostParentItem.

Po utworzeniu, jeżeli użytkownik poda treść, użyj zatwierdzonego istniejącego flow do zapisania treści. Nie twórz nieatomowego obejścia bez sprawdzenia obowiązującej architektury.

Narzędzie diagnostyczne

Dodaj lekkie narzędzie lub zasób, np.:

chad_mcp_health

Ma potwierdzać:

że serwer MCP działa;

wersję/protokół;

dostępność zależności;

tryb środowiska;

czy połączenie z warstwą CP/DBA jest gotowe.

Nie zwracaj sekretów, connection stringów ani pełnych danych konfiguracyjnych.

1.5. Rozdzielenie odczytu i zapisu

Odczyt i mutacje muszą być łatwe do odróżnienia przez klienta i użytkownika.

Dla narzędzi mutujących:

ustaw właściwe metadane MCP wskazujące side effect, jeżeli SDK je wspiera;

opis narzędzia musi jasno mówić, że operacja zmienia dane;

nie wykonuj ukrytych mutacji w narzędziach odczytowych;

nie dodawaj masowego delete, globalnego replace ani migracji;

na tym etapie nie wystawiaj usuwania itemów, chyba że aktualny kontrakt i użytkownik wyraźnie tego wymagają.

1.6. Tożsamość i izolacja użytkownika

Najważniejszy problem do rozwiązania przed dopuszczeniem edycji:

skąd MCP bierze zaufany repoGuid użytkownika?

Nie pozwalaj modelowi przekazywać dowolnego repoGuid jako zwykłego argumentu narzędzia.

Dla lokalnego Odyseusza dopuszczalny jest kontrolowany profil konfiguracyjny wskazujący jednego użytkownika testowego, ale:

konfiguracja ma być jawna;

musi mieć guard środowiska;

testy mutujące wykonuj tylko na test2 lub test3 zgodnie z aktualną dokumentacją;

nie używaj pawel_f, kamil_s ani realnych użytkowników do testów zapisu;

docelowy transport HTTP musi mieć zaufany mechanizm uwierzytelnienia i mapowania identity → repoGuid;

brak identity ma kończyć się odmową, nie fallbackiem globalnym.

Dodaj test cross-user isolation.

1.7. Transporty

Zaimplementuj warstwę serwera tak, aby logika narzędzi nie zależała od transportu.

Wymagane:

stdio — do lokalnego podpięcia Odyseusza;

Streamable HTTP — do późniejszego podpięcia ChatGPT lub innego zdalnego klienta, o ile aktualna oficjalna dokumentacja i architektura CHAD to potwierdzają.

Jeżeli pełne bezpieczne HTTP wymaga osobnego etapu OAuth/auth gateway, nie udawaj gotowości produkcyjnej. Zaimplementuj bezpieczny lokalny zakres i przygotuj czytelną granicę pod etap zdalny.

Nie wystawiaj niezabezpieczonego publicznego endpointu.

1.8. Konfiguracja

Dodaj udokumentowane zmienne konfiguracyjne zgodnie z konwencją repo, np. dla:

transportu;

hosta/portu HTTP;

środowiska;

profilu użytkownika testowego;

tokenu lub mechanizmu auth;

limitów wyników i timeoutów;

poziomu logowania.

Nie zapisuj sekretów w repo. Uzupełnij właściwy env example, ale najpierw znajdź rzeczywistą konwencję plików env.

1.9. Podpięcie do Odyseusza

Najpierw ustal, czym dokładnie jest Odyseusz w bieżącym środowisku:

znajdź jego rzeczywisty plik konfiguracji MCP lub mechanizm rejestracji serwerów;

nie zgaduj nazwy pliku ani formatu;

nie modyfikuj globalnej konfiguracji użytkownika bez backupu;

nie zapisuj sekretów w konfiguracji;

użyj lokalnego transportu stdio, jeżeli jest obsługiwany.

Dodaj serwer CHAD MCP do konfiguracji Odyseusza i wykonaj realny test z jego poziomu.

Minimalny test akceptacyjny Odyseusza:

Odyseusz widzi serwer MCP.

Odyseusz listuje narzędzia.

Wywołuje chad_mcp_health.

Czyta znany testowy CpItem.

Tworzy lub edytuje item wyłącznie użytkownika test2/test3.

Ponownie odczytuje item i potwierdza zapisaną treść.

Próba wyjścia poza przypisany repo context jest blokowana.

Logi serwera nie zawierają sekretów ani danych innego użytkownika.

Jeżeli Odyseusz nie wspiera któregoś transportu albo konfiguracji, zapisz dokładny, potwierdzony blocker. Nie raportuj „podpięte", jeżeli wykonano tylko ręczny MCP Inspector lub test jednostkowy.

Możesz dodatkowo użyć oficjalnego MCP Inspectora jako diagnostyki, ale nie zastępuje on testu Odyseusza.

1.10. Przygotowanie do testu ChatGPT

Nie konfiguruj mojego konta ChatGPT i nie wdrażaj publicznego endpointu bez zgody.

Przygotuj natomiast:

instrukcję uruchomienia transportu Streamable HTTP;

wymagany model auth;

adres endpointu w formie placeholdera;

checklistę podłączenia klienta ChatGPT;

listę narzędzi i ich opisów;

smoke test wykonywany niezależnym klientem MCP;

informację, jakie elementy pozostają do wykonania przed bezpiecznym wystawieniem do Internetu.

Nie zakładaj, że lokalny stdio będzie dostępny bezpośrednio z ChatGPT.

1.11. Testy

Dodaj co najmniej:

Unit

walidacja schematów wejściowych;

mapowanie błędów domenowych na odpowiedzi MCP;

limity wyszukiwania;

odrzucenie nieprawidłowej ścieżki/nazwy/type;

brak jawnego repoGuid sterowanego przez model;

redakcja sekretów z logów.

Integration

cp_get_item;

cp_get_by_names;

cp_get_many_by_name;

cp_find_recursively;

create przez aktualny PostParentItem;

edit przez aktualny Put;

zapis → ponowny odczyt;

cross-user isolation;

brak bezpośredniego dostępu do providerów.

Protocol/smoke

initialize;

list tools;

wywołanie health;

wywołanie read;

wywołanie write;

poprawna odpowiedź błędu;

zamknięcie połączenia;

test stdio;

test Streamable HTTP, jeżeli został wdrożony w tym etapie.

Realny Odyseusz

Wykonaj scenariusz z punktu 1.9 i zachowaj krótki dowód w Story/logu testowym bez sekretów.

1.12. Dokumentacja i Story

Przed utworzeniem Story przeczytaj aktualny standard Story.

Utwórz lub uzupełnij specjalizację dokumentacji dotyczącą MCP, jeżeli routing dokumentacji nie wskazuje jeszcze właściwego miejsca. Nie twórz duplikatu, jeśli taki folder już istnieje.

Dokumentacja ma opisać:

rolę package MCP;

architekturę i zależności;

listę narzędzi;

kontrakty wejścia/wyjścia;

identity/repo context;

transport stdio;

transport HTTP;

konfigurację Odyseusza;

przygotowanie ChatGPT;

bezpieczeństwo mutacji;

testy i troubleshooting.

1.13. Integracja z monorepo i uruchomienie lokalne

Dodaj odpowiednie skrypty root package.json, np. zgodne z rzeczywistą nazwą package:

mcp
mcp:build
mcp:test
mcp:stdio
mcp:http

Nazw nie kopiuj bez sprawdzenia obecnej konwencji.

Po zmianach:

zainstaluj zależności przez pnpm;

wykonaj build package;

wykonaj testy;

przebuduj i uruchom lokalne środowisko oficjalnymi skryptami Mac Docker, jeżeli package jest częścią lokalnego runtime Docker;

nie kończ na samym pnpm build;

sprawdź status, logi, health i realny flow;

nie używaj ręcznego docker compose, jeśli istnieją oficjalne skrypty.

1.14. Granice

Możesz:

tworzyć commity;

modyfikować package/workspace, dokumentację, testy i lokalną konfigurację Odyseusza niezbędną do zadania;

uruchamiać testy lokalne;

wdrożyć na TEST tylko wtedy, gdy rzeczywiście jest to konieczne do zweryfikowania transportu i pozwalają na to aktualne zasady repo.

Nie możesz:

wykonać deployu PROD;

pushować sekretów;

używać realnych użytkowników do testów zapisu;

wystawiać niezabezpieczonego MCP publicznie;

omijać DBA/CP;

zmieniać semantyki CpItem;

dokładać usuwania danych poza zakresem;

raportować dostępu Odyseusza bez realnego wywołania.

3. Szczegółowa kolejność wykonania

Sprawdź git status, HEAD i równoległe zmiany.

Przeczytaj ai-docs/begin_here/ oraz routing dokumentacji.

Przeczytaj dokumentację CP, DBA, auth, repo context, test users i bash scripts.

Sprawdź aktualny kontrakt CpItem i publiczne entrypointy.

Sprawdź workspace i wzorce istniejących packages.

Znajdź rzeczywistą konfigurację MCP Odyseusza.

Utwórz Story zgodnie z aktualnym standardem.

Zaimplementuj package MCP i niezależną od transportu warstwę handlers/application.

Dodaj bezpieczne identity/repo context.

Dodaj wymagane narzędzia odczytu i edycji.

Dodaj stdio; następnie przygotuj bezpieczny Streamable HTTP.

Dodaj testy unit, integration i protocol smoke.

Podepnij MCP do Odyseusza.

Wykonaj realny scenariusz read/write/read na test2 lub test3.

Sprawdź cross-user isolation.

Wykonaj build i właściwe regresje.

Jeżeli dotyczy lokalnego Dockera, przebuduj środowisko oficjalnymi skryptami.

Zaktualizuj Story i dokumentację.

Wykonaj commit.

Zdaj krótki, uczciwy raport.

4. Kryteria akceptacji

(pełna lista kryteriów akceptacji oraz format raportu końcowego i sekcja 2. „Zabezpieczenia przed podstawowymi błędami AI Codera" — jak w oryginalnym prompcie, patrz konwersacja).

## Input 2

Pytanie: "I searched this Mac for "Odyseusz" and found no dedicated app/project by that name — only two personal to-do notes mentioning it as a standalone word, no technical context. The only MCP-capable client actually installed is Claude Desktop, which has an empty claude_desktop_config.json (...). Is Odyseusz Claude Desktop, or something else?"

Odpowiedź użytkownika: "dodalem do workspace, odyseusz to projekt w python trzeba go uruchomi z tego repo"

(Ustalone: Odyseusz = `/Users/pawelfluder/03_synch/01_files_programming/11_other_python/odysseus`, self-hosted AI workspace w Pythonie/FastAPI z własnym MCP-klientem (`src/mcp_manager.py`), obsługującym transport stdio/sse/streamable-http.)
