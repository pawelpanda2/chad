# Bugfix + Feature: Msg Workout List - Limit Filter and Numbering

## Korekta wymagań (poprawione)

Poprzedni opis był nieprecyzyjny. Poniżej znajdują się poprawione wymagania.

## 1. Brak sortowania w frontendzie

Lista workoutów ma zachować kolejność zwracaną przez Content Provider.

**Nie sortuj:**
- Nie sortuj po dacie
- Nie sortuj alfabetycznie
- Nie przestawiaj elementów w frontendzie

Content Provider już zwraca elementy w odpowiedniej kolejności i frontend ma tę kolejność zachować.

**Implementacja:**
- Pobierz listę z Content Providera
- Zastosuj limit z inputu
- Wyświetl elementy w tej samej kolejności, w jakiej przyszły

## 2. Numer po lewej pochodzi z Content Providera

Numer po lewej ma być prawdziwą numeryczną wartością / numerem itemu z Content Providera.

**Przykład:**
Jeśli w Content Providerze workouty mają numery (ostatni segment loca):
```
10
11
13
15
```

to na liście ma być:
```
10 · 26-06-26
11 · 26-06-27
13 · 26-07-09
15 · 26-07-09b
```

**Nie:**
```
01 · 26-06-26
02 · 26-06-27
03 · 26-07-09
04 · 26-07-09b
```

**Ważne:**
- Mogą być przerwy w numeracji
- Nie zakładaj, że numery są ciągłe
- Nie generuj numerów samodzielnie
- Użyj ostatniego segmentu z loca itemu (np. `03/06/71/02/12` → `12`)
- Numer ma być tylko wizualnym prefixem, nie częścią nazwy itemu

## 3. Limit input działa na kolejności z Content Providera

Input obok `+ New` zostaje.

**Domyślna wartość:** `-5`

**Znaczenie:**
| Wartość | Znaczenie |
|---------|-----------|
| `-5` | pokaż 5 ostatnich elementów z listy CP |
| `5` | pokaż 5 pierwszych elementów z listy CP |
| `-10` | pokaż 10 ostatnich |
| `10` | pokaż 10 pierwszych |
| `0` lub puste pole | pokaż wszystkie |
| błędna wartość | fallback do `-5` |

**Kolejność działania:**
1. Zachowaj kolejność z Content Providera
2. Zastosuj limit
3. Wyświetl z prawdziwymi numerami z CP

**Przykład:**
Content Provider zwraca 15 itemów.
Input ma `-5`.
Frontend pokazuje ostatnie 5 itemów z ich prawdziwymi numerami.

## 4. Klikalna jest tylko nazwa workoutu

Na liście format:
```
12 · 26-07-09b
```

**Klikalna jest tylko nazwa:** `26-07-09b`

**Nie klikalne:**
- `12` (numer)
- `·` (separator)
- pusty obszar linijki

Kliknięcie nazwy workoutu otwiera workout w edytorze.

## 5. Zachowane wymagania dla `+ New`

- `+ New` tylko dodaje workout do listy
- `+ New` nie otwiera automatycznie nowego workoutu w edytorze
- nowy workout ma nazwę z daty (np. `26-07-09`, `26-07-09b`)
- kliknięcie istniejącego workoutu nadal otwiera go w edytorze
- `+ New`, input limitu i `Refresh` są wyrównane maksymalnie do lewej

## UI Layout

```
Msg workouts [+ New] [-5] [🔄 Refresh]

10 · 26-06-26
11 · 26-06-27
12 · 26-07-09
14 · 26-07-09b
15 · 26-07-09c
```

Tylko nazwy po separatorze są klikalne.

## Zmienione pliki

### `chad-dashbord`
- `app/(dashboard)/dashboard/leads/details/page.tsx`:
  - Usunięto sortowanie - zachowano kolejność Content Providera
  - Dodano funkcję `getItemNumber(loca)` - ekstrahuje ostatni segment z loca
  - Zmieniono `getFilteredWorkouts()` - tylko filtruje, nie sortuje
  - Zmieniono renderowanie: tylko nazwa jest klikalna (Link wokół nazwy, nie całego wiersza)
  - Numer itemu pochodzi z `workout.loca` (ostatni segment)

## Test ręczny

### Scenariusz testowy
1. Wejdź w Leads
2. Wybierz leada z wieloma msg workoutami
3. Sprawdź kolejność elementów - powinna być taka sama jak z Content Providera
4. Sprawdź, czy frontend nie sortuje ich po dacie ani alfabetycznie
5. Przy domyślnym input `-5` sprawdź, czy pokazuje ostatnie 5 elementów
6. Sprawdź, czy numery po lewej to prawdziwe numery z Content Providera (ostatni segment loca)
7. Sprawdź przypadek, gdzie są przerwy w numeracji
8. Sprawdź, czy klikalna jest tylko nazwa workoutu
9. Kliknij nazwę workoutu - sprawdź, czy otwiera się w edytorze
10. Kliknij numer / pusty obszar - sprawdź, że nie otwiera edytora
11. Kliknij `+ New` - sprawdź, że nowy workout pojawia się na liście
12. Sprawdź, że `+ New`, input i `Refresh` są wyrównane do lewej

### Oczekiwane rezultaty
- Kolejność z Content Providera jest zachowana
- Numery pochodzą z loca (ostatni segment)
- Filtr `-5` pokazuje ostatnie 5 itemów z ich oryginalnymi numerami
- Tylko nazwa workoutu jest klikalna
- Nowy workout pojawia się na liście, ale nie otwiera się automatycznie