# Feature: Todo Msg Compact Layout

## Cel (Goal)

Stworzenie kompaktowego, czytelnego układu listy wiadomości todo w dashboardzie. Layout ma być maksymalnie przejrzysty i wykorzystywać dostępną przestrzeń w sposób efektywny.

## Zasady layoutu

### 1. Górny pasek (Top Bar)

```
┌─────────────────────────────────────────────────────────────┐
│ [Combobox: Todo v]                           3 leads found  │
│                                              [Refresh]       │
```

- **Combobox** po lewej stronie — wybór kategorii (Todo / Your first msg)
- **Licznik leadów** (`X leads found`) po prawej stronie, obok comboboxa
- **Przycisk Refresh** po prawej stronie, NAD górną krawędzią ramki z listą

### 2. Ramka z listą (List Frame)

```
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  • Lead 1                                             │  │
│  │  • Lead 2                                             │  │
│  │  • Lead 3                                             │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

- **Brak wewnętrznego headera** — w ramce NIE MA dodatkowego nagłówka z `Todo`, `Refresh`, ani `X leads found`
- **Lista zaczyna się od razu od pierwszego leada** — żaden dodatkowy element nad listą
- **Każdy lead w jednej linii** — kompaktowy format

### 3. Element listy (Lead Item)

```
┌─────────────────────────────────────────────────────────────┐
│ • 26-07-06_pn_Karolina_ruda                                 │
│ • 26-07-05_pt_Anna_brunet                                   │
│ • 26-07-04_śr_Maja_ruda                                     │
└─────────────────────────────────────────────────────────────┘
```

- Lead wyświetlany w **jednej linii**
- Nazwa leada jako główny element
- Możliwość kliknięcia w lead (przekierowanie do edytora)

## Pełny widok

```
┌─────────────────────────────────────────────────────────────┐
│ [Combobox: Todo v]                           3 leads found  │
│                                              [Refresh]       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  • 26-07-06_pn_Karolina_ruda                          │  │
│  │  • 26-07-05_pt_Anna_brunet                            │  │
│  │  • 26-07-04_śr_Maja_ruda                              │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Ważne zasady

### ❌ CZEGO NIE ROBIĆ

1. **NIE przenosić przycisku `Refresh` na dół listy**
   - Refresh musi być NAD ramką, po prawej stronie

2. **NIE duplikować licznika `X leads found`**
   - Licznik występuje TYLKO raz — obok comboboxa w górnym pasku
   - Nie może być drugiego licznika wewnątrz ramki ani na dole

3. **NIE dodawać headera wewnątrz ramki**
   - W ramce nie może być dodatkowego wiersza z napisem `Todo`
   - Nie może być tam przycisku `Refresh`
   - Nie może być tam licznika `X leads found`

4. **NIE rozdzielać leadów na wiele linii**
   - Każdy lead zajmuje tylko jedną linię
   - Nazwa leada jest wystarczająca

### ✅ CO ROBIĆ

1. **Utrzymuj kompaktowość**
   - Minimalna ilość pustej przestrzeni
   - Lead w jednej linii
   - Brak zbędnych elementów

2. **Zachowaj czytelność**
   - Wyraźne oddzielenie górnego paska od listy
   - Czytelne nazwy leadów
   - Wystarczający kontrast

3. **Prawidłowe pozycjonowanie**
   - Combobox i licznik w jednym rzędzie na górze
   - Refresh nad ramką, wyrównany do prawej
   - Lista zaczyna się bezpośrednio pod górną krawędzią ramki

## Implementacja

### Struktura komponentu

```tsx
// Górny pasek
<div className="top-bar">
  <Combobox value={filterType} onChange={setFilterType} />
  <span className="lead-count">{leads.length} leads found</span>
  <Button onClick={refresh}>Refresh</Button>
</div>

// Ramka z listą (bez wewnętrznego headera!)
<div className="list-frame">
  <ul className="lead-list">
    {leads.map(lead => (
      <li key={lead.leadKey} className="lead-item">
        {lead.leadName}
      </li>
    ))}
  </ul>
</div>
```

### Style CSS (przykład)

```css
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.lead-count {
  color: #666;
  font-size: 0.875rem;
}

.list-frame {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px;
}

.lead-item {
  padding: 8px 12px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lead-item:hover {
  background-color: #f3f4f6;
}
```

## Powiązane pliki

- `../chad-dashbord/app/(dashboard)/dashboard/todo-msg/page.tsx` - Główny komponent listy
- `../chad-dba/src/leads.ts` - Publiczne funkcje `getTodoMsgLeads()` i `getFirstMsgLeads()`

## Powiązana dokumentacja

- [todo-msg-dashboard.md](todo-msg-dashboard.md) - Ogólna dokumentacja feature
- [todo-msg-editor.md](todo-msg-editor.md) - Dokumentacja edytora
- [todo-msg-refresh-layout.md](../bugs/todo-msg-refresh-layout.md) - Bug report dotyczący layoutu