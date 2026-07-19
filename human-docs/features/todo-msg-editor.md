# Feature: Todo Msg Editor

## Cel (Goal)

Stworzenie prostego edytora tekstowego dla wiadomości "msg workout" w dashboardzie. Po kliknięciu elementu z listy Todo msg, użytkownik może edytować zawartość wiadomości i zapisać zmiany.

## Zasada najważniejsza

**Dashboard jest wyłącznie warstwą UI. Cała logika biznesowa znajduje się w `chad-dba`.**

To oznacza:
- Dashboard NIE wie jak działa Content Provider
- Dashboard NIE parsuje addressów ani YAML
- Dashboard NIE wywołuje bezpośrednio metod Content Providera
- Dashboard TYLKO wyświetla UI i wywołuje publiczne funkcje z `chad-dba` przez API routes

## Architektura

### Struktura plików

```
chad-dba/
└── src/
    └── leads.ts                      # Dodane publiczne funkcje

chad-dashbord/
├── app/
│   ├── (dashboard)/
│   │   └── dashboard/
│   │       └── todo-msg/
│   │           ├── page.tsx          # Zaktualizowana lista (dodano kliknięcie)
│   │           └── edit/
│   │               └── page.tsx      # Nowy widok edytora
│   └── api/
│       └── todo-msg/
│           └── edit/
│               └── route.ts          # Nowy API endpoint
```

### Komponenty

#### 1. Publiczne funkcje w chad-dba (`src/leads.ts`)

Nowe eksportowane funkcje:

```typescript
/**
 * Data returned by getMsgWorkoutForEdit for use in the editor UI.
 */
export interface MsgWorkoutEditorData {
  leadName: string;    // Pełna nazwa leada
  address: string;     // Pełny address z repo GUID
  body: string;        // Zawartość tekstowa
}

/**
 * Gets the msg workout data for editing.
 * @param loca The numeric loca of the msg workout item
 * @returns Promise resolving to MsgWorkoutEditorData or null if not found
 */
export async function getMsgWorkoutForEdit(loca: string): Promise<MsgWorkoutEditorData | null>;

/**
 * Saves content to a msg workout item using Put.
 * @param loca The numeric loca of the msg workout item
 * @param content The content to save
 * @returns Promise resolving to true on success
 */
export async function saveMsgWorkout(loca: string, content: string): Promise<boolean>;
```

**Dlaczego te funkcje są w chad-dba?**

- `getMsgWorkoutForEdit` wykonuje całą logikę:
  1. Pobiera item z Content Providera używając `GetItem`
  2. Buduje pełny address z repo GUID i loca
  3. Wyciąga girlId z pierwszego segmentu loca
  4. Pobiera nazwę leada z mapy wszystkich leadów
  5. Zwraca gotowy model dla UI

- `saveMsgWorkout` wykonuje całą logikę:
  1. Wywołuje `Put` z odpowiednimi parametrami
  2. Używa poprawnej nazwy typu "msg workout"
  3. Obsługuje wszystkie szczegóły API

Dashboard nie musi wiedzieć NIC o tych operacjach.

#### 2. API Endpoint (`/api/todo-msg/edit`)

Cienka warstwa wywołująca publiczne funkcje z chad-dba:

```typescript
// GET /api/todo-msg/edit?loca=...
export async function GET(request: NextRequest) {
  const loca = request.nextUrl.searchParams.get("loca");
  const data = await getMsgWorkoutForEdit(loca);
  return NextResponse.json(data);
}

// POST /api/todo-msg/edit
export async function POST(request: NextRequest) {
  const { loca, content } = await request.json();
  await saveMsgWorkout(loca, content);
  return NextResponse.json({ success: true });
}
```

**Brak logiki biznesowej w endpointcie!** Wszystkie operacje na danych są w chad-dba.

#### 3. Strona edytora (`/dashboard/todo-msg/edit`)

Prosty komponent React z:
- **Nazwa leada** - wyświetlana jako nagłówek
- **Address itemu** - małym szarym tekstem pod nagłówkiem
- **Duży textarea** - zajmuje prawie całą stronę
- **Przycisk Save** - zapisuje i wraca do listy
- **Przycisk Back** - wraca do listy bez zapisu

Komponent pobiera dane przez `fetch("/api/todo-msg/edit?loca=...")` - nie importuje chad-dba bezpośrednio.

#### 4. Lista Todo msg (zaktualizowana)

Kliknięcie elementu listy przekierowuje do:
```
/dashboard/todo-msg/edit?loca={loca}
```

gdzie `loca` pochodzi z wyniku `TodoMsgResult.loca` zwróconego przez `getTodoMsgLeads()` lub `getFirstMsgLeads()`.

## Flow

### Ładowanie edytora

