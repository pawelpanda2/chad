# Bug: Statuses zakładka kręci się na "Loading leads..." w nieskończoność

## Problem

Zakładka `/dashboard/statuses` pokazywała spinner "Loading leads..." bez końca.
Żaden błąd nie był wyświetlany użytkownikowi.

## Przyczyny (dwie nakładające się)

### 1. Brak timeoutu w `invokeContentProvider`

`client.ts` w `chad-dba` używa `fetch()` bez AbortController/timeout.
Jeśli Content Provider API nie odpowiada (nie działa, zablokowany port),
`fetch` wisi w nieskończoność → Next.js route handler wisi → przeglądarka czeka bez końca.

**Fix:** Dodano 30-sekundowy timeout przez `AbortController` w `invokeContentProvider`.

### 2. Stara metoda pobierania statusów

`chad_GetLeadsStatuses()` używało wewnętrznie `chad_GetLeadsLoca()` przez `GetByNames`.
W Content Provider `GetByNames` może zachowywać się inaczej niż `PostByNames` (create-or-get).

**Poprawne podejście (z działającego testu C#):**
```
IItemWorker.PostByNames(repoId, "Folder", "leads", "all items")  → allItems
IManyItemsWorker.GetManyByName(repoId, allItems.AdrTuple.Loca, "status")  → statusy
```

**WAŻNE:** Używaj `IManyItemsWorker` (interfejs), NIE `ManyItemsWorker` (implementacja).
Błędna nazwa implementacji powoduje że Content Provider nie rozpoznaje workera
i albo wiesza zapytanie, albo zwraca błąd bez treści.

## Fix

### chad-dba/src/client.ts
- Dodano `AbortController` z timeoutem 30s do `invokeContentProvider`
- Jeśli timeout → czytelny błąd z URL i args

### chad-dba/src/path-resolver.ts — `chad_GetLeadsStatuses`
Zmieniono na bezpośredni flow z testu C#:
```typescript
// Step 1: PostByNames (create-or-get) zamiast GetByNames
const allItems = await invokeContentProvider([
  "IRepoService", "IItemWorker", "PostByNames",
  SHARED_REPO_ID, "Folder", "leads", "all items",
]);
const leadsLoca = chad_GetLocaFromAddress(allItems.Settings.address, SHARED_REPO_ID);

// Step 2: IManyItemsWorker (interfejs!) nie ManyItemsWorker
return invokeContentProvider([
  "IRepoService", "IManyItemsWorker", "GetManyByName",
  SHARED_REPO_ID, leadsLoca, "status",
]);
```

### chad-dashbord/app/api/statuses/route.ts
- Dodano `console.log` diagnostyczny: endpoint, args, wynik lub błąd
- Błąd zwracany jako `{ ok: false, error: "..." }` z HTTP 500

## Zasada

Dashboard nigdy nie może wisieć na loadingu bez komunikatu.
Każdy błąd (sieć, timeout, parsowanie) musi dotrzeć do UI.
