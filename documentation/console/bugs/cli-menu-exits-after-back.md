# Bug: Powrót z podmenu kończy CLI

## Objaw

Po różnych akcjach w podmenu (np. "Ask OpenAI about girl" → wybór leada → "Co teraz?" → "4. Powrót") aplikacja kończy działanie zamiast wrócić do głównego menu.

## Przyczyna

### 1. ZamykLIKanie readline w `showPostSaveMenu()` (naprawione)
Funkcja tworzyła własny interfejs `readline` i zamykała go przy powrocie, co wpływało na główny readline.

### 2. Interferencja `clack` z `process.stdin` (naprawione)
`clack` używa trybu raw na stdin i po zakończeniu może wywołać `process.stdin.unref()`, co pozwala Node.js na zakończenie procesu nawet gdy readline czeka na input.

## Oczekiwane zachowanie

- **Żadna opcja menu ani podmenu nie kończy aplikacji**
- **Nawet jeśli wystąpi exception, aplikacja ma wrócić do głównego menu**
- Każda operacja kończy się powrotem do odpowiedniego menu
- Główne menu działa w nieskończoność aż do EOF (Ctrl+D)
- Po KAŻDEJ opcji (1-5) możliwy powrót do głównego menu

## Poprawka

### Zmiana 1: `src/openai/askOpenAiAboutGirl.ts`
- Zastąpiono tworzenie własnego `readline` w `showPostSaveMenu()` użyciem `clack.select()`
- Usunięto `rl.close()` które zamykało stdin

### Zmiana 2: `src/cli.ts`
1. Zmieniono `const rl` na `let rl` aby umożliwić odtworzenie interfejsu
2. Dodano kod po `askOpenAiAboutGirlFlow()` który:
   - Wywołuje `process.stdin.ref()` aby przywrócić stdin jako handle utrzymujący proces
   - Wznawia stdin jeśli został wstrzymany (`process.stdin.resume()`)
   - Odtwarza readline jeśli zostało zamknięte
3. **Usunięto opcję "0. Exit" z głównego menu** - CLI działa w nieskończoność

## Architektura

- Jeden `readline` tworzony na start CLI
- Jedna główna pętla `while (!isClosed)`
- `rl.close()` tylko przy EOF (Ctrl+D) lub błędzie
- Podmenu używają `clack` zamiast tworzyć własne `readline`
- Po powrocie z podmenu `process.stdin.ref()` utrzymuje proces przy życiu

## Test manualny

### Test 1: Ask OpenAI about girl
1. `npm run cli`
2. Wybierz `6. Ask OpenAI about girl`
3. Wybierz leada
4. W "Co teraz?" wybierz `4. Powrót`
5. **Powinno wrócić do głównego menu**
6. Wybierz `1. PrintAllLeads` - działa
7. Aby zakończyć: Ctrl+D (EOF)

### Test 2: Statuses Update (nowy przypadek)
1. `npm run cli`
2. Wybierz `4. Statuses Update`
3. Wpisz zakres (np. `all` lub `1-5`)
4. Wybierz leada z listy
5. Jeśli brak statusu - utwórz lub pomiń
6. Wejdź w edycję statusu
7. Wybierz `exit without save`
8. Wybierz `0. Wróć` z listy leadów
9. **Powinno wrócić do głównego menu**
10. Wybierz `1. PrintAllLeads` - działa

**Kluczowe: po wybraniu "Powrót" aplikacja NIE kończy się, tylko wraca do głównego menu i czeka na kolejny wybór.**

## Historia poprawek

### Poprawka 1: Ask OpenAI section (wcześniej)
- Dodano kod po `askOpenAiAboutGirlFlow()` który przywraca `process.stdin.ref()` i odtwarza readline

### Poprawka 2: Statuses Update section (teraz)
- Dodano ten sam kod po sekcji "Statuses Update" (opcja 4)
- Po zakończeniu edycji i "Refreshing data..." aplikacja przywraca stdin i readline
- To naprawia problem z kończeniem CLI po powrocie z edytora statusów
