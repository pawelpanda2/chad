# Story 64 — Inputs

## Input 1

hcę utworzyć nowe Story (nowy numer zgodnie z obowiązującą numeracją) dotyczące poprawy diagnostyki błędów w projekcie `net-content-provider`.

Najpierw wykonaj standardowy proces projektowy zgodnie z dokumentacją projektu (nowy folder Story, plan, wiedza, checklista itd.). Nie implementuj niczego przed przygotowaniem dokumentacji i moją akceptacją.

## Problem

Obecnie podczas błędów Content Providera otrzymujemy bardzo mało informacji, np.:

- `TargetInvocationException`
- `InvalidOperationException`
- `Operation is not valid due to the current state of the object.`

oraz stack trace.

To nie wystarcza do szybkiej diagnostyki.

Przykład:

```
ItemWorker.GetItem(repo, loca)
→ ConfigWorker.GetConfigDictionary(...)
→ PathWorker.HandleError()
```

Nie wiadomo:

- jaka dokładnie ścieżka była odczytywana,
- jaki był `repo`,
- jaka była `loca`,
- jaki pełny path został zbudowany,
- czy katalog istniał,
- czy istniał `config.yaml`,
- jaka była zawartość `config.yaml`,
- czy parser YAML zwrócił błąd,
- czy problem dotyczył pliku `body`,
- czy problem dotyczył adresu w `config.yaml`.

## Cel

Chcę zaprojektować znacznie lepszy system diagnostyczny dla Content Providera.

Szczególnie w Dev Panelu dashboardu chcę widzieć dokładną przyczynę problemu.

Przykładowo zamiast:

```
Operation is not valid...
```

powinienem zobaczyć coś w rodzaju:

```
Repo:
0fc7da8d-3466-4964-a24c-dfc0d0fef87c

Loca:
01/01

Resolved path:
/share/dropbox/repos/0fc7da8d-3466-4964-a24c-dfc0d0fef87c/01/01

Directory exists:
YES

config.yaml:
FOUND

config.yaml content:
...

body:
FOUND

Validation:
Address mismatch

Expected:
0fc7da8d-3466-4964-a24c-dfc0d0fef87c/01/01

Actual:
0fc7da8d-3466-4964-a24c-dfc0d0fef87c/01/02
```

lub:

```
config.yaml:
NOT FOUND
```

albo:

```
Directory:
NOT FOUND
```

## Ważne

Nie chcę tylko lepszego komunikatu tekstowego.

Chcę zaprojektować pełny model diagnostyczny, który będzie zwracany przez Content Providera i prezentowany w Dashboard Dev Panel.

Przeanalizuj:

- jak najlepiej zaprojektować taki model,
- jakie informacje powinny być zwracane,
- które dane są bezpieczne do pokazania tylko w DEV,
- jak zachować kompatybilność z istniejącym API,
- czy warto wprowadzić dedykowany model `DiagnosticInfo`,
- czy zamiast rzucania `InvalidOperationException` powinny powstać własne wyjątki domenowe,
- gdzie najlepiej zbierać informacje diagnostyczne (PathWorker, ConfigWorker, RepoService itd.).

Przygotuj kompletną dokumentację Story i przedstaw propozycję architektury. Nie implementuj zmian przed moją akceptacją.
