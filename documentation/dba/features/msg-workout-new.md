# Feature: New Msg Workout Creation

## Cel feature'a

Dodanie możliwości tworzenia nowego msg workout dla wybranego leada bezpośrednio z poziomu widoku szczegółów leada.

## Zakres

- przycisk `+ New` w sekcji `Msg workouts` w widoku szczegółów leada
- automatyczne generowanie nazwy workoutu na podstawie dzisiejszej daty
- obsługa duplikatów nazw (suffixy b, c, d, itd.)
- odświeżanie listy po utworzeniu
- nowy workout pojawia się na liście (nie otwiera się automatycznie w edytorze)

## Generowanie nazw

### Format podstawowy
- `YY-MM-DD` - pierwszy workout utworzony danego dnia
- Przykład dla 9 lipca 2026: `26-07-09`

### Format z suffixem
Gdy workout o podstawowej nazwie już istnieje:
- drugi workout: `26-07-09b`
- trzeci workout: `26-07-09c`
- czwarty workout: `26-07-09d`
- itd.

**Ważne:** Nie używamy suffixu `a` - pierwszy workout jest bez litery, litery zaczynają się od `b`.

### Algorytm
1. Pobierz istniejące workouty dla leada
2. Wygeneruj bazową nazwę z dzisiejszej daty (YY-MM-DD)
3. Sprawdź czy nazwa istnieje:
   - Jeśli nie istnieje → zwróć bazową nazwę
   - Jeśli istnieje → dodawaj kolejne litery (b, c, d, ...) aż znajdziesz wolną nazwę
4. Jeśli wszystkie pojedyncze litery są zajęte (mało prawdopodobne) → spróbuj podwójnych liter (bb, bc, ...)
5. Ultimate fallback → dodaj timestamp

## Zmienione pliki

### `chad-dba`

- `src/leads.ts` - dodano funkcje:
  - `generateWorkoutName(existingWorkoutNames)` - generuje unikalną nazwę workoutu
  - `createMsgWorkoutForLead(leadName, leadLoca)` - tworzy nowy workout dla leada
  - interfejsy: `MsgWorkoutItem`, `MsgWorkoutsResult` (istniały), rozszerzone o funkcje tworzenia

### `chad-dashbord`

- `app/api/leads-dashboard/msg-workout/route.ts` - nowy endpoint API:
  - `POST /api/leads-dashboard/msg-workout`
  - Request body: `{ leadName: string, leadLoca: string }`
  - Response: `{ workoutName: string, workoutLoca: string, success: boolean }`

- `app/(dashboard)/dashboard/leads/details/page.tsx` - aktualizacja UI:
  - dodano przycisk `+ New` w sekcji Msg workouts (wyrównany do lewej)
  - dodano stan `creatingWorkout` i `createError`
  - dodano handler `handleCreateWorkout`
  - po utworzeniu: odświeżenie listy (bez nawigacji do edytora)

## Ścieżki nazw (logical paths) vs ścieżki numeryczne (loca)

### Tworzenie workoutu

1. Pobierz folder `msg workout` używając `GetByNames2`:
   ```
   [leadLoca], msg workout
   ```

2. Utwórz nowy workout używając `PostParentItem`:
   ```
   IRepoService, IItemWorker, PostParentItem, repoId, msgWorkoutFolderLoca, Folder, workoutName
   ```

### Przykład ścieżki
```
leads, all items, [leadName], msg workout, [workoutName]
```

Przykład:
```
leads, all items, 26-07-06_pn_Karolina_ruda, msg workout, 26-07-09
```

## Przepływ danych

1. Użytkownik klika `+ New` w sekcji Msg workouts
2. Frontend wysyła `POST /api/leads-dashboard/msg-workout` z `leadName` i `leadLoca`
3. API wywołuje `createMsgWorkoutForLead` z `chad-dba`
4. `chad-dba`:
   - Pobiera istniejące workouty
   - Generuje unikalną nazwę
   - Tworzy nowy folder workoutu
   - Zwraca `{ workoutName, workoutLoca, success }`
5. Frontend:
   - Odświeża listę workoutów
   - **Nie nawiguje automatycznie do edytora** - nowy workout pojawia się tylko na liście
   - Użytkownik musi kliknąć workout z listy, aby otworzyć go w edytorze

## Ważne zasady

