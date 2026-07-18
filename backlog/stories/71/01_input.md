# Story 71 — Inputs

Created retroactively (per `03_story-standard.md`'s backfill rule) — this
investigation/fix started as a plain regression report, not through the
normal "create the Story folder first" flow, and only got a Story folder
once the user asked for one after the fix was verified.

## Input 1

> co sie wydarzilo ze nie widze w zakladce daily tracker listy moich danych
> http://localhost:12020/dashboard/views?view=tracker
> sprawdz co sie stalo

## Input 2

> Pracujesz nad projektem CHAD.
>
> Najpierw przeczytaj:
>
> documentation/ai-docs/knowledge/01_ai_start.md
>
> Nie wykonuj szerokiego przeszukiwania repozytorium przed przeczytaniem tego dokumentu.
>
> To nie jest nowe Story.
>
> To jest analiza i naprawa regresji.
>
> Nie wykonuj deploymentu TEST ani PROD.
>
> ============================================================
> Cel
> ============================================================
>
> Napraw regresję w Daily Tracker.
>
> Widok:
>
> http://localhost:12020/dashboard/views?view=tracker
>
> Przestał wyświetlać moją listę danych.
>
> ============================================================
> Zakres
> ============================================================
>
> Najpierw ustal, dlaczego pojawiła się regresja.
>
> Nie zaczynaj od przypadkowego poprawiania kodu.
>
> 1. Sprawdź, od kiedy problem występuje.
> 2. Ustal, które Story lub zmiana najprawdopodobniej go wprowadziły.
> 3. Porównaj obecną implementację z poprzednią.
> 4. Znajdź rzeczywistą przyczynę regresji.
>
> Następnie prześledź cały przepływ danych:
>
> Dashboard
> → API route
> → packages/dba
> → Content Provider
>
> Nie naprawiaj objawu.
>
> Znajdź rzeczywistą przyczynę problemu.
>
> ============================================================
> Po znalezieniu przyczyny
> ============================================================
>
> Napraw regresję.
>
> Sprawdź również, czy ta sama przyczyna nie występuje w pozostałych widokach korzystających z podobnego mechanizmu.
>
> ============================================================
> Weryfikacja
> ============================================================
>
> Po naprawie:
>
> - wykonaj odpowiedni typecheck,
> - wykonaj wymagane buildy,
> - wykonaj ręczny test Daily Tracker,
> - potwierdź, że lista danych ponownie się wyświetla.
>
> W raporcie opisz:
>
> - przyczynę regresji,
> - zmienione pliki,
> - dlaczego problem powstał,
> - w jaki sposób został naprawiony,
> - jakie testy wykonałeś.

(Sent twice in immediate succession as a mid-turn interruption; content identical both times.)

## Input 3

> kontynuuj

## Input 4

> 8b603669-f8e6-4224-bd78-a474998995fa-04-02
> dane tej tabeli daily tracker sa pod tym adresem cp i tez fizyzcnymi folderami: 8b603669-f8e6-4224-bd78-a474998995fa/04/02
> tyle folderow jest z body.txt i config.yaml:
>
> 01 01
> 02 02
> 03 03
> ...
> 84 84

(Ground-truth listing of all 84 physical folder names under the real
Content Provider path for the `kamil_s` account, provided by the user
directly from the filesystem, showing every physical key cleanly mapped to
a matching logical name — used to compare against what the Content
Provider's own API was returning.)

## Input 5

(Sent together with a screenshot of the Daily Tracker table showing several
blank rows above the real data.)

> wyswietlilo sie ale jakies dziwne puste linie sa u gory
> zrobi mi raport w nowej historyjce na temat tego co bylo tu rozwiazaniem i na czym polegal problem

## Input 6

(Sent together with a screenshot showing the same 5 rows repeating
several times with blank gaps between each repeat, after clicking the
DATE column header to sort.)

> a jak klikam sortowanie po dacie to sei jeszcze dziwniej robi
> jakies dziewne przerwy

## Input 7

> i jezeli sie laduje to nei powinno byc tego napisu: No entries yet. Use Forms to add data.
> tylko jakis indykator ladowania

## Input 8

(Sent together with a screenshot showing "0 of 0" / "No entries yet.")

> teraz sie laduje dlugo i nie widze zadnych danych od dluzszej chwili

## Input 9

(Sent together with a screenshot showing the table fully loaded with "84 of 84".)

> teraz to sie zaladowalo
