Dodaj kolejny feature / bugfix w preview edytora.

Problem:
W edytorze / preview są obsługiwane moje customowe notatki z headerami typu:

//todo
//ocena
- kapitał; średni
- logistyka; częściowo znana

Ale jeśli wpiszę zwykły Markdown, np.:

# Tytuł

## Sekcja

* punkt 1
* punkt 2

to preview pokazuje:

Empty content

To jest bug.

Cel:
Preview ma automatycznie rozpoznawać, czy zawartość jest:

1. moim customowym formatem headerów `//`
2. zwykłym Markdownem

I renderować odpowiednio.

Zasada działania:

* pobierz próbkę tekstu z edytora / body
* sprawdź, jaki to format
* jeśli to customowy format `//`, użyj obecnego parsera / renderera customowych headerów
* jeśli to Markdown, renderuj jako Markdown
* jeśli format jest mieszany albo niepewny, nie pokazuj `Empty content`, tylko pokaż treść w bezpiecznym fallbacku, np. jako plain text albo Markdown

Detekcja formatu:
Dodaj prostą funkcję, np. `detectPreviewFormat(content)`.

Przykładowa logika:

* jeśli content po trim jest pusty → empty
* jeśli znacząca liczba linii zaczyna się od `//` albo zawiera strukturę moich headerów `//nazwa` → `custom-headers`
* jeśli content zawiera typowe Markdown elementy:

  * `# heading`
  * `## heading`
  * `- lista`
  * `1. lista`
  * `fenced code block`
  * `[link](url)`
  * `**bold**`
    → `markdown`
* jeśli content nie pasuje jednoznacznie → `plain-text`

Ważne:

* nie rozpoznawaj każdej linii z `//` jako custom format, bo w kodzie albo URL-ach też może być `//`
* custom format powinien być rozpoznany głównie wtedy, gdy linie zaczynają się od `//` po trimie, np. `//todo`, `//ocena`, `//chat gpt`
* Markdown powinien być rozpoznawany, gdy tekst ma normalne markdownowe nagłówki `#`, listy albo formatting

Wymagane zachowanie:

1. Dla custom formatu:

   * obecny preview ma działać jak wcześniej
   * nic nie zepsuj w renderowaniu `//todo`, `//ocena`, `//chat gpt`, `//n`

2. Dla Markdown:

   * preview nie może pokazywać `Empty content`
   * ma renderować Markdown jako Markdown

3. Dla plain text:

   * preview nie może pokazywać `Empty content`
   * ma pokazać treść jako zwykły tekst

4. Dla pustego tekstu:

   * dopiero wtedy można pokazać `Empty content`

Przykład Markdown do testu:

# Msg Workout

## Ocena

* kapitał: średni
* logistyka: niepewna
* kierunek: rebuild

## Wiadomość

spoko xd już miałem zamykać akcję ratunkową. wróciłaś już do świata żywych?

Ten tekst ma poprawnie pokazać się w preview, a nie jako `Empty content`.

Test custom formatu:

//todo
//ocena
- kapitał; średni
- logistyka; częściowo znana

```
    //chat gpt
            - spoko xd przeżyłaś, to najważniejsze. wróciłaś już do świata żywych?
```

Ten tekst ma dalej renderować się obecnym customowym preview.

Implementacja:

* znajdź komponent / funkcję odpowiedzialną za preview edytora
* znajdź miejsce, gdzie pojawia się `Empty content`
* dodaj detekcję formatu przed renderowaniem
* nie rób dużego refaktoru
* zachowaj obecne działanie dla mojego customowego formatu
* dodaj fallback, żeby nie tracić treści w preview

Dokumentacja:
Po zakończeniu zapisz krótki opis feature / bugfix w projekcie `chad-dba`:

`architecture/[nazwa projektu]/features/[nazwa-featurea].md`

albo jeśli traktujesz to jako bugfix:

`architecture/[nazwa projektu]/bugs/[nazwa-buga].md`

W dokumencie opisz:

* problem: Markdown w preview dawał `Empty content`
* rozwiązanie: automatyczna detekcja `custom-headers` / `markdown` / `plain-text`
* jakie pliki zostały zmienione
* jak przetestować

Test ręczny:

1. Otwórz edytor z preview.
2. Wpisz custom format z headerami `//todo`.
3. Sprawdź, czy preview działa jak wcześniej.
4. Wpisz Markdown z `#`, `##`, listą `-`.
5. Sprawdź, czy preview renderuje Markdown i nie pokazuje `Empty content`.
6. Wpisz zwykły tekst bez Markdown.
7. Sprawdź, czy preview pokazuje tekst zamiast `Empty content`.
8. Wyczyść edytor.
9. Sprawdź, czy tylko wtedy pokazuje `Empty content`.
