# Bug task dla Cline — contacts znowu niewidoczne + linki muszą być pełne i klikalne

W zakładce `Leads`, w szczegółach konkretnego leada, znowu nie widać kontaktów mimo że lead ma wpisany kontakt w `contacts`.

To jest druga wersja buga, który już wcześniej występował. Najpierw znajdź poprzedni bug / dokumentację rozwiązania i sprawdź, czy obecny problem ma tę samą przyczynę.

---

# Aktualny przykład buga

Lead:

```text
26-05-12_pi_Marzenka_Styk
```

Loca:

```text
03/06/71
```

W UI widać:

```text
Contacts
No contacts
```

A ręcznie sprawdzony `contacts` ma zawartość YAML:

```yaml
instagram:
  - https://www.instagram.com/direct/t/108269560573767/
```

W UI powinno być widoczne:

```text
https://www.instagram.com/direct/t/108269560573767/
```

i link powinien być klikalny.

---

# Oczekiwane zachowanie

1. Jeśli lead ma `contacts`, UI nie może pokazywać `No contacts`.
2. Link ma być widoczny w całości.
3. Link ma być klikalny.
4. Nie wolno ucinać linku.
5. Nie wolno zamieniać linku na samą nazwę typu `instagram`.
6. Jeśli w YAML jest slash na końcu, zachowaj go.
7. Jeśli jest wiele kontaktów, pokaż wszystkie.
8. Jeśli są różne klucze YAML, np. `instagram`, `number`, `facebook`, `whatsapp`, pokaż je wszystkie.

---

# Ważne: typ danych contacts

`contacts` to jeden `text-item`.

To NIE jest folder-item.

Nie traktuj `contacts` tak jak `msg workout`.

Oczekiwany flow:

1. mamy konkretnego leada,
2. pobieramy child `contacts` pod leadem,
3. `contacts` jest text-itemem,
4. czytamy jego body,
5. parsujemy YAML,
6. renderujemy wszystkie wartości,
7. URL-e renderujemy jako pełne klikalne linki.

---

# Preferowane pobieranie danych

Jeżeli mamy `leadLoca`, użyj nowej metody:

```json
["IRepoService","IItemWorker","GetByNames2","<repoGuid>","<leadLoca>","contacts"]
```

Przykład:

```json
["IRepoService","IItemWorker","GetByNames2","21d11bdc-f1f4-44d1-b61a-3fa6b039c641","03/06/71","contacts"]
```

Jeżeli `GetByNames2` zwróci text-item `contacts`, użyj jego body.

Nie używaj pełnego resolve po:

```text
leads, all items, leadName, contacts
```

jeżeli mamy już `leadLoca`.

Nie hardcoduj `03/06/71`; to jest tylko przykład.

---

# Co sprawdzić przed poprawką

Najpierw przeczytaj:

1. `architecture/chad-dba/project-goal.md`
2. `architecture/chad-dba/import-dba.md`
3. `architecture/chad-dba/data-access.md`
4. `architecture/chad-dba/cp-paths.md`
5. `architecture/chad-dba/resolve-paths.md`
6. `architecture/chad-dba/post-parent-item.md`
7. `architecture/ai-docs/feature-documentation-rules.md`
8. poprzednią dokumentację buga o niewidocznych contacts
9. dokumentację feature’a szczegółów leada
10. kod renderowania contacts w szczegółach leada
11. parser contacts/YAML, jeśli istnieje

---

# Hipotezy do sprawdzenia

Nie zgaduj. Sprawdź w kodzie.

Możliwe przyczyny:

1. `contacts` jest pobierany starą metodą `GetByNames` i wywala się / zwraca pusty wynik.
2. UI traktuje brak danych i błąd tak samo.
3. Parser YAML nie obsługuje list pod kluczem, np.:

```yaml
instagram:
  - https://www.instagram.com/direct/t/108269560573767/
```

4. Parser obsługuje tylko `number`, a ignoruje `instagram`.
5. Link jest parsowany, ale renderer go ukrywa albo skraca.
6. Link jest renderowany jako tekst bez `<a href>`.
7. Kod oczekuje innego formatu body niż realny YAML.

---

# Zakazy

Nie wolno:

* maskować błędu jako `No contacts`,
* zwracać pustej listy przy błędzie parsera,
* hardcodować Marzenki ani jej loca,
* hardcodować `instagram`,
* obsługiwać tylko jednego typu kontaktu,
* ucinać linków,
* robić regexowego hacka tylko pod ten jeden przykład,
* traktować `contacts` jak folder-item,
* pobierać contacts przez filesystem / Dropbox bezpośrednio.

---

# Implementacja

Napraw pobieranie i renderowanie contacts tak, żeby:

1. używało `leadLoca` i `GetByNames2`, jeśli leadLoca jest dostępne,
2. poprawnie pobierało body text-itemu `contacts`,
3. parser YAML obsługiwał strukturę:

```yaml
instagram:
  - https://www.instagram.com/direct/t/108269560573767/
```

4. parser obsługiwał wiele kluczy i wiele wartości,
5. UI renderowało pełne wartości,
6. URL-e były linkami `<a href="...">...</a>`,
7. linki otwierały się poprawnie,
8. brak contacts był rozróżniony od błędu.

---

# Oczekiwany efekt dla przykładu

Dla:

```text
26-05-12_pi_Marzenka_Styk
03/06/71
```

z body:

```yaml
instagram:
  - https://www.instagram.com/direct/t/108269560573767/
```

UI ma pokazać w sekcji Contacts:

```text
instagram:
https://www.instagram.com/direct/t/108269560573767/
```

Link ma być klikalny i widoczny w całości.

---

# Test

Po poprawce sprawdź:

1. lead `26-05-12_pi_Marzenka_Styk`,
2. czy nie ma już `No contacts`,
3. czy widoczny jest pełny link:
   `https://www.instagram.com/direct/t/108269560573767/`,
4. czy link jest klikalny,
5. lead bez contacts pokazuje `No contacts`,
6. lead z numerem telefonu pokazuje numer,
7. lead z kilkoma kontaktami pokazuje wszystkie,
8. błąd API pokazuje error, a nie `No contacts`,
9. konsola przeglądarki nie ma nowych błędów,
10. Network pokazuje poprawne wywołanie przez `GetByNames2`.

---

# Dokumentacja

Dodaj albo zaktualizuj bug doc:

```text
architecture/chad-dashboard/bugs/contacts-not-visible-v2.md
```

Jeżeli przyczyna leży w `chad-dba`, dodaj też albo zaktualizuj odpowiedni bug doc w:

```text
architecture/chad-dba/bugs/[nazwa-buga].md
```

W dokumentacji opisz:

* objaw,
* przykład Marzenki,
* realny YAML,
* przyczynę,
* poprawkę,
* różnicę między `contacts` jako text-item a `msg workout` jako folder-item,
* testy,
* czego nie wolno robić w przyszłości.
