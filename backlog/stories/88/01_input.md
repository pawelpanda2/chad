# Story 88 — Input

## Input 1

masz prygotowna makiete pogladowo w examples/CHAD_AI_Prompts_mockup_v2.html

Claude Code — implementacja Msg Auto → AI Prompts + integracja z Creator

Tryb zadania

IMPLEMENTATION / NEW STORY / END-TO-END.

To jest nowa funkcjonalność, niezależna od zakończonego Story 84. Utwórz nowe Story zgodnie z aktualnym standardem repo, następnie od razu wykonaj implementację. Nie zatrzymuj się po samym planie i nie pytaj o rutynowe zgody.

Pracujesz w repozytorium CHAD:

$repo_path

1. Obowiązkowy start

Najpierw przeczytaj aktualny punkt wejścia:

$repo_path/ai-docs/begin_here/01_ai_start.md
$repo_path/ai-docs/begin_here/02_what-and-where.md
$repo_path/ai-docs/begin_here/03_story-standard.md
$repo_path/ai-docs/begin_here/05_endpoint-rules.md
$repo_path/ai-docs/begin_here/04_deployment-rules.md

Następnie przeczytaj tylko dokumentację i kod potrzebne do tego zadania:

$repo_path/human-docs/dashboard/leads/features/message-creator.md
$repo_path/human-docs/dashboard/common/features/responsive-layout-standard.md
$repo_path/human-docs/dashboard/common/features/chad-user-data-isolation.md
$repo_path/human-docs/dashboard/common/features/shared-text-editor-toolbar.md
$repo_path/backlog/stories/84/

Sprawdź aktualne pliki:

$repo_path/packages/dashboard/app/(dashboard)/dashboard/msg-automation/page.tsx
$repo_path/packages/dashboard/app/(dashboard)/dashboard/leads/message-creator/page.tsx
$repo_path/packages/dashboard/components/shared/sidebar.tsx
$repo_path/packages/dashboard/app/globals.css

$repo_path/packages/dba/src/message-creator.ts
$repo_path/packages/dba/src/ai-answer.ts
$repo_path/packages/dba/src/leads.ts
$repo_path/packages/dba/src/index.ts
$repo_path/packages/dba/src/repo-context.ts

Odszukaj też aktualne route’y API Message Creator i istniejące wzorce zapisu Text itemów przez DBA. Nie wykonuj szerokiego audytu repo.

2. Story

Przed zmianą kodu:

sprawdź najwyższy numer w backlog/stories/;

utwórz kolejny folder numeryczny;

utwórz pliki wymagane przez 03_story-standard.md;

zapisz ten pełny input w 01_input.md;

przygotuj krótki, wdrażalny 02_plan.md;

od razu przejdź do implementacji — plan nie wymaga dodatkowej akceptacji.

3. Cel

W sekcji Msg Auto dodaj nową pozycję/przycisk:

AI Prompts

Ma znajdować się bezpośrednio za Creator w kolejności menu/kafelków Msg Auto.

Kliknięcie AI Prompts prowadzi do osobnego widoku listy promptów. Z listy można:

utworzyć nowy prompt;

otworzyć istniejący prompt;

edytować go;

zapisać;

wrócić z edytora do listy.

Lista promptów musi być jednocześnie źródłem promptów widocznych i wybieranych w istniejącym Message Creator.

Nie twórz dwóch niezależnych list ani danych przykładowych w React state.

4. Docelowe route’y GUI

Preferowane route’y:

/dashboard/msg-automation/ai-prompts
/dashboard/msg-automation/ai-prompts/new
/dashboard/msg-automation/ai-prompts/[promptId]

Możesz zastosować query param zamiast dynamicznego segmentu tylko wtedy, gdy jest to zgodniejsze z aktualnym routingiem CHAD. Zachowaj dwa logicznie osobne widoki:

Prompt List

Prompt Editor

Edytor musi mieć widoczny przycisk Back prowadzący do listy.

5. Styl GUI

GUI ma łączyć:

układ edytora podobny do OpenAI Platform;

rzeczywisty design system CHAD.

