# GUI standards — ai-start

Status: utworzone 2026-08-03. Folder `ai-docs/gui-standards/` zbiera
**obowiązkowe standardy Forms + Views** (ramka Save, Full View, tabela pól,
`returnTo`, listy z `+ Add` / draftami), wypracowane przy restylu Add Lead /
Add Action / Add Recording / Add Prompt i powiązanych widoków.

Starszy folder [`ai-docs/gui-standard/`](../gui-standard/ai-start.md)
(liczba pojedyncza) obejmuje inne wzorce layoutu (Beeper split-view, tabele
bez edycji inline, tooltip po kliknięciu) — **nie** zastępuje tego folderu.

**Źródło prawdy dla ramki strony / shella:** nadal
[`human-docs/dashboard/common/features/responsive-layout-standard.md`](../../human-docs/dashboard/common/features/responsive-layout-standard.md)
(`DashboardPageShell`, Save na górze, Story 62). Ten folder doprecyzowuje
**wewnętrzny układ formularzy add/edit i list Views**.

## Czytać gdy

- nowy lub restylowany formularz w `/dashboard/forms`
- nowy lub zmieniany widok listy w `/dashboard/views` (lub równoważna lista
  domenowa, np. AI prompts)
- przyciski Save / Full View / wygenerowana nazwa
- tabela pól formularza (amber cells)
- `+ Add` z listy → formularz z `returnTo`

## Pliki w tym folderze

| Plik | Temat |
|------|--------|
| [forms-and-views.md](./forms-and-views.md) | Save frame (jedna linia), Full View, tabela pól, Views `+ Add` / drafty, tokeny layoutu |

## Powiązane

- [`../gui-standard/ai-start.md`](../gui-standard/ai-start.md) — Beeper split-view / tabele Permissions
- [`../../packages/dashboard/components/shared/layout-tokens.ts`](../../packages/dashboard/components/shared/layout-tokens.ts) —
  `FRAME_SECTION_GAP_CLASS`, `SAVE_FRAME_PADDING_CLASS`, `LIST_ROW_*`
