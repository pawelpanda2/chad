# Per-user data isolation: `chad_[username]` and `repoGuid = userId`

Status: wdrożone i zweryfikowane lokalnie (Mac, non-Docker dev), 2026-07-12.

## 1. Problem

Przed tą zmianą **nie istniała żadna izolacja danych użytkowników**. Wszystkie
moduły dashboardu (Leads, Statuses, Msg Planner, Msg Todo, Msg Workout,
Beeper, Reports, Daily/Dates Entry, Views) korzystały z jednej,
zahardkodowanej stałej `SHARED_REPO_ID` (`21d11bdc-f1f4-44d1-b61a-3fa6b039c641`),
zduplikowanej w 3 plikach (`packages/dba/src/leads.ts`,
`packages/dashboard/lib/chad-dba/leads.ts` — martwy, nieużywany kod —
i `packages/dashboard/app/api/flow/cp-flow.ts`). ~90 wywołań w
`packages/dba/src/*.ts` odwoływało się do tej stałej bezpośrednio, bez
żadnego parametru identyfikującego użytkownika.

Istniała jedna, nieudana wcześniejsza próba per-user routingu
(`resolveRepoKey` w `cp-flow.ts`), ale była zepsuta: dostawała ID
użytkownika zamiast prawdziwego username, i dotyczyła tylko 2 z ~17
endpointów. Żywe, realnie używane endpointy (Daily Entry, Dates Entry,
Views, Leads, Statuses, itd.) całkowicie ją omijały.

## 2. Ważna korekta modelu Content Providera (błąd popełniony w trakcie pracy)

Pierwsza wersja planu zakładała fizyczne przenoszenie danych Pawła pod nowy
folder `chad_pawel_f` z rekurencyjnym przepisaniem adresów w całym drzewie —
**błędne założenie**. Content Provider nie ma fizycznych folderów o nazwach
logicznych:

```
repos/
└── <repo-guid>/          ← identyfikator repo to WYŁĄCZNIE GUID
    ├── config.yaml        (name: "...", tu żyje nazwa logiczna)
    ├── 00/                ← foldery fizyczne są WYŁĄCZNIE numeryczne
    ├── 01/
    └── ...
```

„Zmiana nazwy" to więc czysto metadanowa operacja: edycja pola `name` w
`config.yaml` danego repo/itemu — **zero przenoszenia danych, zero
przepisywania adresów, zero zmiany GUID**.

## 3. Decyzja: `repoGuid = userId`, jedno pole

Zamiast osobnych pól `id` (identyfikator konta) i `repoGuid` (repo danych),
które mogłyby się rozjechać — **jedno pole `repoGuid`**, pełniące obie role:

```yaml
# chad_admin, body.txt
# repoGuid = userId. One field, not two.
users:
  - repoGuid: "21d11bdc-f1f4-44d1-b61a-3fa6b039c641"
    username: "pawel_f"
    ...
  - repoGuid: "8b603669-f8e6-4224-bd78-a474998995fa"
    username: "kamil_s"
    ...
```

Cookie sesji (`session=<repoGuid>:<timestamp>`) zawiera więc bezpośrednio
repoGuid — żadnego dodatkowego mapowania nie trzeba przechowywać osobno.
`resolveCurrentUser()` (w `lib/user-service.ts`) waliduje tę wartość
przeciwko realnej liście w `chad_admin` (nigdy nie ufa cookie w ciemno) —
sfałszowany/dowolny GUID w cookie nie rozwiąże się do żadnego użytkownika,
więc nie da dostępu do cudzego repo (zweryfikowane: `curl` z losowym GUID w
cookie → `401 NOT_AUTHENTICATED`).

## 4. Zmiany nazw (metadanowe, bez ruchu danych)

| Element | Adres | Stara nazwa | Nowa nazwa |
|---|---|---|---|
| Lista użytkowników | `0fc7da8d-.../01/01` | `users-list` | `chad_admin` |
| Repo Pawła | `21d11bdc-f1f4-44d1-b61a-3fa6b039c641` (root) | `pawel_f` | `chad_pawel_f` |
| Repo Kamila | `8b603669-f8e6-4224-bd78-a474998995fa` (root) | `kamil_s` | `chad_kamil_s` |

