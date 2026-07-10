# Bug: Lead Info Contacts — Shortened Links and Header Layout

## Objaw

W widoku szczegółów leada (`Lead Info`) w zakładce `Leads`:

1. **Linki kontaktów były skracane**: Dla Instagrama zamiast pełnego URL (`https://www.instagram.com/nasta_ph/`) wyświetlany był skrócony tekst `@nasta_ph`.
2. **Przy linkach pojawiała się dziwna strzałka/ikona** (`↗`).
3. **Nazwa leada w headerze była zbyt rozwleczona** i łamała się na dwie linie.
4. **W headerze pojawiał się tekst `Has contacts`** jako badge, który był redundantny.

## Przyczyna

1. Funkcja `getContactDisplayText()` w pliku `app/(dashboard)/dashboard/leads/details/page.tsx` specjalnie konwertowała Instagram URLs do formatu `@username`:
   ```typescript
   if (key === "instagram") {
     const url = new URL(value.startsWith("http") ? value : `https://instagram.com/${value.replace(/^@+/, "")}`);
     const username = url.pathname.split("/").filter(Boolean)[0];
     return username ? `@${username}` : value;
   }
   ```

2. Funkcja `renderContactValue()` dodawała ikonę `↗` po tekście linku:
   ```typescript
   <span className="text-xs">↗</span>
   ```

3. Header używał `text-base font-semibold leading-tight truncate` ale bez odpowiedniego kontenera, co powodowało łamanie długich nazw.

4. Badge `Has contacts` / `No contacts` był renderowany w headerze obok ID leada.

## Poprawione flow renderowania

### Przed poprawką:
```
Instagram: @nasta_ph ↗
```

### Po poprawce:
```
Instagram: https://www.instagram.com/nasta_ph/
```

Link nadal jest klikalny i otwiera się w nowej karcie (`target="_blank"`), ale wyświetla oryginalny pełny URL zapisany w danych Content Providera.

## Zmienione pliki

### `chad-dashbord`
- `app/(dashboard)/dashboard/leads/details/page.tsx`

### Zmiany w kodzie:

1. **`getContactDisplayText()`** — uproszczona do zwracania oryginalnej wartości bez modyfikacji:
   ```typescript
   function getContactDisplayText(contactKey: string, value: string): string {
     // Return the original value as-is - do not shorten URLs
     return value;
   }
   ```

2. **`renderContactValue()`** — usunięto `inline-flex items-center gap-1` i ikonę `↗`:
   ```typescript
   return (
     <Link
       href={normalizedLink.href}
       className="text-sm font-medium text-primary underline underline-offset-4"
       target="_blank"
       rel="noopener noreferrer"
     >
       {getContactDisplayText(contactKey, value)}
     </Link>
   );
   ```

3. **Header** — usunięto badge `Has contacts` / `No contacts`, uproszczono layout:
   ```tsx
   <div className="min-w-0 flex-1">
     <div className="flex items-center gap-2">
       <h1 className="text-base font-semibold leading-tight truncate">{details.leadName}</h1>
     </div>
     <div className="mt-0.5 text-xs text-muted-foreground">
       ID: {details.leadKey}
     </div>
   </div>
   ```

4. **Usunięto nieużywany import** `Badge` z `@/components/ui/badge`.

## Decyzja projektowa

Linki pokazujemy jako pełne oryginalne URL-e z następujących powodów:
- **Przejrzystość**: Użytkownik widzi dokładny adres, który jest zapisany w systemie
- **Spójność**: Wszystkie typy kontaktów (Instagram, WhatsApp, Telegram, Facebook) są renderowane w ten sam sposób
- **Uniknięcie pomyłek**: Skrócone formaty typu `@username` mogą być niejednoznaczne (np. czy to Instagram, czy Telegram?)
- **Możliwość kopiowania**: Pełny URL jest łatwiejszy do skopiowania i wklejenia

## Test ręczny

1. Wejdź w `chad-dashboard`.
2. Otwórz zakładkę `Leads`.
3. Kliknij `Info` na leadzie, który ma kontakt Instagram, np. zapisany jako:
   `https://www.instagram.com/nasta_ph/`
4. Sprawdź, że widoczny jest pełny link:
   `https://www.instagram.com/nasta_ph/`
5. Sprawdź, że link jest klikalny i otwiera poprawny adres w nowej karcie.
6. Sprawdź, że nie ma skróconego `@nasta_ph`.
7. Sprawdź, że nie ma dziwnej strzałki / ikony `↗`.
8. Sprawdź, że nazwa leada w headerze jest w jednej linii (długie nazwy są przycinane z `...`).
9. Sprawdź, że tekst `Has contacts` nie jest widoczny w headerze.

## Edge cases

- **Długie URL-e**: Pełne URL-e mogą być długie, ale `truncate` na nagłówku i `flex-wrap` na kontenerze kontaktów zapewniają poprawne zawijanie.
- **Różne formaty danych**: Niezależnie od tego, czy dane w CP są zapisane jako `@username`, `https://instagram.com/username`, czy `https://www.instagram.com/username/`, renderowana jest oryginalna wartość.
- **Inne typy kontaktów**: Zmiana dotyczy wszystkich typów kontaktów, nie tylko Instagrama — wszystkie są teraz renderowane jako pełne oryginalne wartości.