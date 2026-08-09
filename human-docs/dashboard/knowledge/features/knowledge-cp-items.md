# Knowledge — cp_items-backed content (Story 96)

Status: implemented and verified in local Docker 2026-07-31 (Story 96).

## Cel

Zakładka Dashboard → Knowledge pokazuje realne dane z Content Providera
zamiast statycznych tablic w komponentach. Wygląd (kafelki, ramki sekcji,
layout) pozostał ten sam co w statycznej wersji — zmieniło się wyłącznie
źródło danych.

## Źródło danych — wspólne repo `chad_shared`

- `chad_shared` to zwykłe repo CP (wiersz `cp_items` z adresem będącym
  gołym repoGuid), analogiczne do `chad_admin`:
  - repoGuid: `31275a71-3dd0-41a2-8874-2d12dac01590`
    (`CHAD_SHARED_REPO_GUID` w `packages/dba/src/knowledge.ts` — GUID
    wygenerowany raz w Story 96; wcześniej repo nie istniało).
  - utworzone idempotentnie przez
    `packages/dba/scripts/ensure-shared-knowledge.mjs`
    (find-or-create, nigdy nie nadpisuje istniejących dzieci).
- Struktura:

```text
chad_shared
└── knowledge                Folder — stały korzeń
    └── <kategoria>          Folder — kafelek w menu Knowledge
        └── <sekcja>         Folder — nagłówek ramki w widoku kategorii
            └── <dokument>   Text   — wiersz dokumentu; body = treść
```

- Kolejność = kolejność numerycznych adresów CP (kolejność dodania),
  nigdy sortowanie alfabetyczne.
- Etykiety pochodzą z `config.name` Itemu; URL-e używają slugów
  wyprowadzanych z nazwy (`slugifyKnowledgeName` — lowercase, myślniki,
  zdjęte polskie znaki; duplikaty rozróżniane sufiksem indeksu CP).

## Przepływ danych

```text
Knowledge UI (client pages)
→ GET /api/knowledge[/ [category][/ [document]]]   (cienkie route'y, force-dynamic)
→ packages/dba/src/knowledge.ts
→ getDataRouter() → PostgresCpProvider → cp_items
```

- `listKnowledgeCategories()` — kafelki menu (dzieci Folder `knowledge`).
- `getKnowledgeCategory(slug)` — sekcje + dokumenty jednej kategorii;
  całe poddrzewo pobierane JEDNYM zapytaniem
  (`findRecursively(categoryAddress, "")` — pusta fraza = match-all),
  bez N+1 per sekcja.
- `getKnowledgeDocument(categorySlug, documentSlug)` — nazwa + body.
- Slugi walidowane (`^[a-z0-9][a-z0-9-]{0,79}$`) PRZED jakimkolwiek
  odczytem — path traversal / dowolne adresy CP z klienta są niemożliwe;
  backend rozwiązuje wszystko wyłącznie wewnątrz `chad_shared/knowledge`.
- Brak kategorii/dokumentu → kontrolowane 404 (`CATEGORY_NOT_FOUND` /
  `DOCUMENT_NOT_FOUND`), zły slug → 400, brak sesji → 401.

## Frontend (routing dynamiczny)

- `app/(dashboard)/dashboard/knowledge/page.tsx` — kafelki z API
  (ten sam grid `grid-cols-4 gap-2` co wcześniej; loading/empty/error).
- `knowledge/[category]/page.tsx` — zastąpił statyczny
  `knowledge/verbal-game/page.tsx`; te same tokeny layoutu
  (`LIST_ROW_WRAPPER_CLASS`, `LIST_ROW_CLASS`, `FRAME_SECTION_GAP_CLASS`,
  grid `md:grid-cols-2`), wiersze dokumentów są linkami.
- `knowledge/[category]/[document]/page.tsx` — widok dokumentu
  (nazwa + body, `whitespace-pre-wrap`), wyłącznie do odczytu — edycja
  odbywa się w Folders, nie w Knowledge.
- Żadnych statycznych GROUPS/kategorii w komponentach; nowa kategoria
  dodana w Folders pojawia się bez zmiany kodu frontendu.

## Cache

Route'y `/api/knowledge/**` mają `dynamic = "force-dynamic"`, a klient
fetchuje z `cache: "no-store"` — po dodaniu/zmianie Itemu w Folders
odświeżenie strony pokazuje aktualny stan, bez trwałego cache.

## Folders — wybór chad_shared (kontrolowany wyjątek od izolacji)

- `GET /api/folders/repos` zwraca listę wyprowadzoną z sesji
  (`listSelectableFoldersRepos` w dba): własne repo każdego użytkownika +
  `chad_shared` wyłącznie dla sesji admina (`role: admin` w users-list —
  ten sam istniejący guard co przy `allowSystemFolderWrite`).
- Każdy verb `/api/folders` (GET/POST/PUT/DELETE) i `/api/folders/config`
  przyjmuje opcjonalny `repoGuid` i waliduje go NIEZALEŻNIE przez
  `resolveFoldersRepoAccess` (dba): własne repo zawsze; `chad_shared`
  tylko admin; wszystko inne (cudze repo, zmyślony GUID) → 403.
  Dropdown w UI nie jest punktem egzekwowania uprawnień.
