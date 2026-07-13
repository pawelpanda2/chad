# Feature: Statuses toolbar & filters (standardized)

## Cel

Ujednolicić pasek Statuses w obu trybach (Matrix / Migration). Combobox trybu
jako pierwszy od lewej (z miejscem na uchwyt menu), a za nim dwa filtry:
wąski **ilościowy** i **po nazwie**.

## Zakres

UI. Bez zmian w API/danych.

## Zmienione pliki

- `app/(dashboard)/dashboard/statuses/page.tsx`

## Układ paska (oba tryby identycznie)

`[combobox: Matrix/Migration] [filtr ilościowy] [filtr po nazwie] … [licznik]`

Wcześniej w trybie Matrix combobox był ZA filtrem („dziwnie się przenosił").
Teraz kolejność jest ta sama w obu trybach (współdzielone `modeSelect`,
`numericRangeInput`, `nameFilterInput`).

## Filtry

- **Ilościowy** (`rangeFilter`, server-side, `?range=`): wąski input (`w-16`),
  zatwierdzany Enterem (bez przycisku Apply). Konwencja:
  `-10` = ostatnie 10 · `10` = pierwsze 10 · `1-3` = pozycje 1..3 ·
  `1,2,3` = wybrane. Steruje przeładowaniem z serwera (`loadLeads`).
- **Po nazwie** (`nameFilter`, client-side): filtruje już wczytane leady po
  nazwie/kluczu. Zastąpił dawny `matrixFilter`. Wynik: `visibleLeads`, używany
  w liczniku, w liście (Migration) i w tabeli (Matrix).

## Route / API

`GET /api/statuses?range=<zakres>` — bez zmian (tylko `rangeFilter`).

## Przepływ danych

`rangeFilter` → serwerowe przeładowanie `leads`. `nameFilter` → klientowy filtr
`visibleLeads = leads.filter(name/key)`.

## Content Provider / Cache

Bez zmian. Brak cache po stronie UI.

## Edge cases

- Pusty `nameFilter` → `visibleLeads === leads`.
- Filtr wyzeruje wynik → „No leads found" (top-left).

## Znane ograniczenia / dalsze etapy

- Filtr po nazwie jest klientowy (działa na już wczytanym zakresie z serwera).