Reguła na przyszłość: **nazwa repo (root `config.yaml`'s `name`) = `chad_[username]`**,
ale routing kodu opiera się na `repoGuid` (przechowywanym w `chad_admin`),
nie na wyszukiwaniu repo po nazwie — nazwa jest czysto opisowa/dla
człowieka (np. w panelu Folders), nie mechanizmem nawigacyjnym.

## 5. Bezpieczny, współbieżny request-scoped kontekst (AsyncLocalStorage)

Zamiast wątkować nowy parametr `repoGuid` przez ~70 eksportowanych funkcji w
`packages/dba/src/*.ts` (ogromny, ryzykowny diff), użyto **Node.js
`AsyncLocalStorage`** — nowy moduł `packages/dba/src/repo-context.ts`:

```ts
export function runWithRepoContext<T>(context, fn): Promise<T>
export function getCurrentRepoGuid(): string   // throws if no context
export function getCurrentUsername(): string   // throws if no context
```

Zwykła mutowalna zmienna modułowa byłaby **niebezpieczna** — współdzielona
przez wszystkie równoległe requesty w tym samym procesie Next.js, więc dwa
nakładające się w czasie requesty różnych użytkowników mogłyby czytać/pisać
nawzajem swoje dane. `AsyncLocalStorage` daje każdemu łańcuchowi async requestu
osobny, izolowany kontekst — to standardowy, bezpieczny wzorzec do tego w
Node.js.

`getCurrentRepoGuid()`/`getCurrentUsername()` **rzucają wyjątek**, jeśli
zostaną wywołane poza `runWithRepoContext(...)` — świadomie, żeby pominięty
endpoint failował głośno (500, widoczne od razu w testach) zamiast po cichu
przeciekać dane jednego użytkownika do drugiego.

Wszystkie miejsca w `packages/dba/src/{leads,beeper,reports,
statuses-dashboard,ai-answer,path-resolver}.ts` odwołujące się wcześniej do
`SHARED_REPO_ID` teraz wołają `getCurrentRepoGuid()`.

`packages/dashboard/app/api/flow/cp-flow.ts` (osobny, samodzielny moduł, nie
korzystający z pakietu `dba`) używa równoważnego, jawnego wzorca: `repoGuid:
string` jako parametr przekazywany explicite przez każdą funkcję — równie
bezpieczne dla współbieżności, tylko inny styl implementacji, celowo
niescalony z `AsyncLocalStorage` (dwa niezależne moduły, nie ma potrzeby
wymuszać jednolitości).

## 6. `lib/session.ts` — jeden punkt wejścia dla wszystkich route'ów

```ts
export async function getCurrentUserFromCookies(): Promise<{ repoGuid: string; username: string } | null>
```

Każdy z 17 endpointów API dotykających danych Content Providera (Leads,
Beeper, Statuses, Msg Planner, Msg Todo, Msg Workout, Daily/Dates Entry,
Views, Folders, Forms) wywołuje to na początku handlera, zwraca `401
NOT_AUTHENTICATED` jeśli `null`, i owija resztę logiki w
`runWithRepoContext(user, async () => { ... })`.

## 7. Lazy initialization

Nie tworzy się z góry żadnej struktury dla nowego użytkownika. Content
Provider's `PostByNames`/`PostParentItem` (już istniejące, sprawdzone
metody — bez zmian w ich logice) same tworzą brakujące foldery/itemy przy
pierwszym użyciu, wybierając kolejny wolny numeryczny slot — potwierdzone
realnie: `kamil_s`'s repo miał już wcześniej zawartość pod folderem `02`
(`forms`/`actions`, nieznanego pochodzenia, pozostawiona nietknięta); nowa
struktura `leads/all items/...` powstała pod folderem `03`, bez kolizji.

Idempotencja potwierdzona: powtórne pobranie leadów Kamila po utworzeniu
jednego testowego leada nadal zwraca dokładnie 1 pozycję (nie tworzy
duplikatu przy ponownym wejściu).

## 8. Testy wykonane (lokalnie, Mac, real Content Provider + real Dropbox data)

| Test | Wynik |
|---|---|
| Login `pawel_f`/`changeme` | `repoGuid: 21d11bdc-...` w cookie i odpowiedzi |
| Login `kamil_s`/`changeme` | `repoGuid: 8b603669-...` w cookie i odpowiedzi |
| Leads `pawel_f` | 66 realnych leadów, bez zmian |
| Leads `kamil_s` (przed utworzeniem czegokolwiek) | `[]`, HTTP 200, brak crasha |
| Utworzenie test leada jako `kamil_s` | sukces, `loca: 03/01/01` |
| Leads `kamil_s` po utworzeniu | dokładnie 1 pozycja |
| Leads `pawel_f` po akcji Kamila | nadal 66, **bez** leada Kamila (izolacja zapisu) |
| Ponowne pobranie leadów `kamil_s` | nadal 1 (idempotencja) |
| Views (Daily/Dates) `kamil_s` | puste, `success:true`, brak crasha |
| Views `pawel_f` | realne dane, bez regresji |
| Statuses, Todo-msg `pawel_f` (smoke test) | działają, realne dane |
| Sfałszowany/losowy GUID w cookie sesji | `401 NOT_AUTHENTICATED` (nie przecieka do żadnego repo) |
| `pnpm --filter dba build` | czysto, bez błędów |
| `pnpm --filter dashboard build` (`next build`, pełny typecheck) | czysto, bez błędów |

