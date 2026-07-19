Cline task — Text Editor: skrót Ctrl+S / Cmd+S do zapisu

Dodaj w text editorze obsługę skrótu zapisu:

* Windows/Linux: `Ctrl+S`
* macOS: `Cmd+S`

Zakres na początek:
Tylko text editor, nie globalnie cała aplikacja.

Wymaganie:

1. Gdy fokus jest w edytorze tekstowym i użytkownik kliknie `Ctrl+S` albo `Cmd+S`, ma wykonać się ten sam save, który obecnie wykonuje przycisk `save`.
2. Skrót musi blokować domyślne zachowanie przeglądarki:
   `event.preventDefault()`
3. Po zapisie pokaż ten sam komunikat / stan UI, który pokazuje zwykły save.
4. Jeżeli nie ma zmian, nie rób niepotrzebnego PUT albo pokaż delikatne `nothing to save`, jeśli taki pattern już istnieje.
5. Nie rób tego globalnie dla całego dashboardu, tylko w komponencie edytora albo jego najbliższym wrapperze.

Przykładowa logika:

```ts
const isSaveShortcut =
  (event.ctrlKey || event.metaKey) &&
  event.key.toLowerCase() === "s";

if (isSaveShortcut) {
  event.preventDefault();
  handleSave();
}
```

Test ręczny:

1. Otwórz text editor.
2. Zmień treść.
3. Kliknij `Ctrl+S` albo `Cmd+S`.
4. Sprawdź, że wykonuje się save.
5. Sprawdź, że przeglądarka nie otwiera okna zapisu strony.
6. Odśwież i sprawdź, że zmiana została zapisana.
