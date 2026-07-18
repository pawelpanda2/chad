# Feature: Todo Msg Dashboard

## Cel (Goal)

Stworzenie nowego widoku w dashboardzie, który agreguje wszystkie wiadomości przygotowane do napisania. Widok ma zawierać listę leadów pogrupowanych według kategorii zadań.

Docelowo będzie tam więcej kategorii. Na razie zaimplementowano dwie:
- **Todo** - leads z markerem `//todo` w wiadomościach
- **Your first msg** - leads, dla których `your-first-message: true` (pierwsza wiadomość jeszcze nie została wysłana)

## Architektura

### Struktura plików

```
chad-dashbord/
├── app/
│   ├── (dashboard)/
│   │   └── dashboard/
│   │       └── todo-msg/
│   │           └── page.tsx          # Główny komponent widoku (UI only)
│   └── api/
│       └── todo-msg/
│           └── route.ts              # API endpoint (thin wrapper)
├── components/
│   └── shared/
│       └── sidebar.tsx               # Zaktualizowane menu boczne
│
chad-dba/
└── src/
    └── leads.ts                      # Dodane publiczne funkcje
```

### Zasady architektoniczne

**Najważniejsza zasada:** Dashboard jest wyłącznie warstwą UI. Cała logika biznesowa znajduje się w `chad-dba`.

1. **chad-dba** - zawiera wszystkie publiczne funkcje z pełną logiką biznesową
2. **API route** - cienka warstwa wywołująca publiczne funkcje z chad-dba
3. **Dashboard page** - wyłącznie UI, pobiera dane przez fetch do API route

### Komponenty

#### 1. Publiczne funkcje w chad-dba (`src/leads.ts`)

Nowe eksportowane funkcje:

```typescript
/**
 * Result item for todo-msg dashboard queries
 */
export interface TodoMsgResult {
  leadKey: string;
  leadName: string;
  loca?: string;
  valid: boolean;
}

/**
 * Gets leads with //todo marker in their messages.
 * Uses the same logic as chad-console's "Find Todo" feature.
 */
export async function getTodoMsgLeads(): Promise<TodoMsgResult[]>;

/**
 * Gets leads where your-first-message is true (first message not sent yet).
 * Uses the same logic as the status system.
 */
export async function getFirstMsgLeads(): Promise<TodoMsgResult[]>;
```

Dodatkowe pomocnicze funkcje eksportowane:
- `getYamlFieldValue(body, field)` - pobiera wartość pola z YAML
- `parseStatusBody(body)` - parsuje YAML do mapy key-value
- `hasField(body, field)` - sprawdza czy pole istnieje

#### 2. API Endpoint (`/api/todo-msg`)

Cienka warstwa wywołująca publiczne funkcje z chad-dba:

```typescript
import { getTodoMsgLeads, getFirstMsgLeads } from "chad-dba";

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type");
  
  if (type === "todo") {
    return NextResponse.json(await getTodoMsgLeads());
  } else if (type === "first-msg") {
    return NextResponse.json(await getFirstMsgLeads());
  }
}
```

**Brak logiki biznesowej w endpointcie!** Wszystkie operacje na danych są w chad-dba.

#### 3. Dashboard Page (`/dashboard/todo-msg`)

Komponent React z:
- **Dropdown na górze** - wybór kategorii (Todo / Your first msg)
- **Lista leadów** - wyświetla leady z aktualnie wybranej kategorii
- **Przycisk refresh** - ręczne odświeżenie danych

Komponent pobiera dane przez `fetch("/api/todo-msg?type=...")` - nie importuje chad-dba bezpośrednio.

#### 4. Sidebar Menu

Nowa pozycja "Todo msg" dodana **NA SAMEJ GÓRZE** sekcji "Pages", przed "Forms".

Ikona: `ListTodo` z lucide-react.

## Źródła danych

Wszystkie dane pochodzą z Content Provider API przez bibliotekę chad-dba:

### Funkcje użyte z chad-dba:

1. **`TodoLeads()`** - zwraca wszystkie itemy zawierające `//todo`
2. **`GetAllLeads()`** - zwraca mapę wszystkich leadów (girlId -> girlName)
3. **`chad_GetLeadsStatuses()`** - zwraca wszystkie statusy leadów
4. **`chad_GetLeadsLoca()`** - zwraca numeryczną ścieżkę folderu leads
5. **`chad_GetRelativeLoca()`** - wyciąga względną ścieżkę
6. **`chad_GetFirstSegment()`** - wyciąga pierwszy segment ścieżki
7. **`getYamlFieldValue()`** - pobiera wartość pola z YAML body

## Sposób działania dropdowna

1. Użytkownik wybiera kategorię z dropdowna
2. Komponent ustawia stan `filterType`
3. `useEffect` wykrywa zmianę `filterType`
4. Funkcja `loadLeads()` wysyła `fetch("/api/todo-msg?type={filterType}")`
5. API route wywołuje odpowiednią publiczną funkcję z chad-dba
6. Odpowiedź JSON jest wyświetlana na liście

**Kluczowe:** Tylko lista się przeładowuje, nie cała aplikacja.

## Sposób rozszerzania o kolejne kategorie

### Krok 1: Dodaj publiczną funkcję do chad-dba

W `src/leads.ts`:
```typescript
export async function getNowaKategoriaLeads(): Promise<TodoMsgResult[]> {
  // Pełna logika biznesowa tutaj
  // ...
  return results;
}
```

### Krok 2: Zbuduj chad-dba

```bash
cd chad-dba
npm run build
```

### Krok 3: Dodaj opcję do API endpoint

W `app/api/todo-msg/route.ts`:
```typescript
import { getNowaKategoriaLeads } from "chad-dba";

if (type === "nowa-kategoria") {
  return NextResponse.json(await getNowaKategoriaLeads());
}
```

### Krok 4: Dodaj opcję do dropdowna w UI

W `page.tsx`:
```typescript
type FilterType = "todo" | "first-msg" | "nowa-kategoria";

const FILTER_LABELS: Record<FilterType, string> = {
  "todo": "Todo",
  "first-msg": "Your first msg",
  "nowa-kategoria": "Nowa kategoria",
};
```

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
3. Sprawdź czy lista "Todo" wyświetla leady z markerem `//todo`
4. Zmień dropdown na "Your first msg"
5. Sprawdź czy lista wyświetla leady z `your-first-message: true`
6. Kliknij "Refresh" aby odświeżyć dane

## Powiązane pliki

- `../chad-console/src/cli.ts` - Oryginalna implementacja "Find Todo" (logika przeniesiona do chad-dba)
- `../chad-dba/src/leads.ts` - Publiczne funkcje dostępu do danych
- `../chad-dba/src/path-resolver.ts` - `chad_GetLeadsStatuses()` i helpery ścieżek
- `components/shared/sidebar.tsx` - Menu boczne