## 9. Zmienione pliki

**Dane Content Providera** (bezpośrednio w `~/Dropbox/repos/`, synchronizowane
też na QNAP):
- `0fc7da8d-.../01/01/config.yaml` — `name: "users-list"` → `"chad_admin"`
- `0fc7da8d-.../01/01/body.txt` — pole `id` → `repoGuid` (= GUID repo
  użytkownika), naprawiony duplikat ID dla `test3`/`test2`
- `21d11bdc-.../config.yaml` — `name: "pawel_f"` → `"chad_pawel_f"`
- `8b603669-.../config.yaml` — `name: "kamil_s"` → `"chad_kamil_s"`

**Kod** (`packages/dba/src/`): nowy `repo-context.ts`; `index.ts`
(re-export); `leads.ts`, `beeper.ts`, `reports.ts`, `statuses-dashboard.ts`,
`ai-answer.ts`, `path-resolver.ts` (SHARED_REPO_ID → getCurrentRepoGuid());
`client.ts` (martwa funkcja `getUsersList()` — literal string fix).

**Kod** (`packages/dashboard/`): nowy `lib/session.ts`; `lib/user-service.ts`
(`CpUser.id` → `CpUser.repoGuid`, nowa `resolveCurrentUser()`);
`app/api/auth/login/route.ts`; `app/api/flow/cp-flow.ts` (usunięty zepsuty
`resolveRepoKey`, funkcje przyjmują `repoGuid: string` wprost); 17 route'ów
API owiniętych w `runWithRepoContext`/przekazujących `repoGuid` (pełna lista:
`beeper/conversation/[leadName]`, `beeper/leads`, `forms/lead`,
`leads-dashboard`, `leads-dashboard/details`, `leads-dashboard/msg-workout`,
`leads/msg-workout`, `msg-planner`, `statuses`, `statuses/edit`, `todo-msg`,
`todo-msg/edit`, `views`, `forms/daily-entry`, `forms/date-entry`,
`forms/action`, `folders`).

**Nie zmieniono** (świadomie, poza zakresem tego zadania):
- `packages/dashboard/lib/chad-dba/*` — potwierdzony martwy/osierocony kod
  (niezaimportowany nigdzie), pozostał nietknięty.
- `/api/auth/session` (odpytuje tabelę Prisma `User`, której ID nigdy nie
  zgadzają się z Content Providerem) — potwierdzony, wcześniej istniejący
  bug, niezwiązany z tą zmianą, świadomie nienaprawiony (użytkownik
  poprosił, żeby nie robić dużej przebudowy auth).

## 10. Ograniczenia i co dalej

- **Provisioning nowego użytkownika (poza `pawel_f`/`kamil_s`) wymaga
  ręcznego kroku**: Content Provider odkrywa repo skanując
  `/share/Dropbox/repos/<guid>/` **przy starcie procesu** — nie ma API do
  utworzenia nowego repo w locie. `kamil_s` mógł dostać izolację "za darmo"
  tylko dlatego, że jego repo (`8b603669-...`) już istniało na dysku jako
  jeden z 36 odkrytych repo. Dla zupełnie nowego użytkownika trzeba: (1)
  ręcznie utworzyć folder `<nowy-guid>/config.yaml` na dysku, (2) zrestartować
  Content Provider API, żeby go odkrył, (3) dodać wpis w `chad_admin` z tym
  `repoGuid`. "Lazy initialization" dotyczy tylko *itemów wewnątrz* już
  istniejącego repo użytkownika (leads, reports, itd.), nie samego repo.
- `test3`/`test2` (konta bez `repoGuid` wskazującego na realne repo)
  celowo pozostawione jako "nieaprowizowane" — logowanie zadziała (hasło
  się zgadza), ale każdy odczyt/zapis danych zwróci błąd Content Providera
  (nieistniejące repo), nie cichy fallback do danych innego użytkownika.
- Testowano wyłącznie lokalnie (Mac, non-Docker dev server + lokalny
  kontener `chad-content-provider-api` wskazujący na prawdziwy
  `/Users/pawelfluder/Dropbox`). Dane synchronizują się przez Dropbox, więc
  te same zmiany metadanowe są już widoczne też na QNAP — **ale kod
  dashboardu na QNAP nie został jeszcze wdrożony/zbudowany z tymi
  zmianami** (wymaga osobnego `deploy_test`/`deploy_prod` — nie wykonano w
  ramach tego zadania, zgodnie z prośbą o testowanie najpierw lokalnie).
