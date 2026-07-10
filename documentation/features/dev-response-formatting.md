# Dev Response Formatting Feature

## Cel

Formatowanie odpowiedzi HTTP (response/error) w panelu deweloperskim Blazor w czytelny sposób, z obsługą prefiksów takich jak `error:`, `warning:`, `response:`.

## Gdzie jest używany

- **Komponent**: `content-provider/front_blazor/BlazorApp/Components/DevErrorPanel.razor`
- **Karta**: Requests (zakładka "🌐 Requests")
- **Metody**:
  - `GetFormattedResponseBody(string responseBody)` - główna metoda formatująca
  - `CopyResponseBody(string responseBody)` - kopiuje sformatowaną wersję do schowka

## Jak działa formatowanie

### 1. Normalny JSON

Jeśli odpowiedź jest czystym JSON-em (zaczyna się od `{`), jest formatowana z wcięciami:

**Wejście:**
```
{"Body":{"01":"opłaty do 20-stego"},"Settings":{"id":"194849d9-4526-430f-b374-c17ada4fc983","type":"Folder","name":"instrukcje"}}
```

**Wyjście:**
```json
{
  "Body": {
    "01": "opłaty do 20-stego"
  },
  "Settings": {
    "id": "194849d9-4526-430f-b374-c17ada4fc983",
    "type": "Folder",
    "name": "instrukcje"
  }
}
```

### 2. Odpowiedź z prefixem

Jeśli odpowiedź zaczyna się od prefixu zakończonego dwukropkiem (np. `error:`, `warning:`, `response:`), a po dwukropku od razu zaczyna się JSON (`{`):

- Prefix jest zachowywany w pierwszej linii
- JSON po prefixie jest formatowany z wcięciami w kolejnych liniach

**Wejście:**
```
error:{"messageType":"System.Reflection.TargetInvocationException","message":"Exception has been thrown by the target of an invocation.","stackTrace":"..."}
```

**Wyjście:**
```
error:
{
  "messageType": "System.Reflection.TargetInvocationException",
  "message": "Exception has been thrown by the target of an invocation.",
  "stackTrace": "..."
}
```

### 3. Obsługiwane prefixy

Mechanizm wykrywa dowolny prefix zakończony dwukropkiem, jeśli:
- Dwukropek znajduje się na pozycji > 0
- Bezpośrednio po dwukropku zaczyna się `{`

Przykłady obsługiwanych prefixów:
- `error:{...}`
- `warning:{...}`
- `response:{...}`
- `data:{...}`

### 4. Fallback

Jeśli nie da się sparsować JSON-a (np. odpowiedź nie jest JSON-em), zwracany jest oryginalny tekst bez zmian.

## Przyciski

### Kolejność przycisków

1. **`copy`** (pierwszy od lewej)
2. **`Show full response`** (drugi, po prawej)

### Styl przycisków

Oba przyciski używają klasy `dev-btn dev-btn-toggle-full`:
- Niebieskie tło (`#007acc`)
- Białe tekst
- Ten sam rozmiar i padding (`4px 12px`)
- Hover: ciemniejsze niebieskie (`#005a9e`)

### Zachowanie przycisków

#### `copy`
- Kopiuje **sformatowaną wersję** odpowiedzi (tę samą, która jest wyświetlana w panelu)
- Używa `navigator.clipboard.writeText()` przez IJSRuntime
- Działa nawet gdy odpowiedź jest długa i pokazany jest fragment (kopiuje całą odpowiedź)

#### `Show full response`
- Pokazywany tylko gdy odpowiedź ma więcej niż 1000 znaków
- Przełącza między pokazaniem fragmentu (do 1000 znaków) a pełną odpowiedzią
- Tekst przycisku zmienia się na `Show less` gdy odpowiedź jest rozwinięta

## Implementacja

### Algorytm `GetFormattedResponseBody`

```csharp
private string GetFormattedResponseBody(string responseBody)
{
    if (string.IsNullOrEmpty(responseBody)) return string.Empty;

    // Sprawdź czy istnieje prefix zakończony ':'
    string? prefix = null;
    string jsonToFormat = responseBody;

    var colonIndex = responseBody.IndexOf(':');
    if (colonIndex > 0 && colonIndex < responseBody.Length - 1 && responseBody[colonIndex + 1] == '{')
    {
        prefix = responseBody.Substring(0, colonIndex + 1);
        jsonToFormat = responseBody.Substring(colonIndex + 1);
    }

    // Spróbuj sformatować JSON
    try
    {
        var jsonDoc = JsonNode.Parse(jsonToFormat);
        if (jsonDoc != null)
        {
            var options = new JsonSerializerOptions { WriteIndented = true };
            var formattedJson = jsonDoc.ToJsonString(options);
            if (prefix != null)
            {
                return prefix + "\n" + formattedJson;
            }
            return formattedJson;
        }
    }
    catch
    {
        // Nie JSON, zwróć oryginał
    }

    return responseBody;
}
```

### Przykłady wejścia/wyjścia

| Wejście | Wyjście |
|---------|---------|
| `{"name":"test"}` | `{\n  "name": "test"\n}` |
| `error:{"code":500}` | `error:\n{\n  "code": 500\n}` |
| `warning:{"msg":"warn"}` | `warning:\n{\n  "msg": "warn"\n}` |
| `plain text` | `plain text` (bez zmian) |
| `error:invalid json` | `error:invalid json` (bez zmian, fallback) |

## Testowanie

Aby przetestować feature:
1. Otwórz panel deweloperski (ikona 🔧 po prawej stronie)
2. Przejdź do zakładki "Requests"
3. Wykonaj request, który zwróci JSON lub error z prefixem
4. Sprawdź czy odpowiedź jest poprawnie sformatowana
5. Kliknij `copy` i wklej do notatnika, aby sprawdzić czy skopiowała się sformatowana wersja