- Zapis admina w `chad_shared` przechodzi przez istniejące operacje
  Folders (`createFolderChildItem` itd.) — zapisane Itemy pojawiają się w
  Knowledge po odświeżeniu.

## Edge cases

- brak repo/korzenia `knowledge` → puste menu (200 + `[]`), nie błąd;
- pusta kategoria → komunikat "brak sekcji"; pusta sekcja → "Brak
  dokumentów"; pusty body → komunikat zamiast pustej ramki;
- zmiana nazwy Itemu zmienia slug (stary URL daje kontrolowane 404);
- zduplikowane nazwy → deterministyczne slugi z sufiksem indeksu CP.

## Testy

- `packages/dba/src/knowledge.test.ts` — mapper/slugi/kolejność/empty/404
  (czyste, fake-ops).
- `packages/dba/src/shared-repo-access.test.ts` — macierz uprawnień repo.
- Realny smoke (local Docker, 2026-07-31): menu → kategoria → dokument;
  create w chad_shared przez Folders (admin) → widoczny w Knowledge →
  delete → 404; test3: brak chad_shared na liście, 403 na select/edit,
  403 na cudze repo, własny Folders działa bez zmian.

## Ograniczenia / dalsze etapy

- Dokumenty utworzone w Story 96 (struktura Verbal Game przeniesiona ze
  statycznego mockupu) mają puste body — treść uzupełnia właściciel przez
  Folders.
- Kolumna "kind" (dokument/ćwiczenie/tematy) ze statycznej wersji nie ma
  odpowiednika w modelu CP — wiersze pokazują stałą etykietę "dokument".

## Update — arbitrary-depth catch-all routing + Story 114 intelligent grid

Sekcja "Frontend (routing dynamiczny)" powyżej opisuje stan Story 96
(fixed `[category]` + `[category]/[document]`, 2 poziomy). Od tego czasu
routing i layout zmieniły się dalej:

- **Routing:** realne drzewa knowledge nie zawsze mają dokładnie 2 poziomy
  (kategoria → sekcja → dokument) — niektóre schodzą 5+ poziomów głębiej.
  `knowledge/[category]/page.tsx` +
  `knowledge/[category]/[document]/page.tsx` zostały zastąpione jednym
  catch-all `knowledge/[category]/[[...path]]/page.tsx` (analogicznie
  `/api/knowledge/[category]/[[...path]]`) — `path` to dowolnie głęboki
  łańcuch slugów, backend rozstrzyga czy dany węzeł to Folder czy Text.
  Karta-gridu potrafi się więc powtarzać rekurencyjnie na każdym poziomie
  zagnieżdżenia, nie tylko raz pod kategorią.
- **Layout (Story 114, Task 2):** karta-gridu w widoku Folder miała
  wcześniej sztywny `grid-cols-1 md:grid-cols-2` i `truncate` na wierszach
  (bez zawijania, bez capu wysokości). Zastąpione "inteligentnym" układem:
  - do 3 kolumn, wybierane w locie wg realnie dostępnej szerokości (bez
    sztywnych breakpointów) — `packages/dashboard/lib/knowledge-layout.ts`
    (`chooseColumnsAndWidths`, testy w `knowledge-layout.test.ts`);
  - każda kolumna liczy własną szerokość ze średniej długości tekstów,
    które do niej trafiają (+30% zapasu, min/max klamra, max ~400px);
  - normalne długie nazwy zawijają się (`whitespace-normal break-words`)
    zamiast `truncate`; pojedynczy nie-łamliwy token (>42 znaków bez
    spacji) dostaje lokalne przyciski `‹ ›` przesuwające tylko tekst tego
    wiersza (`components/shared/knowledge-grid-row.tsx`);
  - wysokość karty: wyłącznie per-karta, niezależnie od sąsiadów —
    wszystkie wpisy widoczne do `maxVisibleRowsBeforeScroll` (10); dopiero
    powyżej 10 karta dostaje cap do 10 wierszy + własny
    `overflow-y-auto`/`maxHeight` (`computeRowCaps`, bez żadnego
    uśredniania z sąsiednimi kartami czy pojęcia "wizualnego wiersza");
  - `items-start` na gridzie — karty NIE są rozciągane do wysokości
    najwyższej karty w tym samym rzędzie CSS Grid, więc tytuły w różnych
    kolumnach nie muszą być na tym samym poziomie;
  - pomiar realnej szerokości tekstu (DOM probe-span) + `ResizeObserver`
    kontenera: `components/shared/use-knowledge-grid-layout.ts`.
  - Card visuals (`LIST_ROW_WRAPPER_CLASS`/`LIST_ROW_CLASS`, ikony
    Folder/Text, `DashboardPageShell`, Back/Forw/up-level) — bez zmian;
    zmienił się wyłącznie algorytm rozmieszczenia.
  - Referencyjna makieta: `examples/knowledge_v2_clean_no_debug_mockup.html`.
    Zamrożony "przed" snapshot starego wyglądu (statyczne mocki, bez
    fetchowania `/api/knowledge`): `/dashboard/examples` →
    `Knowledge v1` (`app/(dashboard)/dashboard/examples/knowledge-v1/page.tsx`).
