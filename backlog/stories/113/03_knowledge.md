# Story 113 — Knowledge

## Reports (wzorzec)

- UI: `views/page.tsx` → `?view=reports` (Story 102: kategorie root `reports`).
- API: `/api/reports/categories`, `/api/reports?category=`, `/api/reports/item?address=`.
- DBA: `report-browse.ts`; save: `updateReportEntry` via `/api/forms/reports`.

## Dates vs randki

| Path | Rola |
|------|------|
| `views/dates` | Tracker YAML (Views → DATES) |
| root `randki` | Free-text raporty z randek (Text + Folder z `report`/`before`/`after`) |
| root `reports` | Daygame/nightgame categories (Views → REPORTS) |
| root `system-pages` | Pusty Folder CP utworzony przez użytkownika — **nie** katalog React |

## system-pages (kod)

`packages/dashboard/system-pages/views/…` — implementacja widoków; routing Next zostaje pod `/dashboard/views`.
