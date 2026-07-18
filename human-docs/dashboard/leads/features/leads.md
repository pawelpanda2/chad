# Feature: Leads Dashboard

## Cel feature'a

Zakładka Leads w `chad-dashbord` daje szybki dostęp do listy leadów, ich szczegółów oraz kontaktów zapisanych w Content Providerze. Ten feature obejmuje także wejście do tego samego widoku szczegółów z zakładek `Todo msg` i `Statuses`.

## Zakres

- zakładka `Leads` z listą leadów i informacją, czy lead ma `contacts`
- widok szczegółów pojedynczego leada
- wejście do szczegółów z `Leads`, `Todo msg` i `Statuses`
- renderowanie pól `contacts` jako klikalnych linków, gdy da się je bezpiecznie znormalizować
- prosty mechanizm `returnTo` dla przycisku `Wstecz`

## Zmienione pliki

### `chad-dashbord`

- `app/(dashboard)/dashboard/leads/page.tsx`
- `app/(dashboard)/dashboard/leads/details/page.tsx`
- `app/(dashboard)/dashboard/todo-msg/page.tsx`
- `app/(dashboard)/dashboard/statuses/page.tsx`
- `app/api/leads-dashboard/route.ts`
- `app/api/leads-dashboard/details/route.ts`
- `lib/lead-links.ts`

### `chad-dba`

- `src/leads.ts`
- `architecture/dashboard/features/leads.md`

## Route i API

### UI routes

- `/dashboard/leads`
- `/dashboard/leads/details?leadName=...&leadLoca=...&returnTo=...`
- `/dashboard/todo-msg`
- `/dashboard/statuses`

### API routes

- `GET /api/leads-dashboard`
- `GET /api/leads-dashboard/details?leadName=...&leadLoca=...`

## Widok listy leadów

Lista leadów pobiera dane z `GET /api/leads-dashboard` i pokazuje:

- numeryczny `leadKey`
- logiczną nazwę leada `leadName`
- status `Has contacts` / `No contacts`

Nazwa leada jest zwykłym tekstem. Ma dać się zaznaczać i kopiować. Wejście do szczegółów jest dostępne przez osobny link `info` przy nazwie leada. W zakładce `Leads` zachowano także stare wejście w details przez klik w część z ikoną i numerem.

## Widok szczegółów leada

Widok szczegółów pobiera dane z `GET /api/leads-dashboard/details` i pokazuje:

- `leadKey`
- `leadName`
- informację, czy lead ma kontakty
- sekcję `Contact Information`

Przycisk `Wstecz` działa na podstawie `returnTo` przekazanego w URL. Jeżeli `returnTo` jest obecne i jest lokalną ścieżką, widok wraca dokładnie do miejsca wejścia. Jeżeli nie ma `returnTo`, fallbackiem jest `/dashboard/leads`.

## Linkowanie z Todo msg i Statuses

`Todo msg` i `Statuses` nie tworzą osobnego widoku szczegółów. Obie zakładki używają tego samego helpera budującego route do `/dashboard/leads/details`, ale jako dodatkowego wejścia przez link `info`, bez zastępowania starych akcji widoków.

Zasada UX:

- nazwa leada jest zwykłym tekstem
- `Todo msg` zachowuje stare wejście do edytora msg workout przez klik w ikonę wiadomości i numer leada
- `Statuses` zachowuje stare wejście do status editora przez klik w ikonę `User` i numer leada
- `Leads` zachowuje stare wejście w details przez klik w część z ikoną i numerem
- link `info` obok nazwy otwiera details i tylko on dopina `returnTo`

Przykłady:

- wejście z `Statuses`: `/dashboard/leads/details?leadName=26-05-29_wf_Paulina_Heller&leadLoca=03%2F06%2F123&returnTo=%2Fdashboard%2Fstatuses`
- wejście z `Todo msg`: `/dashboard/leads/details?leadName=26-05-29_wf_Paulina_Heller&leadLoca=03%2F06%2F123&returnTo=%2Fdashboard%2Ftodo-msg`

