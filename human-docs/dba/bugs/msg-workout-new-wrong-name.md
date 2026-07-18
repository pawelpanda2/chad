# Bug: New Msg Workout Created with Wrong Name "Msg Workout"

## Data zgłoszenia
09/07/2026

## Opis problemu

Po kliknięciu `+ New` w sekcji Msg workouts, nowy workout tworzył się z błędną nazwą:
- **Błędna nazwa:** `msg workout` (lub `Msg Workout`)
- **Oczekiwana nazwa:** Data w formacie `YY-MM-DD` (np. `26-07-09`)

### Przykład widoku listy przed fixem:
```
Msg workouts:
26-06-23
26-07-09; ai bot
msg workout  <-- BŁĘDNA NAZWA
```

## Przyczyna

Funkcja `saveMsgWorkout` w `src/leads.ts` używała hardcodedowanej nazwy `"msg workout"` w operacji `Put`:

```typescript
export async function saveMsgWorkout(loca: string, content: string): Promise<boolean> {
  await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "Put",
    SHARED_REPO_ID,
    loca,
    "Text",
    "msg workout",  // <-- HARDCODED NAME - BŁĄD!
    content,
  ]);
  return true;
}
```

Operacja `Put` w Content Provider API może używać parametru nazwy do walidacji lub aktualizacji nazwy elementu. Gdy `saveMsgWorkout` był wywoływany (np. podczas edycji workoutu), mógł on zmieniać nazwę elementu na `"msg workout"`.

## Rozwiązanie

Zaktualizowano funkcję `saveMsgWorkout` aby pobierała rzeczywistą nazwę elementu przed zapisem:

```typescript
export async function saveMsgWorkout(loca: string, content: string): Promise<boolean> {
  // Najpierw pobierz element, aby uzyskać jego rzeczywistą nazwę
  const item = await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "GetItem",
    SHARED_REPO_ID,
    loca,
  ]);

  if (!item?.Settings?.name) {
    throw new Error(`Could not find item at loca "${loca}" to save msg workout content`);
  }

  const itemName = item.Settings.name;

  // Użyj rzeczywistej nazwy elementu w operacji Put
  await invokeContentProvider([
    "IRepoService",
    "IItemWorker",
    "Put",
    SHARED_REPO_ID,
    loca,
    "Text",
    itemName,  // <-- RZECZYWISTA NAZWA
    content,
  ]);
  return true;
}
```

## Zmienione pliki

- `chad-dba/src/leads.ts` - funkcja `saveMsgWorkout`

## Test ręczny

1. Uruchom aplikację: `npm run dev` w `chad-dashbord`
2. Przejdź do zakładki `Leads`
3. Otwórz szczegóły wybranego leada
4. Kliknij `+ New` w sekcji Msg workouts
5. Sprawdź, czy nowy workout pojawił się na liście z nazwą w formacie `YY-MM-DD` (np. `26-07-09`)
6. Kliknij nowo utworzony workout, aby otworzyć go w edytorze
7. Wprowadź zmiany i zapisz
8. Wróć do listy workoutów
9. Sprawdź, czy nazwa workoutu nadal jest w formacie daty (nie zmieniła się na "msg workout")

### Oczekiwane rezultaty

- Nowy workout tworzy się z nazwą w formacie `YY-MM-DD`
- Po zapisaniu zawartości workoutu, nazwa pozostaje bez zmian
- Lista pokazuje poprawne nazwy workoutów

## Powiązane funkcje

- `generateWorkoutName(existingWorkoutNames)` - generuje unikalną nazwę na podstawie daty
- `createMsgWorkoutForLead(leadName, leadLoca)` - tworzy nowy workout z poprawną nazwą
- `getLeadMsgWorkoutsByLoca(leadLoca)` - pobiera listę istniejących workoutów

## Uwagi

- `Msg Workout` jest nazwą sekcji UI (folderu), a nie nazwą poszczególnych workoutów
- Nazwy workoutów powinny być generowane na podstawie daty: `YY-MM-DD`, `YY-MM-DDb`, `YY-MM-DDc`, itd.
- Pierwszy workout danego dnia nie ma suffixu, kolejne mają suffixy `b`, `c`, `d`, ...