# Story 113 — Plan

1. **Źródło danych Dates Reports:** zweryfikowano na QNAP Postgres — raporty z randek żyją w root Folder **`randki`** (nie w `views/dates`, który jest YAML trackerem). UI label: "Dates Reports".
2. **system-pages w kodzie:** w CP istnieje pusty Folder `system-pages` (bez dzieci); w `packages/dashboard` folderu kodu nie było — tworzymy `packages/dashboard/system-pages/views/{reports,dates-reports}/` + cienki `views/page.tsx`.
3. **DBA:** `listDateReports` / `getDateReportByAddress` przez `resolveByNames(["randki"])` + izolacja repo; Folder children otwierają zagnieżdżony Text `report` gdy istnieje.
4. **API:** `/api/views/dates-reports` (+ `/item`); save przez istniejący `POST /api/forms/reports` (loca Text).
5. **Shared:** mały shell listy/editora bez flag-monster.
6. Testy DBA + smoke UI lokalnie po Docker rebuild.