Nie kopiuj brandingu OpenAI. Użyj istniejących komponentów CHAD, kolorów z globals.css, DashboardPageShell / EditorPageShell, kart, przycisków, inputów, selectów i istniejącego sidebara.

Prompt List

Prosta lista/tabela:

Name | School | Status | Version | Provider | Updated

Elementy:

tytuł AI Prompts;

krótki opis;

search;

przycisk New prompt;

kliknięcie wiersza otwiera edytor;

empty state No prompts yet;

loading i error state;

responsywność zgodna z CHAD.

Prompt Editor

Układ desktopowy podobny do OpenAI Platform:

┌───────────────────────┬──────────────────────────────┐
│ Prompt configuration  │ Test conversation / result   │
│ own scrollbar         │ own scrollbar                │
└───────────────────────┴──────────────────────────────┘

Na mobile panele stacked.

Header:

Back;

nazwa lub New prompt;

status Draft / Published;

Save;

opcjonalnie Publish version;

Code / request preview może być przygotowany jako funkcjonalny podgląd albo rozsądny v1 placeholder, ale nie kosztem podstawowego CRUD.

Pola v1:

Name
Slug / stable id
Description
School
Action type
Status
Provider
Model
Developer instructions
System instructions (optional)
User prompt template
Variables
Text format
Reasoning mode
Reasoning effort
Verbosity
Summary
Expected output schema (optional)
OpenAI stored prompt id/version (optional)

Nie wszystkie pola muszą być obowiązkowe. Walidacja ma uniemożliwić zapis bez stabilnego ID, nazwy i treści promptu.

6. Provider-neutralny model

Nie projektuj danych jako wyłącznie OpenAiPrompt.

Utwórz neutralny kontrakt, np.:

type AiProvider =
  | "openai"
  | "anthropic"
  | "gemini"
  | "openai-compatible";

type AiPromptStatus = "draft" | "published" | "archived";

interface AiPromptDefinition {
  id: string;
  slug: string;
  name: string;
  description?: string;

  schoolId?: string;
  actionType:
    | "conversation-health"
    | "capital"
    | "next-message"
    | "improve"
    | "full-analysis"
    | "custom";

  status: AiPromptStatus;
  version: number;

  messages: Array<{
    role: "developer" | "system" | "user";
    content: string;
  }>;

  variables: Array<{
    key: string;
    label?: string;
    required: boolean;
    description?: string;
  }>;

  provider: AiProvider;
  model?: string;

  settings?: {
    textFormat?: "text" | "json_schema";
    reasoningMode?: string;
    reasoningEffort?: string;
    verbosity?: string;
    summary?: string;
    outputSchema?: unknown;
  };

  providerBindings?: {
    openaiPromptId?: string;
    openaiPromptVersion?: string;
  };

  createdAt: string;
  updatedAt: string;
}

Możesz dostosować szczegóły do konwencji repo, ale zachowaj neutralność dostawcy.

W tym Story pełne wykonanie requestu wymagane jest przede wszystkim dla OpenAI albo zachowanie aktualnej działającej integracji OpenAI. Dla innych providerów przygotuj wspólny kontrakt/adapter boundary bez udawania, że są skonfigurowani.

7. Content Provider — wymagany model danych

W repo bieżącego użytkownika utwórz logiczną strukturę:

msg-auto
└── ai prompts        # Text item

Wymagania:

msg-auto ma być folderem;

ai prompts ma być Text itemem;

body ai prompts zawiera listę definicji promptów;

zapis ma być per użytkownik dzięki getCurrentRepoGuid() / runWithRepoContext;

brak repoGuid z query/body;

struktura ma powstawać lazy przy pierwszym zapisie;

odczyt pustej/nieistniejącej struktury zwraca pustą listę, nie crash;

zapis nie może niszczyć innych children folderu msg-auto.

Preferowany format body:

{
  "schemaVersion": 1,
  "prompts": []
}

Nie używaj YAML, jeśli cały model jest złożonym, wersjonowanym JSON-em. Zachowaj deterministyczną serializację i bezpieczne parsowanie.