- **`+ New` nie otwiera automatycznie nowego workoutu** - tylko dodaje go do listy
- Aktualnie otwarty workout w edytorze pozostaje bez zmian po kliknięciu `+ New`
- Aby otworzyć nowo utworzony workout, użytkownik musi kliknąć go na liście
- Kliknięcie istniejącego workoutu z listy nadal otwiera go w edytorze

## UI Layout

```
Msg workouts [+ New] [-5] [🔄 Refresh]

10 · 26-06-26
11 · 26-06-27
12 · 26-07-09
14 · 26-07-09b
15 · 26-07-09c
```

Elementy UI:
- `+ New`: przycisk dodawania nowego workoutu
- input limitu: wąski input liczbowy (domyślnie `-5`), filtruje liczbę widocznych workoutów
- `Refresh`: przycisk odświeżania listy
- numery po lewej (np. `10`, `11`, `12`): prawdziwe numery itemów z Content Providera (ostatni segment loca)

**Ważne:** Tylko nazwa workoutu (np. `26-06-26`) jest klikalna, nie cały wiersz.

Przycisk `+ New`:
- umieszczony po lewej stronie, bezpośrednio obok nagłówka "Msg workouts"
- wyświetla spinner podczas tworzenia
- disabled podczas trwania operacji

Input limitu:
- wartość ujemna (np. `-5`): pokazuje ostatnie N elementów z listy Content Providera
- wartość dodatnia (np. `5`): pokazuje pierwsze N elementów z listy Content Providera
- `0` lub puste pole: pokazuje wszystkie workouty
- domyślna wartość: `-5`

Kolejność:
- Lista zachowuje kolejność z Content Providera (brak sortowania w frontendzie)
- Limit jest stosowany do kolejności z CP
- Numery pochodzą z loca itemu (ostatni segment)

## Edge cases

1. **Brak folderu `msg workout`**: Funkcja zgłosi błąd "Could not resolve msg workout folder for lead"
2. **Błąd API**: Wyświetlony zostanie czerwony alert z błędem pod przyciskiem
3. **Wszystkie nazwy zajęte**: Fallback do nazwy z timestampem (skrajnie mało prawdopodobne)

## Test ręczny

### Scenariusz testowy

1. Uruchom aplikację: `npm run dev` w `chad-dashbord`
2. Przejdź do zakładki `Leads`
3. Otwórz szczegóły wybranego leada
4. Otwórz istniejący Msg Workout w edytorze (klikając go na liście)
5. W sekcji `Msg workouts` kliknij `+ New`
6. Sprawdź, czy nowy workout pojawił się na liście
7. Sprawdź, czy edytor nadal pokazuje poprzednio otwarty workout (nie zmienił się)
8. Kliknij nowo utworzony workout na liście
9. Sprawdź, czy teraz otworzył się w edytorze
10. Kliknij `+ New` drugi raz
11. Sprawdź, czy powstał workout o nazwie `YY-MM-DDb`
12. Kliknij `+ New` trzeci raz
13. Sprawdź, czy powstał workout o nazwie `YY-MM-DDc`
14. Sprawdź, czy stare workouty nadal można otwierać z listy
15. Sprawdź konsolę przeglądarki pod kątem błędów
16. Sprawdź Network - zapytanie `POST /api/leads-dashboard/msg-workout` powinno zwrócić `{ workoutName, workoutLoca, success: true }`

### Oczekiwane rezultaty

- Pierwszy klik `+ New`: workout `26-07-09` (dla 9 lipca 2026) pojawia się na liście
- Drugi klik `+ New`: workout `26-07-09b` pojawia się na liście
- Trzeci klik `+ New`: workout `26-07-09c` pojawia się na liście
- Po każdym kliknięciu lista się odświeża
- **Nowo utworzony workout NIE otwiera się automatycznie w edytorze**
- Edytor pozostaje w stanie sprzed kliknięcia `+ New`
- Aby otworzyć nowy workout, trzeba kliknąć go na liście
- Istniejące workouty nadal można otwierać z listy
- Przyciski `+ New` i ewentualny `Refresh` są wyrównane do lewej strony

## Dalsze etapy

1. Dodanie możliwości edycji zawartości workoutu
2. Dodanie możliwości usuwania workoutów
3. Dodanie podglądu zawartości workoutu po hover
