# Adding and changing endpoints — rules for AI

Status: utworzone 2026-07-16 (Story 62), po tym jak zabrakło jasnej zasady
podczas planowania zapisu dla `DAILY TRACKER` — Content Provider miał już
sprawdzony wzorzec nadpisywania Itemu w miejscu (`documentation/dashboard/
forms/features/daily-tracker-dates.md`), ale nie było jednego miejsca
opisującego, kiedy wolno dodać brakujący endpoint/metodę, a kiedy trzeba się
zatrzymać i zapytać.

To jest podstawowa zasada architektury — czytaj **przed** implementacją
jakiegokolwiek feature'a, który zapisuje lub modyfikuje dane, nie tylko przy
większych Story.

## 1. Brakujący endpoint/metoda — wolno i należy go dodać

Jeżeli feature wymaga zapisu lub modyfikacji danych, ale odpowiedni
endpoint albo metoda `dba` nie istnieje, **wolno i należy dodać brakującą
obsługę** — to nie jest decyzja do odkładania ani powód, żeby budować
tymczasowe/pozorne rozwiązanie. Zobacz punkt 6 (nigdy nie buduj pozornego
zapisu) i punkt 4 (najpierw sprawdź, czy podobny wzorzec już istnieje).

## 2. Gdzie żyje logika Content Providera

- Logika dostępu do Content Providera ma znajdować się **wyłącznie** w
  `packages/dba`.
- W `packages/dba` można używać metod Content Providera (`GetItem`,
  `GetByNames`, `Put`, `PostParentItem`, ...) bezpośrednio, ale szczegóły
  Content Providera (kształt wywołań, `loca`, `Settings.address`, itd.)
  **muszą pozostać ukryte** wewnątrz tej warstwy.
- Dashboard (i console) **nie może** znać ani wywoływać bezpośrednio
  interfejsów/metod Content Providera — zawsze przez `dba`.
- Next.js API route ma pozostać **cienkim adapterem**: parsuje request,
  woła jedną (albo kilka) funkcji z `packages/dba`, zwraca odpowiedź. Bez
  logiki biznesowej w route'cie.

## 3. Nigdy nie buduj pozornego zapisu

Nie wolno tworzyć pozornego Save, stuba ani no-op, który zwraca sukces bez
faktycznego zapisania danych. Interfejs nie może pokazywać stanu "zapisano"
(spinner kończący się sukcesem, zielony `Saved`, itd.), jeżeli dane
naprawdę nie zostały zapisane. Jeśli backend jeszcze nie istnieje, UI ma
albo nie być budowany, albo jawnie pokazywać, że zapis nie jest jeszcze
podłączony — nigdy udawać sukces.

## 4. Najpierw sprawdź istniejące wzorce, nie buduj od zera

Przed dodaniem nowej operacji zapisu/edycji sprawdź, czy analogiczny,
działający już mechanizm istnieje gdzie indziej w `packages/dba` (np.
`updateReportEntry` w `report-entries.ts` — `GetItem` → `Put` na tym samym
`loca`, albo `saveLeadStatus`/`putStatusContent` w `statuses-dashboard.ts`).
Wzoruj się na wzorcu, ale **sprawdź jego aktualny kod i kontrakt** zamiast
kopiować mechanicznie — błędy albo założenia, które nie pasują do nowego
przypadku, nie powinny zostać powielone.

## 5. Kompatybilność przy zmianie istniejącego endpointu

- Zmiana istniejącego endpointu **musi zachować kompatybilność** ze
  wszystkimi wcześniejszymi feature'ami korzystającymi z jego obecnego
  kontraktu.
- **Przed** zmianą istniejącego endpointu znajdź jego użycia (grep po
  ścieżce/nazwie funkcji) i sprawdź wpływ zmiany na każde z nich.
- Jeżeli nie ma pewności, że zmiana zachowa kompatybilność, **bezpieczniej
  jest stworzyć nową metodę/endpoint** niż zmieniać znaczenie istniejącego.
- Nie duplikuj endpointu, jeżeli istniejący można bezpiecznie **rozszerzyć**
  (np. dodać nowe pole do odpowiedzi) bez zmiany dotychczasowego kontraktu
  — dodawanie pól jest zwykle bezpieczne, zmiana/usunięcie istniejących pól
  zwykle nie jest.

## 6. Nazewnictwo

Nowa metoda w `dba` powinna mieć nazwę odpowiadającą **operacji
biznesowej** (np. `updateDailyEntry`), a nie nazwę bezpośredniej metody
Content Providera (np. nie `put` czy `postParentItem`) — nazwa ma być
czytelna dla kogoś, kto nie zna wewnętrznego API Content Providera.

## 7. Po implementacji

Po dodaniu/zmianie endpointu sprawdź (realnie, nie tylko przez czytanie
kodu):

- nowy zapis/odczyt działa end-to-end (najlepiej: zapis → odczyt →
  porównanie pól, tak jak w `daily-tracker-dates.md` §6),
- wcześniejsze feature'y korzystające z powiązanego kodu (tej samej funkcji
  `dba`, tego samego route'a, tej samej logicznej ścieżki Content Providera)
  nadal działają — nie tylko `tsc`/build, realny request.

## Powiązana dokumentacja

- [`documentation/dashboard/forms/features/daily-tracker-dates.md`](../../dashboard/forms/features/daily-tracker-dates.md)
  — przykład zastosowania tych zasad w praktyce: potwierdzony wzorzec
  nadpisywania Itemu w miejscu, potwierdzony brak działającego Delete w
  Content Providerze, konkretne reguły dla Daily Entry/Tracker.
- [`documentation/dba/post-parent-item.md`](../../dba/post-parent-item.md)
  — `PostParentItem` = find-or-create, idempotentne; **nie** używać podczas
  aktualizacji istniejącego Itemu (patrz punkt 4 powyżej i
  `daily-tracker-dates.md`).