Bezpieczeństwo zapisu

Nie rób niekontrolowanego read-modify-write w route React/Next.js.

Cała logika:

find/create msg-auto;

find/create Text item ai prompts;

parse;

validate;

add/update/delete/archive;

version increment;

serialize;

Put;

ma być w publicznym API packages/dba.

W przypadku uszkodzonego JSON:

nie nadpisuj go automatycznie pustą listą;

zwróć czytelny błąd;

zaloguj bez sekretów;

zachowaj istniejące body do ręcznej naprawy.

8. DBA API

Dodaj jeden spójny moduł, np.:

packages/dba/src/ai-prompts.ts

Publiczne operacje minimum:

listAiPrompts(): Promise<AiPromptSummary[]>
getAiPrompt(id: string): Promise<AiPromptDefinition | null>
createAiPrompt(input: CreateAiPromptInput): Promise<AiPromptDefinition>
updateAiPrompt(id: string, input: UpdateAiPromptInput): Promise<AiPromptDefinition>

Opcjonalnie:

archiveAiPrompt(id: string)
publishAiPrompt(id: string)

Nie twórz osobnych prawie identycznych metod per provider ani per action type.

Każda metoda ma być eksportowana przez publiczny interfejs/index DBA i testowalna.

9. Next.js API

Dodaj cienkie route’y, np.:

GET  /api/msg-automation/ai-prompts
POST /api/msg-automation/ai-prompts

GET   /api/msg-automation/ai-prompts/[id]
PATCH /api/msg-automation/ai-prompts/[id]

Każdy route:

getCurrentUserFromCookies();

401 NOT_AUTHENTICATED bez użytkownika;

runWithRepoContext(user, ...);

walidacja payloadu;

wywołanie publicznej metody DBA;

brak surowego invokeContentProvider() w route;

brak sekretów i provider API keys w odpowiedzi.

10. Integracja z Message Creator

To jest część obowiązkowa.

Aktualny Message Creator ma pobierać prompt definitions z tego samego źródła msg-auto / ai prompts.

W Creator:

pokaż listę dostępnych promptów odpowiednich dla wybranej szkoły i/lub action type;

co najmniej prompt o actionType = next-message powinien być możliwy do wyboru w Next Message;

analogicznie mapuj pozostałe typy, jeśli aktualny Creator posiada te akcje;

prompt draft nie powinien być domyślnie używany w normalnym wykonaniu;

published jest dostępny do użycia;

brak promptu ma pokazywać prawdziwy stan Prompt not configured;

nie hardcoduj prompt IDs w komponencie Creator;

nie kopiuj pełnej listy do osobnego pliku/configu;

Creator przechowuje wyłącznie wybrane promptId/slug i pobiera definicję z DBA;

po zmianie promptu na liście Creator widzi aktualną opublikowaną wersję po ponownym odczycie.

Jeżeli istniejąca integracja Story 84 ma tymczasowe definicje szkoły/promptu w kodzie, zachowaj kompatybilność, ale przenieś źródło treści promptu do nowego rejestru. Nie usuwaj działającego Creator UI.

11. OpenAI execution boundary

Dla wywołania OpenAI:

wykonanie tylko server-side;

API key tylko z env;

użyj oficjalnego SDK i aktualnego Responses API zgodnie z istniejącą integracją;

obsłuż dwa warianty:

prompt zapisany lokalnie — adapter buduje role/messages i settings;

opcjonalny openaiPromptId/openaiPromptVersion — adapter wywołuje zapisany prompt OpenAI;

neutralny model domenowy nie może zależeć od openai.responses.create typów;

adapter OpenAI mapuje neutralny model na request dostawcy;

pozostałe providery mają wspólny interface i stan Provider not configured, bez fałszywych odpowiedzi.

Nie wysyłaj requestu AI automatycznie przy renderze ani zapisie promptu.

12. Wersjonowanie

Minimalne wymaganie:

nowy prompt zaczyna jako version: 1;

zmiana draftu może aktualizować bieżący draft;

