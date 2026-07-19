# Feature: Beeper contacts — category combobox

## Cel
Kategorie kontaktów (All / Business / Romantic / Friends) mają być w comboboxie,
nie jako zakładki (Tabs).

## Zakres
UI. Bez zmian w API/danych.

## Zmienione pliki
- `app/(dashboard)/dashboard/beeper/page.tsx`

## Zmiana
`Tabs`/`TabsTrigger` → `Select` (`SelectTrigger`/`SelectItem`). Wartość `tab`
steruje jak wcześniej (`load(tab)` → `/api/beeper-crm/contacts?tag=`).

## Route / API
`GET /api/beeper-crm/contacts[?tag=business|romantic|friends]` — bez zmian.

## Content Provider / Cache
Nie dotyczy (dane z MongoDB przez `/api/beeper-crm`). Brak cache po stronie UI.

## Dalsze etapy
- Brak.