## Renderowanie kontaktów jako klikalnych linków

Normalizacja kontaktów jest w `chad-dashbord/lib/lead-links.ts`.

Obsługiwane przypadki:

- `instagram`: pełny URL albo `https://instagram.com/<username>`
- `email`: `mailto:`
- `phone` / `telefon`: `tel:`
- `whatsapp`: pełny URL albo `https://wa.me/<digits>`
- `telegram`: pełny URL albo `https://t.me/<username>`
- `facebook`, `linkedin`, `www`, `website`, `strona www`: link zewnętrzny, jeśli da się zbudować bezpieczny URL

Jeżeli wartość nie daje się bezpiecznie zamienić na link, renderowana jest jako zwykły tekst. Parsowanie YAML `contacts` pozostaje po stronie `chad-dba/src/leads.ts`.

## Przepływ danych

1. UI listy wykonuje `fetch` do route API w `chad-dashbord`.
2. Route API jest cienkim wrapperem na funkcje publiczne z `chad-dba`.
3. `chad-dba` pobiera dane z Content Providera.
4. `chad-dba/src/leads.ts` zwraca dane gotowe do renderowania w dashboardzie.
5. UI buduje route do details przez wspólny helper i przekazuje `returnTo` tylko dla linku `info`.

## Zależności od Content Providera

Feature zależy od logicznej nawigacji po drzewie Content Providera.

Zasady:

- fizyczne foldery są numeryczne
- nazwy logiczne są trzymane w `config.yaml`
- kod nie powinien zgadywać fizycznych nazw folderów na podstawie logicznych nazw
- `contacts` są wyszukiwane po logicznej nazwie przez `GetByNames` albo `GetManyByName`

W praktyce:

- lista leadów korzysta z mapy `GetAllLeads()` i z `GetManyByName(..., "contacts")`
- details korzysta z `getLeadContacts(leadName)` zamiast budowania fizycznej ścieżki typu `leadLoca + '/contacts'`

## Cache i invalidation

Na ten moment feature nie ma osobnego trwałego cache serwerowego dla leadów.

- `GET /api/leads-dashboard` i `GET /api/leads-dashboard/details` pobierają dane świeżo przez funkcje `chad-dba`
- widoki trzymają dane lokalnie w stanie React tylko na czas życia strony
- przycisk `Refresh` wymusza ponowny `fetch`
- po wejściu i wyjściu z details nie ma dodatkowego mechanizmu invalidation poza zwykłym refetchem UI

## Edge cases

- brak `leadName` albo `leadLoca` w URL szczegółów zwraca błąd i pozwala wrócić do listy
- brak `returnTo` używa fallbacku `/dashboard/leads`
- niepoprawne `returnTo` spoza lokalnej ścieżki jest ignorowane
- stare akcje `Todo msg`, `Statuses` i głównego wejścia w `Leads` nie korzystają z `returnTo`
- brak `contacts` pokazuje `No contacts`
- pusty albo nieczytelny YAML kontaktów pokazuje `contactsError`
- pola kontaktowe bez bezpiecznej normalizacji są renderowane jako tekst

## Znane ograniczenia

- `returnTo` pamięta tylko jeden krok wstecz
- filtry `Todo msg` i `Statuses` nie są obecnie serializowane do URL, więc `returnTo` wraca do zakładki, ale nie odtwarza lokalnego stanu filtrów spoza query stringa
- parser kontaktów jest prosty i opiera się na liniach `key: value`, nie na pełnym parserze YAML

## Dalsze etapy

- serializacja filtrów zakładek do query stringa, żeby `returnTo` odtwarzało pełen stan widoku
- wydzielenie wspólnego komponentu ikonki wejścia do lead details
- ewentualny dedykowany cache dla listy leadów, jeśli odczyt z Content Providera stanie się kosztowny