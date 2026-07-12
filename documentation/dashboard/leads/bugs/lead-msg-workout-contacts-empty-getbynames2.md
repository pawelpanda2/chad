# Bug: Lead details — "Empty response body … GetByNames2 … 'msg workout'"

## Status
**Naprawione** (2026-07-13). Rozwiązanie: idempotentny find-or-create sub-itemów
przez `PostParentItem` w `packages/dba`, z auto-healem przy podglądzie leada i
masowym backfillem dla wszystkich leadów.

## Rozwiązanie

`packages/dba/src/leads.ts`:
- `ensureLeadSubItems(leadLoca)` — find-or-create `contacts` (Text) i
  `msg workout` (Folder) przez `PostParentItem` (idempotentne; dla istniejących
  zwraca istniejące, nic nie tworzy). Fizyczne dzieci pozostają numeryczne,
  nazwy logiczne są w configu itemu — nic nie tworzy ręcznie folderu o nazwie
  domenowej. Waliduje, że `leadLoca` nie zawiera repo GUID.
- `ensureAllLeadsSubItems()` — iteruje mapę `leads/all items` i wywołuje
  `ensureLeadSubItems` dla każdego leada (`${leadsLoca}/${leadKey}`).
- `getLeadDetailsWithWorkouts` woła `ensureLeadSubItems` na początku
  (auto-heal), więc podgląd dowolnego leada naprawia go w locie. Po utworzeniu
  folder jest odnajdywany tym samym flow (`GetByNames2` zwraca pusty, ale
  poprawny folder zamiast pustej odpowiedzi HTTP).

`packages/dashboard/app/api/admin/ensure-lead-subitems/route.ts` — cienki
adapter (auth → `runWithRepoContext` → `ensureAllLeadsSubItems` → JSON), do
jednorazowego backfillu wszystkich leadów. Dashboard NIE woła surowego CP.

Dlaczego to działa: `PostParentItem` jest find-or-create (patrz
`documentation/dba/post-parent-item.md`) i rejestruje nazwę logiczną, więc
`GetByNames2` po „msg workout" trafia. Pierwotny błąd wynikał z braku folderu
(pusta odpowiedź HTTP w `GetByNames2`), nie ze złej metody tworzenia.

## Objaw

Po dodaniu nowego leada, w informacjach leada pojawia się:

```
Empty response body from /invoke. Args:
["IRepoService","IItemWorker","GetByNames2","<repoGuid>","03/06/88","msg workout"]
```

Analogicznie dla `contacts`, gdy nie wpisano żadnego kontaktu.

## Ustalenia (analiza kodu)

Tworzenie leada JUŻ tworzy oba brakujące elementy —
`packages/dba/src/leads.ts` → `createLead()`:

- **Step 3**: `PostParentItem(repo, leadLoca, "Text", "contacts")` + `Put(...)`
  (zawsze, nawet dla pustych kontaktów).
- **Step 4**: `PostParentItem(repo, leadLoca, "Folder", "msg workout")`.

Odczyt (`getMsgWorkouts`, `getContacts`) używa
`GetByNames2(repo, leadLoca, "msg workout" | "contacts")`.

Zatem błąd jest po stronie **odczytu/rozpoznania nazwy**, nie braku tworzenia:
`GetByNames2` po logicznej nazwie „msg workout" zwraca pustą odpowiedź dla
elementu utworzonego przez `PostParentItem`.

## Prawdopodobna przyczyna (do potwierdzenia)

Zgodnie z konwencją CHAD: **fizyczne foldery są numeryczne**, a nazwy logiczne
są w `config.yaml`; wyszukiwanie idzie po nazwach logicznych przez metody CP.
Hipoteza: `PostParentItem(..., "Folder", "msg workout")` tworzy folder, ale nie
rejestruje nazwy logicznej „msg workout" w `config.yaml` tak, jak oczekuje
`GetByNames2` — więc odczyt po nazwie nie trafia. Albo `Step 4` nie sprawdza
wyniku i cicho zawodzi.

## Czego NIE robić

- Nie tworzyć folderu o dosłownej nazwie zakładając, że to zadziała.
- Nie budować fizycznych ścieżek ręcznie.

## Otwarte pytania do właściciela

1. Jaka jest poprawna metoda tworzenia pod-folderu/itemu z nazwą logiczną, żeby
   `GetByNames2` go potem znajdował (np. `PostByNames`/`GetManyByName` zamiast
   `PostParentItem`)? Wzorzec z działającego kodu?
2. Czy `03/06/88` w argumentach to poprawna `leadLoca`, czy zła rozdzielczość
   ścieżki (wygląda jak data, nie numeryczne loca)?

## Powiązane pliki

- `packages/dba/src/leads.ts` — `createLead`, `getMsgWorkouts`, `getContacts`
- `packages/dashboard/app/api/forms/lead/route.ts`
- `documentation/dba/post-parent-item.md`, `documentation/content-provider/*`
