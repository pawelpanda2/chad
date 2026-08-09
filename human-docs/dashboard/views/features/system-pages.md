# system-pages — migracja implementacji Dashboardu

## Cel

Stopniowe przenoszenie implementacji podstron Dashboardu do
`packages/dashboard/system-pages/`, uporządkowanych jak menu:

```
system-pages/
└── views/
    ├── reports/
    ├── dates-reports/
    └── shared/
```

Routing Next.js (`app/(dashboard)/dashboard/...`) zostaje kompatybilny —
`page.tsx` jest cienkim entrypointem.

## Uwaga o CP Folder `system-pages`

W danych użytkownika może istnieć pusty root Folder CP o nazwie
`system-pages`. To **nie** jest katalog kodu React i nie miesza się z tą
migracją (Story 113 nie przenosi danych do tego folderu).

## Zakres Story 113

Zmigrowano wyłącznie Views → Reports oraz dodano Views → Dates Reports.
Inne sekcje (Forms, Knowledge, …) — później.