```
kliknięcie elementu na liście
        ↓
router.push(`/dashboard/todo-msg/edit?loca=${loca}`)
        ↓
edytor wywołuje GET /api/todo-msg/edit?loca=...
        ↓
API route wywołuje getMsgWorkoutForEdit(loca) w chad-dba
        ↓
chad-dba:
  1. GetItem(repo, loca)
  2. Wyciąga girlId z loca
  3. GetAllLeads() aby znaleźć nazwę
  4. Zwraca { leadName, address, body }
        ↓
API route zwraca JSON
        ↓
edytor wyświetla dane w UI
```

### Zapis edytora

```
kliknięcie Save
        ↓
edytor wywołuje POST /api/todo-msg/edit z { loca, content }
        ↓
API route wywołuje saveMsgWorkout(loca, content) w chad-dba
        ↓
chad-dba:
  1. Put(repo, loca, "Text", "msg workout", content)
        ↓
API route zwraca { success: true }
        ↓
edytor przekierowuje do /dashboard/todo-msg
```

## Wygląd edytora

```
┌─────────────────────────────────────────────────────────────┐
│ [← Back]                                    [Save]          │
│                                                              │
│ 26-07-06_pn_Karolina_ruda                                   │
│ 21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06/89/03          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  // todo                                               │ │
│  │                                                        │ │
│  │  Napisz do niej wiadomość...                           │ │
│  │                                                        │ │
│  │                                                        │ │
│  │                                                        │ │
│  │                                                        │ │
│  │                                                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Wymagania dotyczące viewport i scrollowania

### 1. Edytor musi mieścić się w viewport

- Cały edytor (nagłówek + pole tekstowe + przyciski) musi być widoczny bez scrollowania całej strony
- **Nie może powstać scrollbar dla całej strony** (`body`/`html`)
- Jeśli trzeba, dostosuj wysokość edytora aby wszystko się zmieściło

### 2. Scroll TYLKO wewnątrz edytora

- Pole tekstowe (CodeMirror/contenteditable) powinno mieć `overflow-y: auto`
- Przewijanie zawartości tekstu odbywa się TYLKO wewnątrz pola edycji
- Reszta strony (nagłówek, przyciski) nie scrolluje
- `page` / `body` scroll dla widoku edytora musi być wyłączony
- Jeżeli używany jest CodeMirror lub `textarea`, komponent musi mieć własny pionowy scrollbar
- Długie linie muszą zawijać się wizualnie do szerokości edytora
- Nie może pojawiać się poziomy scrollbar od długich linii
- **To są dwa RÓŻNE scrollbary:**
  - ❌ Scrollbar całej strony — NIE MOŻE istnieć
  - ✅ Scrollbar wewnątrz edytora — MUSI działać gdy tekst przekracza wysokość

### 3. Wyrównanie obramowania i pola edycji

- **Obramówka (border/frame) i rzeczywiste pole edycji muszą mieć tę samą wysokość i pozycję**
- Nie może być sytuacji, gdzie ramka jest w innym miejscu niż obszar pisania
- Jeśli obramówka została przesunięta, pole edycji musi być przesunięte razem z nią

### 4. Wypełnianie dostępnej wysokości

- Edytor powinien wypełniać dostępną wysokość viewport, ale nie przekraczać jej granic
- Oblicz wysokość dynamicznie: `viewport height - (header height + buttons height + padding)`
- **Podnieś dolną granicę obramówki o około 50px od dolnej krawędzi viewport** aby zapewnić bezpieczny margines i uniknąć scrollbara całej strony. Nie używaj małych poprawek 5-10px — zapewnij wystarczający zapas.

### 5. Implementacja z CodeMirror

Jeżeli używasz CodeMirror, upewnij się że:

```css
/* Kontener edytora musi mieć ograniczoną wysokość */
.cm-editor {
  height: 100%;
}

/* Scroller obsługuje przewijanie */
.cm-scroller {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
}
```

W CodeMirror dodaj:

```ts
EditorView.lineWrapping
```

To jest tylko wizualne zawijanie. Treść zapisywana do pliku NIE może być formatowana ani przepisywana.

Struktura layoutu:
```tsx
// Zewnętrzny wrapper - 10px luzu od krawędzi
<div className="-m-[22px] flex h-[calc(100dvh-4rem-20px)] min-h-0 flex-col gap-[10px] overflow-hidden">
  {/* Nagłówek - nie kurczy się */}
  <div className="shrink-0">...</div>
  
  {/* Kontener edytora - wypełnia resztę miejsca */}
  <div className="flex-1 min-h-0 overflow-hidden">
    <CodeMirror height="100%" ... />
  </div>
