# Feature: Msg Workouts Display in Lead Details

## Cel feature'a

Wyświetlanie listy wszystkich `msg workout` danego leada w zakładce `Leads`, w widoku szczegółów leada.

## Zakres

- widok szczegółów pojedynczego leada (`/dashboard/leads/details`)
- sekcja `Msg workouts` pokazująca wszystkie workouty danego leada
- obsługa stanów: pusty folder, brak folderu, błąd API
- wyświetlanie nazw workoutów dokładnie tak, jak są zapisane (wraz z dopiskami typu `; ai bot`)

## Zmienione pliki

### `chad-dba`

- `src/leads.ts` - dodano funkcje:
  - `getLeadMsgWorkouts(leadName)` - pobiera folder msg workout z dziećmi
  - `getLeadDetailsWithWorkouts(leadName, leadLoca)` - rozszerza `getLeadDetails` o msg workouts
  - interfejsy: `MsgWorkoutItem`, `MsgWorkoutsResult`, `LeadDetailsDataWithWorkouts`

### `chad-dashbord`

- `app/api/leads-dashboard/details/route.ts` - zmiana na `getLeadDetailsWithWorkouts`
- `app/(dashboard)/dashboard/leads/details/page.tsx` - UI renderujące listę msg workouts

## Ścieżki nazw (logical paths) vs ścieżki numeryczne (loca)

### Ważna zasada

Feature używa **GetByNames2** zamiast starego **GetByNames** do pobierania folderu `msg workout`.

- **GetByNames** wymaga pełnej ścieżki nazw: `leads, all items, [leadName], msg workout`
- **GetByNames2** używa znanego `loca` jako punktu startowego: `[leadLoca], msg workout`

To jest bardziej optymalne, bo frontend już zna `leadLoca` z poprzednich zapytań.

### Folder wszystkich leadów

```
leads, all items
```

Przykładowe wywołanie:
```json
["IRepoService", "IItemWorker", "GetByNames", "21d11bdc-f1f4-44d1-b61a-3fa6b039c641", "leads", "all items"]
```

### Konkretny lead

```
leads, all items, [leadName]
```

Przykład:
```
leads, all items, 26-07-06_pn_Karolina_ruda
```

### Folder msg workout danego leada (GetByNames2)

Zamiast resolve'ować pełną ścieżkę nazw, używamy znanego `leadLoca`:

```
[leadLoca], msg workout
```

Przykład:
```json
["IRepoService", "IItemWorker", "GetByNames2", "21d11bdc-f1f4-44d1-b61a-3fa6b039c641", "03/06/89", "msg workout"]
```

### Konkretny workout

```
leads, all items, [leadName], msg workout, [workoutName]
```

Przykład:
```
leads, all items, 26-07-06_pn_Karolina_ruda, msg workout, 26-07-09
```

## Przepływ danych

1. UI widoku szczegółów pobiera dane z `GET /api/leads-dashboard/details?leadName=...&leadLoca=...`
2. API route wywołuje `getLeadDetailsWithWorkouts(leadName, leadLoca)` z `chad-dba`
3. `chad-dba` wykonuje dwa kroki:
   - `getLeadDetails(leadName, leadLoca)` - pobiera contacts (przez numeric loca)
   - `getLeadMsgWorkouts(leadName)` - pobiera folder msg workout (przez pełną ścieżkę nazw)
4. API zwraca JSON z polami:
   - `leadKey`, `leadName`, `loca`, `contacts`, `contactsError`
   - `msgWorkouts` - tablica `{physicalKey, logicalName}`
   - `msgWorkoutsError` - opcjonalny błąd
   - `msgWorkoutsNotFound` - czy folder nie istnieje

## Struktura odpowiedzi dla msg workouts

### Sukces - folder z dziećmi

```json
{
  "msgWorkouts": [
    { "physicalKey": "02", "logicalName": "26-06-01" },
    { "physicalKey": "03", "logicalName": "26-06-02" },
    { "physicalKey": "06", "logicalName": "26-06-19; ai bot" }
  ],
  "msgWorkoutsError": null,
  "msgWorkoutsNotFound": false
}
```

### Brak folderu

```json
{
  "msgWorkouts": [],
  "msgWorkoutsError": null,
  "msgWorkoutsNotFound": true
}
```

### Błąd API

```json
{
  "msgWorkouts": [],
  "msgWorkoutsError": "Error message from Content Provider",
  "msgWorkoutsNotFound": false
}
```

## Zależności od Content Providera

Feature używa logicznej nawigacji po drzewie Content Provider:

- fizyczne foldery są numeryczne (np. `03`, `06`, `89`)
- nazwy logiczne są trzymane w `config.yaml`
- kod używa `GetByNames` do nawigacji po ścieżkach nazw
- response z `GetByNames` dla folderu zawiera `Body` jako mapę `physicalKey -> logicalName`

### Ważne zasady

- nie budujemy fizycznych ścieżek ręcznie
- używamy pełnej ścieżki nazw: `leads, all items, [leadName], msg workout`
- children folderu są w `Body`, nie w `Children`
- nie pobieramy body każdego workoutu na tym etapie - tylko listę z folderu

## Edge cases

1. **Brak folderu `msg workout`**: `msgWorkoutsNotFound = true` → UI pokazuje "No msg workouts"
2. **Pusty folder**: `msgWorkouts.length === 0` → UI pokazuje "No msg workouts"
3. **Błąd API**: `msgWorkoutsError` jest ustawiony → UI pokazuje czerwony alert z błędem
4. **Itemy z dopiskami**: np. `26-06-19; ai bot` → wyświetlane dokładnie tak, jak są

## Renderowanie UI

### Stan: lista workoutów

```
Msg workouts
├─ 🗨 26-06-01
├─ 🗨 26-06-02
├─ 🗨 26-06-19; ai bot
└─ 🗨 26-06-20
```

### Stan: brak workoutów

```
Msg workouts
No msg workouts
```

### Stan: błąd

```
Msg workouts
⚠️ {error message}
```

## Test

### Scenariusz testowy

1. Uruchom aplikację: `npm run dev` w `chad-dashbord`
2. Przejdź do zakładki `Leads`
3. Otwórz leada, który ma folder `msg workout`
4. Sprawdź, czy w sekcji `Msg workouts` widoczna jest lista workoutów
5. Sprawdź, czy nazwy workoutów są wyświetlane dokładnie tak, jak w Content Provider (wraz z dopiskami)
6. Sprawdź leada bez `msg workout` - powinien pokazać "No msg workouts"
7. Sprawdź konsolę przeglądarki pod kątem błędów
8. Sprawdź Network - zapytanie do `/api/leads-dashboard/details` powinno zwrócić dane z `msgWorkouts`

### Dowód działania

Po otwarciu lead details:
- API zwraca `{msgWorkouts: [{physicalKey: "02", logicalName: "26-06-01"}, ...], msgWorkoutsNotFound: false}`
- UI renderuje listę z ikonkami `MessageCircle` i nazwami workoutów
- Kliknięcie w workout (przyszły feature) otworzy edytor

## Dalsze etapy

1. Dodanie klikalności w poszczególne workouty (otwarcie edytora)
2. Dodanie możliwości tworzenia nowego workoutu
3. Wyświetlanie podglądu zawartości workoutu po hover
4. Sortowanie workoutów po dacie (najnowsze pierwsze)