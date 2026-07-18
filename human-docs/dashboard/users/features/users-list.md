# Feature: Users list (standard frame)

## Cel
Zakładka Users w standardowej ramce ze scrollem wewnątrz; bez wyszukiwarki i bez
przycisku dodawania (funkcja jeszcze nie istnieje).

## Zakres
UI. Bez zmian w API/danych.

## Zmienione pliki
- `app/(dashboard)/dashboard/users/page.tsx`

## Zmiany
- Owinięte w `DashboardPageShell` (`scroll={false} padded={false}` + wewnętrzny
  `overflow-auto` na tabeli).
- Usunięto: input „Search users…", przycisk „Filter", przycisk „Add User".
- Toolbar: tytuł `Users (N)`.
- Tabela userów bez zmian (Avatar, Role, Status, Last Seen, Actions dropdown).

## Route / API
`GET /api/admin/users` — bez zmian.

## Content Provider / Cache
Userzy pochodzą z CP (`chad_admin/users/users-list`) via API. Brak cache w UI.

## Znane ograniczenia
- Akcje w dropdownie (Send Email/Call/Edit/Delete) to nadal placeholdery.
- Brak dodawania usera (świadomie usunięte — brak backendu).