</div>
```

**Kluczowe elementy:**
- `-m-[22px]` + `h-[calc(100dvh-4rem-20px)]` — daje około `10px` luzu od każdej krawędzi obszaru `main`
- `gap-[10px]` — utrzymuje `10px` odstępu między nagłówkiem i ramką edytora
- `overflow-hidden` na wrapperze — zapobiega page scroll
- `flex-1 min-h-0` na kontenerze edytora — pozwala flex child na scrollowanie
- `height="100%"` na CodeMirror — wypełnia kontener
- `EditorView.lineWrapping` — wizualne zawijanie linii bez zmiany danych

### 6. Częste problemy i rozwiązania

| Problem | Przyczyna | Rozwiązanie |
|---------|-----------|-------------|
| Scrollbar całej strony | Edytor za wysoki | Zmniejsz `max-h` lub zwięks odjętą wartość |
| Brak scrolla w edytorze | Brak `overflow-y: auto` na `.cm-scroller` | Dodaj styl dla `.cm-scroller` |
| Edytor nie wypełnia miejsca | Brak `flex-1` lub `height: 100%` | Dodaj `flex-1 min-h-0` na kontener |

### 7. Powiązane bugi

- [text-editor-overflows-page.md](../bugs/text-editor-overflows-page.md) — gdy edytor wystaje poza viewport
- [text-editor-internal-scroll-missing.md](../bugs/text-editor-internal-scroll-missing.md) — gdy brak scrolla wewnątrz edytora

## Częste błędy

### ❌ CZEGO NIE ROBIĆ

1. **NIE pozwalaj aby edytor tworzył scrollbar całej strony**
   - To najczęstszy błąd — edytor nie może powodować `overflow` na `body`

2. **NIE pozostawiaj obramowania i pola edycji w różnych miejscach**
   - Ramka i rzeczywiste pole pisania muszą być idealnie wyrównane

3. **NIE ustawiaj sztywnej wysokości bez sprawdzania viewport**
   - Wysokość powinna być obliczana dynamicznie na podstawie dostępnej przestrzeni

4. **NIE przesuwaj obramówki bez aktualizacji pozycji pola edycji**
   - Jeśli zmieniasz pozycję ramki, zaktualizuj też pole edycji

## Czego NIE ma w edytorze

- ❌ Zakładki Preview
- ❌ Zakładki Editor
- ❌ Formatowania tekstu
- ❌ Toolbarów
- ❌ Dodatkowych przycisków
- ❌ Parserów YAML
- ❌ Walidacji treści

To ma być zwykły edytor tekstu. Kropka.

## Dlaczego logika jest w chad-dba

1. **Jedno źródło prawdy** - wszystkie operacje na Content Providerze są w jednym miejscu
2. **Dashboard jest głupi** - nie musi znać szczegółów API
3. **Łatwiejsze testowanie** - logika biznesowa może być testowana niezależnie od UI
4. **Spójność** - ta sama logika jest używana przez chad-console i chad-dashboard
5. **Bezpieczeństwo** - dashboard nie ma dostępu do surowych metod API

## Przykład użycia publicznego API

Jeżeli inny projekt chce użyć tej samej funkcjonalności:

```typescript
import { getMsgWorkoutForEdit, saveMsgWorkout } from "chad-dba";

// Pobierz dane do edycji
const data = await getMsgWorkoutForEdit("03/06/89/03");
console.log(data.leadName); // "26-07-06_pn_Karolina_ruda"
console.log(data.body);     // "msg workout content..."

// Zapisz zmiany
await saveMsgWorkout("03/06/89/03", "Updated content");
```

To wszystko. Nie trzeba:
- parsować addressów
- wyszukiwać leadów
- znać struktury Content Providera

## Budowanie i deploy

Po zmianach w chad-dba:

1. Zbuduj chad-dba:
   ```bash
   cd chad-dba
   npm run build
   ```

2. Odśwież zależności w dashboardzie:
   ```bash
   cd chad-dashbord
   rm -rf .next
   npm install
   npm run dev
   ```

## Testowanie

1. Uruchom dashboard: `npm run dev` w `chad-dashbord`
2. Przejdź do `/dashboard/todo-msg`
3. Kliknij dowolny element z listy
4. Sprawdź czy edytor wyświetla:
   - Nazwę leada w nagłówku
   - Address małym szarym tekstem
   - Zawartość w textarea
5. Zmień zawartość i kliknij Save
6. Sprawdź czy przekierowało do listy
7. Sprawdź czy zmiany zostały zapisane (odśwież listę)

## Powiązane pliki

- `src/leads.ts` - Publiczne funkcje `getMsgWorkoutForEdit` i `saveMsgWorkout`
- `../chad-dashbord/app/api/todo-msg/edit/route.ts` - API endpoint
- `../chad-dashbord/app/(dashboard)/dashboard/todo-msg/edit/page.tsx` - Widok edytora
- `../chad-dashbord/app/(dashboard)/dashboard/todo-msg/page.tsx` - Lista z kliknięciami
- `./todo-msg-dashboard.md` - Dokumentacja oryginalnej listy todo-msg