Publish version tworzy/utrwala kolejną wersję albo co najmniej inkrementuje wersję zgodnie z jasno opisanym kontraktem;

Creator używa opublikowanego promptu;

nie nadpisuj niejawnie opublikowanej wersji edycją draftu.

Jeśli pełna historia wersji w jednym Text itemie nadmiernie rozszerza Story, zaimplementuj bezpieczne v1:

publishedVersion
draftVersion

i opisz dalszy pełny version history w 06_others_from_report.md. Nie udawaj pełnego wersjonowania, jeśli go nie ma.

13. Testy

Dodaj testy jednostkowe DBA minimum dla:

brak msg-auto / ai prompts → pusta lista;

utworzenie pierwszego promptu tworzy strukturę;

zapis i ponowny odczyt;

update tylko wybranego promptu;

dwa prompty nie nadpisują się;

duplikat id/slug jest blokowany;

błędny JSON nie jest nadpisywany;

draft/published filtering;

version increment;

izolacja repo context.

Testy API/integration:

401 bez sesji;

GET list;

POST create;

PATCH update;

walidacja błędnego payloadu.

Testy UI/manual:

Msg Auto pokazuje Creator, a zaraz po nim AI Prompts.

Kliknięcie AI Prompts otwiera listę.

New prompt otwiera osobny edytor.

Back wraca do listy.

Zapisany prompt pojawia się na liście po odświeżeniu.

Prompt znajduje się w Content Providerze pod:msg-auto / ai prompts.

Creator pokazuje opublikowany prompt właściwego action type.

Creator pokazuje Prompt not configured, gdy brak promptu.

Użytkownik A nie widzi promptów użytkownika B.

Mobile i desktop nie mają scroll trapów.

Dotychczasowy Creator działa bez regresji.

Nie ma mocków ani danych przykładowych udających realne prompty.

Uruchom właściwe:

pnpm --filter dba test
pnpm --filter dba build
pnpm --filter dashboard build

Dopasuj komendy do aktualnego package.json, jeśli nazwy skryptów są inne.

14. Dokumentacja

Dodaj dokumentację feature’u w aktualnym właściwym miejscu, np.:

human-docs/dashboard/msg-automation/features/ai-prompts.md

oraz dokumentację DBA/modelu CP w odpowiedniej kategorii.

Zaktualizuj ai-docs/begin_here/02_what-and-where.md tylko jeżeli nowa kategoria/dokument powinny być routowane z indeksu.

Dokumentacja ma opisać:

route’y UI/API;

strukturę msg-auto / ai prompts;

schemaVersion;

provider-neutral model;

integrację z Creator;

wersjonowanie;

błędy i recovery uszkodzonego JSON;

testy.

15. Autonomia, Git i deployment

Działaj samodzielnie aż do pełnego zakończenia.

Możesz:

tworzyć commity;

pushować zmiany;

wykonać deploy na TEST oficjalnym skryptem;

wykonać smoke test na TEST.

Nie wdrażaj na PROD.

Nie zatrzymuj się po:

planie;

samym CRUD;

samym GUI;

samym Content Providerze;

samych testach lokalnych.

Zakończ dopiero po:

implementacji;

testach;

aktualizacji Story;

commicie;

pushu;

deployu TEST;

smoke teście.

Zatrzymaj się tylko przy realnym ryzyku utraty danych, konflikcie z nieznaną pracą użytkownika lub przed PROD.

16. Minimalizacja tokenów

jeden git status --short na początku;

nie czytaj całego repo;

nie powtarzaj audytu Story 84;

użyj istniejących komponentów i wzorców;

nie generuj długich raportów w czacie;

zapisuj szczegóły w Story;

nie pokazuj pełnego git diff;

nie pytaj o rutynowe zgody.

17. Oczekiwane zakończenie

Na końcu podaj krótko:

numer Story;

commit SHA;

status push;

status deploy TEST;

wyniki testów;

dokładną ścieżkę CP:msg-auto / ai prompts;

URL listy promptów;

URL edytora;

potwierdzenie, że Creator używa tej samej listy;

czego celowo nie wykonano.

Nie wykonuj PROD.
