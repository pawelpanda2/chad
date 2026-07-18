# Bug: Wyświetl chaty znalezione pokazuje body folderu zamiast rozmowy

## Objaw

Po wybraniu opcji `3. Wyświetl chaty znalezione` dla leada (np. `26-05-29_pn_Amelia`), zamiast treści rozmowy wyświetlane jest:

```text
CHAT: 26-05-29_pn_Amelia
Kanał: whatsup
------------------------------------------------------------
{"01":"beeper","02":"manual"}
```

To nie jest treść rozmowy - to body/config folder-itemu, który ma children.

## Przykład błędnego outputu

```text
CHAT: 26-05-29_pn_Amelia
Kanał: whatsup
------------------------------------------------------------
{"01":"beeper","02":"manual"}
------------------------------------------------------------
```

## Root Cause

Kod w funkcji `displayChatsFound` pobierał item po ścieżce:

```
beeper, whatsup, [lead name]
```

i wyświetlał `item.body` bez sprawdzania typu itemu.

Pod tą ścieżką może znajdować się:

1. **Text-item** - bezpośrednio zawiera rozmowę w `body`
2. **Folder-item** - zawiera children (np. `beeper`, `manual`), a nie rozmowę

Kod zatrzymywał się za wcześnie - pobierał folder, a powinien wejść głębiej do text-itemu `beeper`.

## Różnica Text vs Folder

### Text-item
- `item.type === 0`
- `item.body` zawiera treść rozmowy
- Można wyświetlić bezpośrednio

### Folder-item
- `item.type === 1`
- `item.body` zawiera konfigurację/metadata (np. `{"01":"beeper","02":"manual"}`)
- `item.children` zawiera listę child items
- Trzeba wejść głębiej, szukając child o nazwie `beeper`

## Poprawny Flow

1. Pobierz item po ścieżce: `beeper, whatsup, [lead name]`
2. Sprawdź typ itemu:
   - **Jeśli Text**: wyświetl `item.body`
   - **Jeśli Folder**:
     1. Sprawdź children
     2. Znajdź child o nazwie `beeper`
     3. Pobierz item po ścieżce: `beeper, whatsup, [lead name], beeper`
     4. Sprawdź czy to Text
     5. Wyświetl `item.body`
3. Jeżeli folder nie ma childa `beeper`, pokaż komunikat diagnostyczny

## Fix

Zmieniono funkcję `displayChatsFound` w `src/cli.ts`:

```typescript
async function displayChatsFound(leadName: string) {
  const repoGuid = await getRepoGuid();
  if (!repoGuid) return;

  const chatNames = ["beeper", "whatsup", leadName];
  const item = await itemWorker.GetByNames(repoGuid, ...chatNames);

  if (!item) {
    console.log(`\nNie znaleziono chatu dla lead: ${leadName}`);
    return;
  }

  if (item.type === "Text") {
    // Direct text item - display its body
    console.log(item.body || "(brak treści)");
    return;
  }

  if (item.type === "Folder") {
    // Folder item - need to go deeper to find the 'beeper' child
    const beeperChild = item.children?.find(
      (child) => child.name === "beeper" || child.logicalName === "beeper"
    );

    if (!beeperChild) {
      console.log(`Folder nie zawiera child 'beeper'.`);
      console.log(`Dostępne children: ${item.children.map(c => c.name).join(", ")}`);
      return;
    }

    // Fetch the beeper child item
    const beeperItem = await itemWorker.GetByNames(repoGuid, ...chatNames, "beeper");

    if (beeperItem?.type === "Text") {
      console.log(beeperItem.body || "(brak treści)");
    }
    return;
  }
}
```

## Test Ręczny

1. Uruchom `chad-console`:
   ```bash
   npm run dev
   ```

2. Wybierz opcję: `6. Ask OpenAI about girl`

3. Wybierz lead: `26-05-29_pn_Amelia`

4. Wybierz opcję: `3. Wyświetl chaty znalezione`

5. Sprawdź, że:
   - [ ] Nie pokazuje `{"01":"beeper","02":"manual"}`
   - [ ] Jeżeli `beeper, whatsup, [lead]` jest folderem, kod wchodzi w `beeper, whatsup, [lead], beeper`
   - [ ] Wyświetlana jest właściwa treść rozmowy z text-itemu
   - [ ] Dla leada gdzie chat jest bezpośrednio text-itemem, wyświetla poprawnie

6. Przetestuj z innym leadem, gdzie chat może być bezpośrednio text-itemem.

7. Sprawdź, że oba warianty działają poprawnie.