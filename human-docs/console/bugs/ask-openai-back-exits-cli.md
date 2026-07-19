# Bug: Powrót z podmenu "Ask OpenAI about girl" kończy CLI

## Objaw

Po wybraniu opcji `5. Ask OpenAI about girl` w głównym menu, przejściu przez flow wyboru leada i wejściu w podmenu:

```
Co teraz?
1. Wyświetl cały prompt
2. Wyświetl raporty znalezione
3. Wyświetl chaty znalezione
4. Powrót
```

gdy użytkownik wybierze `4. Powrót`, konsola wypisuje `Returning to main menu.`, ale aplikacja kończy działanie zamiast wrócić do głównego menu.

## Przyczyna

Funkcja `askOpenAiAboutGirlFlow()` używa biblioteki `@clack/prompts` do wyświetlania interaktywnych promptów. `clack` przejmuje kontrolę nad `process.stdin` i używa trybu raw, co po zakończeniu operacji może spowodować zamknięcie interfejsu `readline` utworzonego w głównej pętli CLI.

Gdy readline jest zamykany, uruchamiany jest handler `rl.on("close", ...)`, który ustawia flagę `isClosed = true`. To powoduje zakończenie głównej pętli `while (!isClosed)` w funkcji `main()`.

Mimo że `askOpenAiAboutGirlFlow()` poprawnie zwraca kontrolę do `main()`, główna pętla natychmiast kończy działanie ponieważ `isClosed` zostało ustawione na `true`.

## Oczekiwane zachowanie

Po wyborze `4. Powrót` aplikacja powinna wrócić do głównego menu:

```
1. PrintAllLeads
2. Find Todo
3. Statuses Setup
4. FilterStatuses
5. Ask OpenAI about girl
0. Exit
```

i dalej czekać na wybór użytkownika.

## Poprawka

Zmieniono deklarację `rl` z `const` na `let`, aby umożliwić odtworzenie interfejsu readline po operacjach `clack`.

Po powrocie z `askOpenAiAboutGirlFlow()` sprawdzana jest flaga `isClosed`. Jeśli readline zostało zamknięte przez `clack`, tworzony jest nowy interfejs `readline` i flaga `isClosed` jest resetowana na `false`, co pozwala głównej pętli kontynuować działanie.

### Zmienione pliki

- `../chad-console/src/cli.ts`:
  - Zmieniono `const rl = readline.createInterface(...)` na `let rl = readline.createInterface(...)`
  - Dodano kod po `askOpenAiAboutGirlFlow()` który odtwarza readline jeśli zostało zamknięte:

```typescript
// After clack operations, the readline may have been closed
// (clack uses raw mode on stdin which can interfere with readline).
// Re-create the readline interface if needed so the main menu loop continues.
if (isClosed) {
  isClosed = false;
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.on("close", () => {
    isClosed = true;
  });
}
```

## Test manualny

1. Uruchom `npm run cli`
2. Wybierz `5. Ask OpenAI about girl`
3. Wybierz dowolnego leada
4. Na ekranie "Co teraz?" wybierz `4. Powrót`
5. Sprawdź, że wraca do głównego menu i można wybrać np. `1. PrintAllLeads`