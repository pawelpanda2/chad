# Views → Dates Reports

## Cel

Osobny widok listy raportów z randek (GUI jak Views → Reports), bez mieszania
z Views → DATES (tabela trackera) ani z Views → REPORTS (kategorie daygame).

## URL

`/dashboard/views?view=dates-reports`  
Otwórz raport: `&report=<loca>` (ten sam parametr co Reports).

## Implementacja (system-pages)

- UI: `packages/dashboard/system-pages/views/dates-reports/`
- Wspólny shell: `packages/dashboard/system-pages/views/shared/text-reports-browser.tsx`
- Cienki entry: `app/(dashboard)/dashboard/views/page.tsx`

## Dane

Źródło: root Folder Content Providera **`randki`** (nie `views/dates`).

- DBA: `listDateReports` / `getDateReportByAddress` (`packages/dba/src/date-reports.ts`)
- API: `GET /api/views/dates-reports`, `GET /api/views/dates-reports/item?address=`
- Save: istniejący `POST /api/forms/reports` z `loca` Text itemu (dla Folder —
  zwykle zagnieżdżony Text `report`)
- Izolacja: `runWithRepoContext` + adres musi być bezpośrednim dzieckiem
  `randki` bieżącego repo

## Empty vs error

- Brak folderu / brak dzieci → empty: „No date reports found (dates / randki).”
- Błąd API → `ErrorBox`, nie wygląda jak pusta lista
