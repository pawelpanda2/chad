# Feature: Settings — standard frame, theme frames, Password tab

## Cel
Settings w standardowej ramce ze scrollem; wybór motywu Dark/Light/System na
górze; nowa zakładka Password ze zmianą hasła.

## Zakres
UI (+ szkielet API zmiany hasła). Bez zmian w modelu danych.

## Zmienione / nowe pliki
- `app/(dashboard)/dashboard/settings/layout.tsx` — owinięte w
  `DashboardPageShell`; **dwie osobne ramki** wewnątrz głównej: (1) motyw
  (`ThemeModeSelector`), (2) reszta ustawień (sub-nav + children). Do sub-nav
  dodano „Password".
- `components/shared/theme-mode-selector.tsx` — **nowy**. Segmentowany przełącznik
  Light/Dark/System (`next-themes`).
- `app/(dashboard)/dashboard/settings/password/page.tsx` — **nowy**. Formularz:
  obecne hasło, nowe, powtórz nowe + przycisk „Change". Walidacja klientowa
  (zgodność nowych, min. długość). POST `/api/auth/change-password`.
- `app/api/auth/change-password/route.ts` — **nowy**. Uwierzytelnia żądanie i
  waliduje kształt, ale **nie zapisuje** jeszcze nowego hasła (patrz niżej).

## Route / API
`POST /api/auth/change-password` — `{ currentPassword, newPassword }`.

## Przepływ danych
UI → route. Route sprawdza sesję i kształt, po czym zwraca `501` z czytelnym
komunikatem (persistencja nie jest jeszcze podłączona).

## Content Provider / Cache
Zmiana hasła wymagałaby zapisu `passwordHash` do itemu użytkownika w CP
(`chad_admin/users/users-list`). **Brak helpera dba do tego zapisu** — świadomie
nie implementowane, żeby nie uszkodzić prawdziwych kont. Brak cache.

## Znane ograniczenia / dalsze etapy
- Backend zmiany hasła do zaprojektowania (weryfikacja starego + zapis nowego do
  CP). UI i kontrakt API są gotowe.
