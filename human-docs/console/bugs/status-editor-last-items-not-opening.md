# Bug: Ostatnie pozycje na liście nie otwierają się w Statuses Update

## Opis

W `Statuses Update` ostatnie pozycje na liście nie otwierają się po kliknięciu / wybraniu, mimo że wcześniejsze pozycje działają.

### Przykład problematycznych pozycji:

```
82. 26-06-20_pn_Marzenia [ważny]
86. 26-06-22_pi_Ramona [ważny]
88. 26-07-04_pi_Karolina [ważny]
```

Po wybraniu tych pozycji edytor statusu się nie otwiera, a inne leady otwierają się poprawnie.

## Podejrzenie przyczyny

Prawdopodobnie błąd wynika z mapowania po indeksie po sortowaniu/filtrowaniu:
- picker pokazuje listę po sortowaniu datami
- ale po wyborze używany jest stary indeks z oryginalnej listy
- albo `value` w select prompt jest numerem pozycji, a potem lookup idzie do innej tablicy
- albo ostatnie leady nie mają poprawnego `statusAddress` / `statusItem`, mimo że są oznaczone jako [ważny]

## Zadanie

1. Sprawdź implementację `Statuses Update`.
2. Upewnij się, że select/picker jako `value` przekazuje cały obiekt albo stabilny `leadKey`, nie indeks.
3. Po wyborze `leadKey` znajdź dokładnie ten sam obiekt w aktualnej mapie/listcie.
4. Dodaj diagnostykę dla wybranego itemu:
   - `leadKey`
   - `leadName`
   - `statusKind`
   - `statusAddress`
   - `statusLoca`
5. Jeśli status jest [ważny], ale nie ma `statusAddress`, to klasyfikacja jest błędna.
6. Napraw tak, żeby wszystkie leady z listy, szczególnie 82, 86, 88, dało się otworzyć.
7. Po edycji jednego statusu wracaj do pickera.

## Status

- [ ] Zbadane źródło problemu
- [ ] Dodana diagnostyka
- [ ] Naprawione mapowanie indeksów
- [ ] Przetestowane na problematycznych pozycjach