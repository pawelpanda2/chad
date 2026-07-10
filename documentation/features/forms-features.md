# Forms Features - Action & Lead

Dokument opisuje standard zapisu formularzy w aplikacji personal-dashboard.

## Overview

Formularze w aplikacji służą do zapisywania:
- **action** (wyjście) - sesje, daygame, nightgame, randki, imprezy
- **lead** (kontakt) - kontakty z akcji lub innego źródła

## Storage Standard

### Architektura

Formularze są zapisywane w strukturze Content Provider zgodnie z pattern:

```
getByNames(userGuid, ["forms"], [formName], [recordKey])
```

Gdzie:
- `userGuid` - GUID użytkownika (służy jako repo ID)
- `forms` - stała nazwa logiczna dla folderu formularzy
- `formName` - nazwa formularza (`action` lub `lead`)
- `recordKey` - unikalny klucz w formacie `YYMMDD_HHMMSS`

### Struktura fizyczna

```
cp-root/repos/<userGuid>/
  01/ (name: "forms")
    01/ (name: <formName>)
      <recordKey>/
        config.yaml
        body.yaml
```

Przykład dla action:
```
cp-root/repos/3c315f8e-6b14-46ab-9d5d-147efef6bde6/
  01/ (name: "forms")
    01/ (name: "action")
      260610_191531/
        config.yaml
        body.yaml
```

### body.yaml format

Każdy rekord formularza zawiera:
- `formName` - nazwa formularza
- `userGuid` - GUID użytkownika
- `createdAt` - timestamp utworzenia (ISO)
- `recordKey` - unikalny klucz (YYMMDD_HHMMSS)
- ...dane specyficzne dla formularza

## Feature: Action Form

### Nazwa formularza
- **Form key:** `action`
- **UI label:** `action (wyjście)`

### Auto-Title Generation

Tytuł jest generowany automatycznie w formacie:

```
YY-MM-DD_<dg|ng>[_suffix]
```

Przykłady:
- `26-06-10_dg`
- `26-06-10_dg_galeria`
- `26-06-10_ng_klub`

Komponenty:
1. **Data** - w formacie `YY-MM-DD` (np. `26-06-10`)
2. **Typ** - `dg` (daygame) lub `ng` (nightgame)
   - Domyślnie: `dg`
3. **Suffix** - opcjonalny dopisek (np. nazwa miejsca)

### Start Time

Czas wyjścia:
- Automatycznie ustawiany na moment otwarcia formularza
- Pole readonly (nieedytowalne ręcznie)
- Format: `HH:MM`

### Time Adjustment Buttons

Dwa przyciski obok czasu wyjścia:
- `-15 min` - cofa czas o 15 minut
- `+15 min` - przesuwa czas o 15 minut do przodu

Przykład:
- Otwarcie formularza o 19:15 → domyślny czas: 19:15
- Klik `+15 min` → czas: 19:30
- Klik `-15 min` → czas: 19:00

### Action Form Fields

| Pole | Typ | Wymagane | Opis |
|------|-----|----------|------|
| actionTitle | string | tak (auto) | Tytuł generowany automatycznie |
| actionDate | string | tak | Data w formacie YY-MM-DD |
| actionType | "dg" \| "ng" | tak | Typ wyjścia |
| actionTypeLabel | "daygame" \| "nightgame" | tak | Pełna nazwa typu |
| optionalTitleSuffix | string | nie | Dopisek do tytułu |
| actionStartTime | string | tak | Czas wyjścia (HH:MM) |
| actionStartDateTime | string | tak | Pełny datetime |
| description | string | tak | Opis co się działo |
| notes | string | nie | Dodatkowe notatki |

### Record Data Structure

```yaml
formName: action
userGuid: 3c315f8e-6b14-46ab-9d5d-147efef6bde6
createdAt: "2026-06-10T19:15:31+02:00"
recordKey: 260610_191531
actionTitle: "26-06-10_dg_galeria"
actionDate: "26-06-10"
actionType: dg
actionTypeLabel: daygame
optionalTitleSuffix: galeria
actionStartTime: "19:15"
actionStartDateTime: "26-06-10T19:15:00"
description: "Dobra sesja, 3 numery"
notes: ""
```

## Feature: Lead Form

### Nazwa formularza
- **Form key:** `lead`
- **UI label:** `Dodaj kontakt / lead`

### Lead Form Fields

| Pole | Typ | Wymagane | Opis |
|------|-----|----------|------|
| name | string | tak | Imię |
| age | number | nie | Wiek |
| source | string | tak | Źródło (daygame, club, tinder...) |
| phone | string | nie | Numer telefonu |
| instagram | string | nie | Instagram handle |
| facebook | string | nie | Facebook username |
| whatsappName | string | nie | Nazwa w WhatsApp |
| shortDescription | string | nie | Krótki opis |
| status | string | tak | Status (new, texting, invited...) |
| notes | string | nie | Notatki |
| outingId | number | nie | Powiązanie z wyjściem |

