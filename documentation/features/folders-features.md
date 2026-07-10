# Folders Feature

Dokument opisuje zakładkę "Folders" w dashboardzie, która służy do przeglądania danych z Content Provider.

## Overview

Zakładka "Folders" pozwala na wizualny podgląd struktury Content Provider dla formularzy (action, lead). Dane są czytane wyłącznie z Content Provider API, bez fallbacku do SQLite/Prisma.

## Route

```
/dashboard/folders
```

## Architecture

### Komponenty

| Plik | Opis |
|------|------|
| `app/(dashboard)/dashboard/folders/page.tsx` | Główna strona Folders |
| `app/api/folders/route.ts` | API endpoint do odczytu danych |
| `lib/form-storage.ts` | Funkcja `getFormsFolderStructure()` |

### Struktura danych

Dane są przechowywane w Content Provider zgodnie z pattern:

```
getByNames(userGuid, ["forms"], [formName], [recordKey])
```

Fizyczna struktura:
```
cp-root/repos/<userGuid>/
  01/ (name: "forms")
    01/ (name: "action")
      <recordKey>/
        body.yaml
    02/ (name: "lead")
      <recordKey>/
        body.yaml
```

### API Endpoint

```
GET /api/folders?userGuid=<guid>
```

Response (success):
```json
{
  "userGuid": "3c315f8e-6b14-46ab-9d5d-147efef6bde6",
  "formsFolder": {
    "name": "forms",
    "address": "01",
    "type": "Folder",
    "children": [...]
  },
  "actionRecords": [
    {
      "recordKey": "260610_191531",
      "body": {
        "actionTitle": "26-06-10_dg_galeria",
        "actionType": "dg",
        "actionStartTime": "19:15",
        ...
      }
    }
  ],
  "leadRecords": [...]
}
```

Response (error):
```json
{
  "error": "Content Provider API unavailable",
  "details": "...",
  "debug": {
    "apiUrl": "http://localhost:12024",
    "userGuid": "...",
    "attemptedPath": "repos/.../forms/"
  }
}
```

## UI Layout

### Header
- Tytuł: "Folders"
- Podtytuł: "Przeglądanie struktury Content Provider"
- Przycisk "Odśwież"

### User Repository Card
- GUID użytkownika
- Ścieżka do repozytorium (`repos/<guid>/01/`)

### Forms Card
- Sekcja "action" z listą rekordów
- Sekcja "lead" z listą rekordów

### Empty State
Jeśli brak danych:
```
Brak zapisanych rekordów formularzy dla tego użytkownika.
```

### Error State
Jeśli Content Provider API niedostępne:
- Czerwony alert "Content Provider API unavailable"
- Szczegóły błędu
- Debug info (API URL, userGuid, attempted path)
- Przycisk "Spróbuj ponownie"

## Record Display

### Action Records
Dla każdego rekordu pokazuj:
- `actionTitle` (główny tekst)
- `actionTypeLabel` (daygame/nightgame)
- `actionStartTime`
- `recordKey` jako badge

### Lead Records
Dla każdego rekordu pokazuj:
- `name` (główny tekst)
- `source` (źródło)
- `status`
- `recordKey` jako badge

## Zasady

1. **Read-only**: Strona służy tylko do przeglądania, bez edycji/usuwania
2. **No SQLite fallback**: Dane pochodzą wyłącznie z Content Provider
3. **Jawne błędy**: Jeśli CP API nie działa, pokazuj błąd, nie pustą listę
4. **No fake data**: Nie maskuj błędów alternatywnymi danymi

## Feature Checklist

- [x] Route `/dashboard/folders` istnieje
- [x] Sidebar link "Folders" dodany
- [x] API endpoint `/api/folders` czyta z Content Provider
- [x] Funkcja `getFormsFolderStructure()` w `lib/form-storage.ts`
- [x] Pokazuje userGuid
- [x] Pokazuje forms/action records
- [x] Pokazuje forms/lead records
- [x] Rekordy identyfikowane przez `YYMMDD_HHMMSS`
- [x] Dane read-only
- [x] Brak fallbacku do SQLite
- [x] Błędy CP API są jawne
- [x] Empty state dla braku danych
- [x] Error state dla niedostępnego API
- [x] Dokumentacja w `architecture/features/folders-features.md`