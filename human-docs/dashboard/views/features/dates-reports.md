# Views → Dates Reports

## Cel

Osobny widok listy raportów z randek (GUI jak Views → Reports), bez mieszania
z Views → DATES (tabela trackera) ani z Views → REPORTS (kategorie daygame).

## URL

`/dashboard/views?view=dates-reports`  
- Text na liście: `&report=<loca>` → edytor (jak Reports).
- Folder na liście: `&report=<loca>` → lista części (before / after / report …) **po prawej**.
- Część w Folderze: `&report=<folderLoca>&part=<partLoca>` → edytor tej części.

## Implementacja (system-pages)

- UI: `packages/dashboard/system-pages/views/dates-reports/`
- Wspólny shell: `packages/dashboard/system-pages/views/shared/text-reports-browser.tsx`
- Cienki entry: `app/(dashboard)/dashboard/views/page.tsx`

## Dane

Źródło: root Folder Content Providera **`randki`** (nie `views/dates`).

- DBA: `listDateReports` / `listDateReportChildren` / `getDateReportTextByAddress`
  (`packages/dba/src/date-reports.ts`)
- API: `GET /api/views/dates-reports`, `…/children?address=`, `…/item?address=`
- Save: istniejący `POST /api/forms/reports` z `loca` Text itemu
- Izolacja: `runWithRepoContext` + adres pod `randki` bieżącego repo
- **Kolejność listy głównej:** newest-first (reverse providera)
- **Części Folderu:** kolejność providera (before / report / after …)

## Źródło bazy przy weryfikacji

LOCAL domyślnie czyta Server PostgreSQL (QNAP) przez Tailscale — nie lokalny
volume Dockera. Patrz `ai-docs/begin_here/01_ai_start.md` (Błąd A) i
`ai-docs/databases/red-rules.md` Rule 1.

## Empty vs error

- Brak folderu / brak dzieci → empty: „No date reports found (dates / randki).”
- Błąd API → `ErrorBox`, nie wygląda jak pusta lista