### Record Data Structure

```yaml
formName: lead
userGuid: 3c315f8e-6b14-46ab-9d5d-147efef6bde6
createdAt: "2026-06-10T20:30:00+02:00"
recordKey: 260610_203000
name: "Olia"
age: 25
source: daygame
phone: "+48123456789"
instagram: "@olia"
facebook: ""
whatsappName: ""
shortDescription: "Poznana w galerii"
status: new
notes: ""
outingId: null
```

## Implementation Details

### Record Key Generation

```typescript
function generateRecordKey(date?: Date): string {
  const d = date || new Date();
  const year = d.getFullYear().toString().slice(-2);
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const seconds = d.getSeconds().toString().padStart(2, '0');
  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}
```

Przykład: `260610_191531` = 10 czerwca 2026, 19:15:31

### Title Generation

```typescript
function generateActionTitle(
  date: Date,
  actionType: 'dg' | 'ng',
  suffix?: string
): string {
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  
  let title = `${year}-${month}-${day}_${actionType}`;
  if (suffix && suffix.trim()) {
    title += `_${suffix.trim()}`;
  }
  
  return title;
}
```

### No Overwrite Policy

Każde wypełnienie formularza tworzy **nowy rekord**. Nie nadpisujemy istniejących danych. Dzięki temu:
- Każde wyjście ma swój unikalny rekord
- Można śledzić historię zmian
- Każdy rekord ma unikalny `recordKey`

### Backward Compatibility

Formularze są zapisywane równolegle:
1. **SQLite (Prisma)** - dla kompatybilności z istniejącymi danymi
2. **Content Provider** - nowy standard storage

### Two-Step Write Flow (PostByNames + WriteFile)

Zapis formularza do Content Provider działa **dwuetapowo**:

#### Step 1 — PostByNames (ensure path exists)

Najpierw wywołujemy `PostByNames`, aby upewnić się, że logiczna ścieżka istnieje:

```typescript
// Przykład dla formularza action
const postResult = await invokeContentProvider([
  'IRepoService',
  'IItemWorker',
  'PostByNames',
  'root',
  'forms',
  'action',
  '260610_221131'
]);
```

`PostByNames`:
- Tworzy brakujące foldery po drodze (forms, action)
- Tworzy item dla recordKey
- Zwraca info o utworzonym/znalezionym itemie
- Jest idempotentny — można wywołać wielokrotnie

#### Step 2 — WriteFile (write body)

Po uzyskaniu pewności, że ścieżka istnieje, zapisujemy content:

```typescript
const bodyYaml = yaml.dump(formRecord);

const writeResult = await invokeContentProvider([
  'IRepoService',
  'IItemWorker',
  'WriteFile',
  'root',
  'forms',
  'action',
  '260610_221131',
  'body.yaml',
  bodyYaml
]);
```

#### Dlaczego dwuetapowo?

1. **Idempotentność** — `PostByNames` można wywołać wielokrotnie bez ryzyka duplikacji
2. **Atomowość** — najpierw tworzymy strukturę, potem zapisujemy dane
3. **Bezpieczeństwo** — unikamy błędów gdy ścieżka nie istnieje

## Files

### Source Files

| File | Description |
|------|-------------|
| `lib/form-storage.ts` | Serwis do zapisu formularzy przez Content Provider API |
| `app/(dashboard)/dashboard/forms/page.tsx` | UI formularzy action i lead |
| `app/api/outings/route.ts` | API endpoint dla outings (SQLite) |
| `app/api/leads/route.ts` | API endpoint dla leads (SQLite) |

### Architecture Files

| File | Description |
|------|-------------|
| `architecture/features/forms-features.md` | Ten dokument |
| `architecture/content-provider/content-provider.md` | Ogólna architektura Content Provider |

## Checklist

- [x] Formularz nazywa się `action (wyjście)`
- [x] Tytuł generuje się automatycznie
- [x] Domyślnie jest `dg` (daygame)
- [x] Jest opcja `ng` (nightgame)
- [x] Suffix działa
- [x] Czas startu jest automatyczny
- [x] `-15 min` i `+15 min` działają
- [x] Zapis idzie przez strukturę `getByNames(userGuid, ["forms"], "action", "YYMMDD_HHMMSS")`
- [x] Feature opisany w `architecture/features/forms-features.md`
- [x] Każdy submit = nowy rekord (brak nadpisywania)