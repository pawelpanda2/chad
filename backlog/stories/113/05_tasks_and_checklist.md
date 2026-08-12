# Story 113 — Tasks & Checklist

Baseline przed AI: `a8c87b1`. WIP Story 112 pozostawione nienaruszone.

## Task 1 — Dates Reports

- [x] Przycisk DATES REPORTS w Views
- [x] Widok GUI jak Reports (shared `TextReportsBrowser`)
- [x] Dane z root `randki` (zweryfikowane na QNAP; nie `views/dates`)
- [x] DBA + API + izolacja adresu pod `randki`
- [x] loading / empty / error
- [x] Kolejność provider order (bez sortu alfa)

## Task 2 — system-pages

- [x] `packages/dashboard/system-pages/views/reports/`
- [x] `packages/dashboard/system-pages/views/dates-reports/`
- [x] URL `/dashboard/views?view=reports` bez zmian
- [x] Brak duplikatu pełnej implementacji Reports w `views/page.tsx`
- [x] Nie migrowano innych sekcji / danych

## Testy / Docker / commit

- [x] `date-reports` + `report-browse` + UI system-pages (21 tests PASS)
- [x] Lokalny Docker: `06_deploy.sh` → image `chad-dashboard:260809_215518`; API 401 unauth / 200 auth; test3 empty list OK; chunk zawiera Dates Reports + ReportsView
- [x] Commit końcowy (bez push): `dac5fa7`
