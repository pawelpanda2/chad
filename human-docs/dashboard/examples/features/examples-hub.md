# Examples — GUI-only demo hub (Story 114)

Status: implemented, local smoke pending sign-off (see Story 114 checklist).

## Cel

`Others → Examples` w sidebarze otwiera hub-menu (sam wzorzec co `Msg
Auto`/`Knowledge`: `DashboardPageShell` + `grid grid-cols-4` przyciski),
wyłącznie warstwa demonstracyjna GUI — bez backendu, bez DBA, bez odczytu
`chad_shared`. Cel: zamrażać zaakceptowany wygląd danej strony jako
referencję przed przebudową, żeby kolejne redesigny dało się porównać
side-by-side z tym, co user wcześniej zaakceptował, zamiast tracić ten
wygląd bezpowrotnie.

## Struktura

```text
/dashboard/examples                        — hub (app/(dashboard)/dashboard/examples/page.tsx)
/dashboard/examples/knowledge-v1            — pierwszy kafelek
```

- `Knowledge v1` — zamrożony snapshot wyglądu Knowledge **sprzed** Story
  114's Task 2 (fixed `grid-cols-1 md:grid-cols-2`, `truncate` na wierszach,
  brak capu wysokości) — dokładnie ten sam markup/klasy co produkcyjny
  `KnowledgeCardGrid` miał przed przebudową, na lokalnych danych
  mockowanych (kilka sekcji o różnej liczbie wpisów). Świadomie
  zduplikowany lokalnie w `knowledge-v1/page.tsx`, NIE importowany ze
  współdzielonego komponentu z produkcyjną stroną Knowledge — inaczej
  późniejsza zmiana produkcyjnego layoutu (co się już stało w Task 2)
  zepsułaby "zamrożony" przykład.

## Zasady dodawania kolejnych przykładów

- Nowy kafelek w tym samym hub-gridzie (`examples/page.tsx`).
- Własna podstrona pod `/dashboard/examples/<nazwa>`, lokalne mocki,
  zero fetchy do prawdziwych API/`chad_shared`.
- Nie projektować nowego wzorca hub-menu — ten sam co Msg Auto/Knowledge.
