# Story 90 — Input

## Input 1

Claude Code — implementacja nowego page Links w Msg Auto

Tryb zadania

IMPLEMENTATION / NEW STORY / END-TO-END.

To jest nowa funkcjonalność. Utwórz nowe Story zgodnie z aktualnym standardem repo i od razu przejdź do implementacji. Nie zatrzymuj się po samym planie.

Repo:

$repo_path

1. Obowiązkowy start

Najpierw przeczytaj:

$repo_path/ai-docs/begin_here/01_ai_start.md
$repo_path/ai-docs/begin_here/02_what-and-where.md
$repo_path/ai-docs/begin_here/03_story-standard.md
$repo_path/ai-docs/begin_here/05_endpoint-rules.md
$repo_path/ai-docs/begin_here/04_deployment-rules.md

Następnie przeczytaj tylko pliki potrzebne do tego zadania:

$repo_path/examples/CHAD_Msg_Auto_Links_page_mockup_v5.html
$repo_path/packages/dashboard/app/(dashboard)/dashboard/msg-automation/page.tsx
$repo_path/packages/dashboard/components/shared/sidebar.tsx
$repo_path/packages/dashboard/app/(dashboard)/dashboard/leads/message-creator/page.tsx
$repo_path/packages/dashboard/components/shared/beeper-conversation-view.tsx
$repo_path/packages/dba/src/message-creator.ts
$repo_path/packages/dba/src/beeper-crm.ts
$repo_path/packages/dba/src/index.ts
$repo_path/packages/dba/src/repo-context.ts

Sprawdź też aktualne route’y API dotyczące leadów, Beeper CRM i Message Creator.

Nie wykonuj szerokiego audytu repo.

2. Story

Przed zmianą kodu:

sprawdź najwyższy numer w backlog/stories/;

utwórz kolejny folder numeryczny;

utwórz wymagane pliki Story;

zapisz pełny input w 01_input.md;

przygotuj krótki plan;

od razu przejdź do implementacji.

3. Cel

W menu/kafelkach Msg Auto dodaj nową pozycję:

Links

Ma to być osobny page, a nie zakładka w Message Creator.

Preferowany route:

/dashboard/msg-automation/links

Kolejność w Msg Auto:

Creator
Links
AI Prompts

4. Source of truth dla GUI

Makieta:

$repo_path/examples/CHAD_Msg_Auto_Links_page_mockup_v5.html

jest source of truth dla wyglądu i układu.

Odwzoruj ją możliwie wiernie w stylu CHAD.

Nie dodawaj elementów, których nie ma w makiecie.

W szczególności:

brak Review suggestions;

brak Fit;

brak + i -;

brak Clear selection;

brak panelu Selected connection;

brak dodatkowych opisów w dolnym pasku;

na dole po lewej tylko:

Auto-match all

Save;

pod tytułem Links ma pozostać:Connect CHAD leads with Beeper conversations.

5. Układ strony

Desktop:

┌───────────────┬──────────────────────────────┬────────────────────┐
│ CHAD Leads    │ visual links canvas          │ Beeper Conversations│
│               │                              │                    │
└───────────────┴──────────────────────────────┴────────────────────┘

Na dole:

Auto-match all | Save

Mobile:

układ stacked;

brak poziomego scrolla całej strony;

zachowaj czytelność list;

canvas może mieć własną wysokość;

przyciski na dole nadal widoczne.

Każdy panel ma własny scroll.

6. Elementy list

CHAD Leads

Każdy element pokazuje:

[nazwa leada — klikalna]
Linked by contact
number +48 ...

albo odpowiedni status:

Linked manually
number +48 ...

lub:

Suggested by contact
number +48 ...

Nie pokazuj:

loca;

1 conversation;

technicznych identyfikatorów.

Kliknięcie nazwy leada otwiera szczegóły leada.

Beeper Conversations

Każdy element pokazuje:

[nazwa rozmowy — klikalna]
Linked by contact
number +48 ...

lub analogiczny status.

Kliknięcie nazwy rozmowy otwiera szczegóły rozmowy lub właściwy istniejący widok Beeper.

7. Kropki i przeciąganie

Każdy element po lewej i prawej stronie ma kropkę-handle na swojej krawędzi.

Wymagania:

kropki dokładnie jak w makiecie;

drag zaczyna się wyłącznie z kropki;

podczas przeciągania widać tymczasową linię;

po upuszczeniu na kropkę po drugiej stronie powstaje połączenie;

nie można łączyć dwóch leadów ani dwóch rozmów;

nie można utworzyć duplikatu tego samego połączenia;

kliknięcie nazwy nie może rozpoczynać drag;

połączenia mają poprawnie aktualizować się po resize i scrollu paneli.

Nie używaj statycznych koordynatów z HTML mockupu. Linie muszą być liczone na podstawie realnych elementów DOM lub biblioteki graph/flow, jeśli jest już dostępna w repo.

Preferuj prostą implementację bez ciężkiej nowej zależności, chyba że repo już używa odpowiedniego narzędzia.

8. Kolory połączeń

Zachowaj konwencję makiety:

automatyczne: zielone;

ręczne: niebieskie przerywane;

sugerowane: szare kropkowane.

Nie dodawaj komunikatu Manual link created.

Nie pokazuj toastu po samym przeciągnięciu, jeśli nie jest to zgodne ze standardem CHAD.

9. Dane

Strona ma łączyć:

leady CHAD bieżącego użytkownika;

rozmowy Beeper bieżącego użytkownika.

Nie używaj mocków w finalnej implementacji.

Dane muszą być izolowane per użytkownik.

Każdy route:

pobiera użytkownika przez getCurrentUserFromCookies();

