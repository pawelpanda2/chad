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
