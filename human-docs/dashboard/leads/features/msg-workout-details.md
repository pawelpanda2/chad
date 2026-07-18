# Feature: Msg Workout Details View with Preview and Editor

## Cel feature'a

Wyświetlanie szczegółów pojedynczego `msg workout` z możliwością podglądu i edycji zawartości.

## Zakres

- nowy widok `/dashboard/leads/msg-workout` dla pojedynczego workoutu
- zakładki `Preview` i `Editor`
- edycja body workoutu za pomocą CodeMirror
- zapis zmian przez `IItemWorker.Put`
- powrót do szczegółów leada
- obsługa stanów: ładowanie, błąd, puste body

## Zmienione pliki

### `chad-dba`

- `src/leads.ts` - zmodyfikowano:
  - `MsgWorkoutItem` - dodano pole `loca: string`
  - `getLeadMsgWorkoutsByLoca(leadLoca)` - zwraca `loca` dla każdego workoutu (obliczane z `msgWorkoutFolderLoca/physicalKey`)

### `chad-dashbord`

- `app/(dashboard)/dashboard/leads/msg-workout/page.tsx` - nowy widok szczegółów workoutu
- `app/api/leads/msg-workout/route.ts` - nowy endpoint API
- `app/(dashboard)/dashboard/leads/details/page.tsx` - dodano linki do workoutów

## Ścieżki i logika danych

### Nawigacja do workoutu

Po kliknięciu workoutu z listy w lead details, URL zawiera:

```
/dashboard/leads/msg-workout?leadName={leadName}&leadLoca={leadLoca}&workoutName={workoutName}&workoutLoca={workoutLoca}
```

Przykład:
```
/dashboard/leads/msg-workout?leadName=26-07-06_pn_Karolina_ruda&leadLoca=03%2F06%2F89&workoutName=26-07-09&workoutLoca=03%2F06%2F89%2F03%2F02
```

### Pobieranie danych workoutu

```json
GET /api/leads/msg-workout?workoutLoca=03/06/89/03/02&leadName=...&leadLoca=...&workoutName=...
```

API wywołuje:
```json
["IRepoService", "IItemWorker", "GetItem", "21d11bdc-f1f4-44d1-b61a-3fa6b039c641", "03/06/89/03/02"]
```

### Zapis workoutu

```json
POST /api/leads/msg-workout
{
  "workoutLoca": "03/06/89/03/02",
  "content": "updated content"
}
```

API wywołuje:
```json
["IRepoService", "IItemWorker", "Put", "21d11bdc-f1f4-44d1-b61a-3fa6b039c641", "03/06/89/03/02", "Text", "msg workout", "updated content"]
```

## Przepływ danych

1. Użytkownik klika workout z listy w lead details
2. Nawigacja do `/dashboard/leads/msg-workout` z parametrami
3. Komponent pobiera body workoutu przez API
4. API wywołuje `getMsgWorkoutForEdit(workoutLoca)` z chad-dba
5. `getMsgWorkoutForEdit` używa `GetItem(repoGuid, workoutLoca)`
6. Body jest wyświetlane w Preview lub Editor
7. Po edycji i kliknięciu Save, API wywołuje `saveMsgWorkout(workoutLoca, content)`
8. Po zapisie pokazany jest komunikat "Saved"

## Struktura odpowiedzi API

### GET /api/leads/msg-workout

```json
{
  "workoutName": "26-07-09",
  "leadName": "26-07-06_pn_Karolina_ruda",
  "leadLoca": "03/06/89",
  "workoutLoca": "03/06/89/03/02",
  "body": "content of the workout"
}
```

### POST /api/leads/msg-workout

```json
{
  "success": true
}
```

## UI

### Header

- Przycisk back (powrót do lead details)
- Tytuł: "Msg Workout — {workoutName} ({leadName})"
- Komunikat "Saved" po zapisie
- Przyciski: Preview, Editor, WCH (whitespace), Save

### Preview Tab

- Wyświetla body w `<pre>` z `whitespace-pre-wrap`
- Scroll wewnątrz karty
- "No content" gdy body jest puste

### Editor Tab

- CodeMirror editor z `BodyTextEditor`
- Własny scroll
- Obsługa Tab (wstawia `\t`)
- Obsługa Enter (zachowuje wcięcia)
- Ctrl+S / Cmd+S zapisuje

## Edge cases

1. **Workout istnieje i ma body** - wyświetla normalnie
2. **Workout istnieje, ale body jest puste** - pokazuje "No content" w preview
3. **Workout został usunięty lub workoutLoca jest nieaktualne** - pokazuje błąd 404
4. **Brak workoutLoca w URL** - pokazuje błąd "Missing workout location information"
5. **Put zwraca błąd** - pokazuje błąd w UI
6. **Użytkownik edytuje body i wraca bez zapisu** - zmiany są tracone (brak confirm)
7. **Nazwa workoutu zawiera dopisek po średniku** - wyświetlane dokładnie tak, jak są
8. **Nazwa workoutu zawiera suffix** - wyświetlane dokładnie tak, jak są

## Ważne zasady

1. **Nie hardcoduj loca** - zawsze używaj parametrów z URL
2. **Nie pobieraj body wszystkich workoutów na liście** - tylko po kliknięciu
3. **Używaj GetItem z workoutLoca** - nie GetByNames z pełną ścieżką
4. **Edytor ma własny scroll** - nie scroll całej strony
5. **Preview ma własny scroll** - nie scroll całej strony
6. **Save używa Put z workoutLoca** - nie zapisuj przez nazwę

## Test

### Scenariusz testowy

1. Uruchom aplikację: `npm run dev` w `chad-dashbord`
2. Przejdź do zakładki `Leads`
3. Otwórz leada, który ma folder `msg workout`
4. Kliknij konkretny workout z listy
5. Sprawdź, czy otworzył się nowy widok z poprawnymi danymi
6. Sprawdź, czy nazwa workoutu i leada są wyświetlane poprawnie
7. Przełącz się na zakładkę `Editor`
8. Edytuj body i kliknij `Save`
9. Sprawdź, czy pojawił się komunikat "Saved"
10. Odśwież stronę i sprawdź, czy zmiany są widoczne
11. Kliknij `Back` i sprawdź, czy wróciłeś do właściwego leada
12. Sprawdź konsolę przeglądarki pod kątem błędów
13. Sprawdź Network - zapytania do `/api/leads/msg-workout` powinny zwrócić poprawne dane

### Dowód działania

- GET `/api/leads/msg-workout?workoutLoca=...` zwraca `{workoutName, leadName, leadLoca, workoutLoca, body}`
- POST `/api/leads/msg-workout` z `{workoutLoca, content}` zapisuje zmiany
- UI pokazuje Preview i Editor z poprawnymi danymi
- Po zapisie pojawia się komunikat "Saved"
- Back wraca do lead details

## Dalsze etapy

1. Dodanie potwierdzenia przy wyjściu bez zapisu
2. Dodanie historii zmian (undo/redo)
3. Dodanie możliwości tworzenia nowego workoutu
4. Dodanie możliwości usuwania workoutu