zwraca 401 NOT_AUTHENTICATED, jeśli brak sesji;

wykonuje DBA w runWithRepoContext(user, ...);

nie przyjmuje repoGuid z klienta.

10. Model linków

Zaproponuj i zaimplementuj neutralny model linku, minimum:

interface LeadBeeperLink {
  id: string;
  leadName: string;
  leadLoca?: string;

  conversationId: string;
  conversationName: string;
  channel?: string;

  method: "automatic" | "manual" | "suggested";
  source: "contact" | "name" | "phone" | "manual";

  contactValue?: string;
  confidence?: number;

  createdAt: string;
  updatedAt: string;
}

Możesz dostosować nazwy do konwencji repo.

Nie pokazuj technicznych pól w GUI.

11. Automatyczne dopasowanie

Przycisk:

Auto-match all

ma:

analizować dostępne leady i rozmowy;

tworzyć sugestie albo automatyczne linki na podstawie kontaktu;

przede wszystkim używać numeru telefonu;

nie łączyć automatycznie przy niskiej pewności;

nie nadpisywać linków ręcznych;

nie tworzyć duplikatów.

W v1:

exact normalized phone match → automatic;

częściowe/niepewne dopasowanie → suggested;

brak kontaktu → bez automatycznego linku.

Normalizuj numery telefonu przed porównaniem.

12. Save

Przeciągnięcie może aktualizować stan roboczy w UI.

Dopiero przycisk:

Save

zapisuje zmiany.

Wymagania:

brak przypadkowego zapisu przy samym renderze;

przy zmianach niezapisanych przycisk Save jest aktywny;

po zapisie pokazuje standardowy dla CHAD stan Saved;

błąd zapisu nie usuwa zmian lokalnych;

ponowne wejście pokazuje zapisane linki.

13. DBA i API

Cała logika biznesowa w packages/dba.

Dodaj publiczne operacje minimum:

getLeadBeeperLinksPageData()
saveLeadBeeperLinks(input)
autoMatchLeadBeeperLinks()

Możesz rozdzielić je inaczej, ale nie duplikuj logiki w route.

Cienkie route’y, np.:

GET  /api/msg-automation/links
POST /api/msg-automation/links
POST /api/msg-automation/links/auto-match

Route’y:

tylko walidacja;

session;

runWithRepoContext;

publiczna metoda DBA;

brak bezpośredniego Mongo/CP w komponencie.

14. Miejsce zapisu

Najpierw sprawdź aktualną architekturę Beeper CRM i decyzje Story dotyczące per-user Mongo.

Linki mają być zapisane w magazynie zgodnym z aktualnym modelem Beeper CRM i izolacją użytkowników.

Nie zapisuj ich przypadkowo do globalnej bazy.

Jeżeli naturalnym miejscem jest per-user Beeper Mongo, użyj osobnej kolekcji, np.:

lead_conversation_links

Nie zapisuj w Content Providerze, jeśli aktualna architektura mówi, że Beeper CRM i jego powiązania należą do Mongo.

W 03_knowledge.md zapisz krótko uzasadnienie wybranego miejsca.

15. Nawigacja

nazwa leada → aktualny widok szczegółów leada;

nazwa rozmowy → aktualny widok szczegółów kontaktu/rozmowy Beeper;

Back → /dashboard/msg-automation.

Nie twórz nowych stron szczegółów, jeśli już istnieją.

16. Testy

Minimum:

DBA

pusta lista linków;

zapis manualnego linku;

brak duplikatu;

brak linku lead↔lead;

brak linku conversation↔conversation;

exact phone match;

phone normalization;

manual link nie jest nadpisywany przez auto-match;

suggested dla niepewnego matchu;

izolacja użytkowników.

API

401 bez sesji;

GET;

POST Save;

POST Auto-match;

walidacja błędnego payloadu.

UI/manual

Links widoczne w Msg Auto między Creator i AI Prompts.

Otwiera osobny page.

Wygląd odpowiada makiecie.

Brak dodatkowych przycisków spoza makiety.

Nazwy po obu stronach są klikalne.

Brak loca.

Brak 1 conversation.

Widoczne dwie linie statusu i numeru telefonu.

Kropki są na wszystkich elementach.

Drag tworzy linię.

Nie można tworzyć nieprawidłowych połączeń.

Auto-match all tworzy poprawne automatyczne/sugerowane linki.

Save zapisuje.

Po refreshu linki pozostają.

Mobile działa bez regresji.

User A nie widzi linków usera B.

Uruchom właściwe testy i buildy:

pnpm --filter dba test
pnpm --filter dba build
pnpm --filter dashboard build

Dopasuj do aktualnych skryptów.

17. Dokumentacja

Dodaj feature doc, np.:

human-docs/dashboard/msg-automation/features/links.md

Opisz:

route;

źródła danych;

model linku;

drag;

auto-match;

Save;

izolację użytkowników;

storage;

testy.

18. Git i deploy

Działaj autonomicznie aż do końca.

Możesz:

commit;

push;

deploy TEST;

smoke test TEST.

Nie deployuj PROD.

Nie zatrzymuj się po planie ani przed deployem TEST.

19. Minimalizacja tokenów

jeden git status --short na początku;

nie czytaj całego repo;

nie twórz dodatkowych wariantów GUI;

nie dodawaj funkcji spoza makiety i tego promptu;

nie pokazuj pełnego diffu;

szczegóły zapisuj w Story.

20. Zakończenie

Podaj krótko:

numer Story;

commit SHA;

push status;

deploy TEST status;

test results;

URL page Links;

storage;

potwierdzenie zgodności z makietą;

czego nie wykonano.

Nie wykonuj PROD.
