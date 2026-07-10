Nowy task: dokończ migrację BlazorApp do Next.js frontend.

Dostałeś projekt MVP:

next-content-browser

Cel:
- brak logowania na razie
- odtworzyć obecny Blazor frontend do przeglądania plików
- zachować dwa główne widoki: FolderView i TextView
- u góry repo combobox ze wszystkimi repozytoriami
- loca input
- przyciski nawigacji
- Address / Type / Name
- FolderView: Folder / Config / Terminal / Script, Add + typ + input, lista dzieci folderu
- TextView: Folder / Content / Config / Terminal, Open/Recreate + GoogleDoc + Tts, Add + Up/Down + input, CodeEditorTabs

Najważniejsze:
- nie implementuj logowania
- nie zmieniaj backendu bez potrzeby
- najpierw podepnij realne API w jednym miejscu: `src/lib/api.ts`
- styl zostaw prosty jak w screenach: biały background, czarny tekst, cienkie czarne ramki, lekko zaokrąglone przyciski

Kroki:

1. Uruchom frontend:

```bash
cp .env.example .env.local
npm install
npm run dev
```

2. Sprawdź MVP na mockach:

```env
NEXT_PUBLIC_USE_MOCKS=true
```

3. Znajdź w backendzie realną trasę HTTP, która odpowiada staremu Blazor `Backend.InvokeStringArgsApi`.

Szukaj:

```bash
grep -R "InvokeStringArgsApi\|IStringArgsResolverService\|MapPost\|MapGet\|GetItem\|GetAllReposNames" . -n
```

4. Podepnij realne API tylko w:

```text
src/lib/api.ts
```

Nie rozrzucaj fetchy po komponentach.

5. Po podpięciu ustaw:

```env
NEXT_PUBLIC_CONTENT_API_URL=http://localhost:6603
NEXT_PUBLIC_USE_MOCKS=false
```

6. Zweryfikuj flow:
- repo list ładuje się z backendu
- GO ładuje item po repo + loca
- FolderView pokazuje dzieci folderu
- klik w dziecko folderu zmienia loca i ładuje item
- TextView pokazuje body w CodeEditorTabs

7. Nie rób teraz:
- logowania
- dużego redesignu
- edycji backendu niezwiązanej z endpointem
- routera dla wielu stron, chyba że minimalnie potrzebny

Na końcu wypisz:
1. realny endpoint backendu użyty w `src/lib/api.ts`
2. które metody Blazor zostały odwzorowane
3. co działa na mockach
4. co działa na realnym backendzie
5. lista braków/TODO
