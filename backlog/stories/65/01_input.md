# Story 65 — Inputs

## Input 1

Istniejące osobne repo `net-content-provider` już znajduje się w moim workspace i ma własną historię Git. Nie twórz nowego repo.

Znajdź je, sprawdź jego:
- dokładną ścieżkę,
- remote,
- branch,
- aktualny commit,
- niezacommitowane zmiany.

Następnie porównaj je z:
`chad/packages/net-content-provider`

Ustal, czy zawartość obu katalogów jest zgodna i jakie są różnice.

Docelowo chcę, aby:
- istniejące repo `net-content-provider` było używane jako git submodule,
- submodule znajdował się pod `chad/packages/net-content-provider`,
- CHAD zapamiętywał konkretny commit Content Providera,
- nie została utracona żadna historia ani lokalne zmiany.

Najpierw przygotuj dokładny plan migracji i rollback. Nie wykonuj jeszcze `git rm`, `git submodule add`, kopiowania, commitów ani innych zmian.

## Input 2 (sent mid-turn, while Input 1 was still being researched)

podpowiem ci to jest to repo:
pawelfluder@Pawes-Air content-provider % pwd
/Users/pawelfluder/03_synch/01_files_programming/08_nodejs/content-provider
pawelfluder@Pawes-Air content-provider %

## Input 3 (sent mid-turn, superseding Input 1's "plan only" instruction with a concrete staged execution request; message was cut off mid-Etap-2)

Chcę teraz wykonać migrację `packages/net-content-provider` z głównego repo `chad` do istniejącego, osobnego repozytorium `net-content-provider`, a następnie podłączyć je z powrotem do CHAD jako git submodule.

Nie interesuje mnie, czy zawartość istniejącego osobnego repo jest starsza lub inna. Źródłem prawdy ma być aktualna zawartość:

`chad/packages/net-content-provider`

Masz przenieść właśnie ten aktualny stan do osobnego repo, zachować historię Git osobnego repo, zacommitować nowy stan, a następnie zamienić katalog w CHAD na submodule.

## Główne wymagania

1. Nie wolno utracić żadnego pliku ani żadnej aktualnej zmiany z:
   `chad/packages/net-content-provider`
2. Nie wolno usunąć katalogu przed wykonaniem i zweryfikowaniem kopii bezpieczeństwa.
3. Nie twórz nowego repozytorium Git — znajdź istniejące repo `net-content-provider` w workspace.
4. Zachowaj jego istniejący katalog `.git` i historię.
5. Aktualna zawartość z CHAD ma zastąpić zawartość roboczą osobnego repo.
6. Po skopiowaniu wykonaj commit w osobnym repo.
7. Dopiero później usuń bezpośrednio śledzony katalog z CHAD i dodaj w tym samym miejscu submodule.
8. CHAD ma wskazywać konkretny commit nowego submodule.
9. Nie usuwaj kopii bezpieczeństwa do końca całej operacji i testów.

## Etap 1 — audyt i ustalenie ścieżek

Najpierw ustal:

- root repo `chad`,
- ścieżkę:
  `chad/packages/net-content-provider`
- ścieżkę istniejącego osobnego repo `net-content-provider`,
- remote osobnego repo,
- aktualny branch,
- aktualny commit,
- status obu repozytoriów,
- czy w osobnym repo istnieje `.git`,
- czy `packages/net-content-provider` jest obecnie bezpośrednio śledzony przez repo CHAD.

Pokaż te informacje przed właściwą migracją.

Nie wykonuj `git init`.

## Etap 2 — wykonaj dwie kopie bezpieczeństwa

Przed zmianami utwórz kopię aktualnego katalogu:

`chad/packages/net-content-provider`

w bezpiecznym katalogu poza repo CHAD, np.:

```text
/Users/pawelfluder/03_synch/01_files_programming/08_nodejs/_backup_net-content-provider_<timestamp>
```

(Message was cut off here by the client before a full specification of the
second backup and any further Etaps was received.)
