# Story 114 — Plan

## Baseline (punkt początkowy przed zmianami AI)

- HEAD przed pracą: `a8c87b1`.
- Working tree miał obszerne niezacommitowane zmiany (knowledge routing → `[category]/[[...path]]` catch-all, folders, zip-import, dba, beeper, msg-automation pages, itd.) — to jest dokładnie ten stan, który user zweryfikował i opisał jako "aktualny stan publicznego repo" w prompcie (dynamiczny Knowledge hub + `[category]` z realnych danych). Traktowane jako baseline tego Story, **nie** jako obce równoległe WIP do odseparowania — zgodne z tym, co user opisał.
- Zgodnie z precedensem Story 113 (ten sam stan working tree), nie tworzę jednego dużego commitu bazowego łączącego te niezwiązane zmiany (folders/zip-import/dba spans zbyt szeroki, nie mój zakres). Punkt powrotu = `a8c87b1` + `git status --short` zapisany w tym pliku.
- Commit końcowy tego Story obejmie WYŁĄCZNIE pliki faktycznie utworzone/zmienione w ramach Story 114 (sidebar, examples/*, knowledge `[category]` page + nowy layout helper + testy, docs), stage'owane po nazwie — nie `git add -A`.

## Odkryty stan repo (research przed implementacją)

- Makieta referencyjna: `examples/knowledge_v2_clean_no_debug_mockup.html` (jedyny plik pasujący do "Knowledge v2"; 391 linii, kompletny JS algorytm: `charTargetForTexts`, `widthForChars`, `chooseColumnsAndWidths`, `targetForRow`, `balanceHeights`, `prepareLongLabels`/`bindShiftButtons` dla unbreakable-token shift).
- Produkcyjny Knowledge:
  - Hub: `packages/dashboard/app/(dashboard)/dashboard/knowledge/page.tsx` (dynamiczny, `/api/knowledge`) — nie dotykamy.
  - Category/document: `packages/dashboard/app/(dashboard)/dashboard/knowledge/[category]/[[...path]]/page.tsx` — catch-all, fetch przez `/api/knowledge/[category]/[[...path]]`. Layout do przebudowy: obecnie `grid grid-cols-1 md:grid-cols-2` + `KnowledgeCardGrid` (title + `divide-y` rows, `LIST_ROW_CLASS`/`LIST_ROW_WRAPPER_CLASS` tokens, `FolderIcon`/`FileText` z lucide, `truncate` na labelkach, brak capu wysokości). To jest dokładnie "obecny wygląd sprzed v2" do zamrożenia w Knowledge v1 oraz podstawa stylu do zachowania w v2 (kolory/border/radius/ikony/typografia niezmienione — zmienia się TYLKO: grid-template-columns zamiast `grid-cols-*`, wrap zamiast `truncate`, cap wysokości + scroll per karta).
- Sidebar: `packages/dashboard/components/shared/sidebar.tsx` — grupa `"Others"` już istnieje (History/Folders/Settings) → dodać tam `Examples` (ikona `FlaskConical`, href `/dashboard/examples`).
- Wzorzec hub: `msg-automation/page.tsx` (`DashboardPageShell` + `grid grid-cols-4 gap-2` przyciski) — ten sam wzorzec dla `/dashboard/examples`.
- `DashboardPageShell`/`NavGroup`/`layout-tokens.ts` (`FRAME_SECTION_GAP_CLASS`, `LIST_ROW_CLASS`, `LIST_ROW_WRAPPER_CLASS`) — reużyte bez zmian.

## Implementacja

### Task 1 — Examples / Knowledge v1
1. `sidebar.tsx`: nowy item `Examples` w grupie `Others`.
2. `app/.../dashboard/examples/page.tsx`: hub, `DashboardPageShell title="Examples"`, jeden przycisk `KNOWLEDGE V1` → `/dashboard/examples/knowledge-v1` (wzorzec Msg Auto grid-cols-4, jeden button).
3. `app/.../dashboard/examples/knowledge-v1/page.tsx`: samodzielna strona (bez fetch), lokalny mock array sekcji o różnej liczbie wpisów (1, 3, 5, 8, 25 — 25 tylko po to by potwierdzić "brak capu/scrolla" w starym layoucie jeśli chcemy pokazać kontrast; ale wymaganie mówi tylko "kilka sekcji o różnej liczbie wpisów", 25-elementowy test capu należy do Task 2's mock w category page — więc w v1 wystarczą umiarkowane liczby, np. 1/3/5/8/12). Renderuje dokładnie ten sam JSX/klasy co obecny `KnowledgeCardGrid` (`grid-cols-1 md:grid-cols-2`, `truncate`, brak capu) — kod zduplikowany lokalnie (świadomie, żeby Task 2 nie mógł przypadkiem "zepsuć" zamrożonego przykładu przez współdzielony komponent). `upLevel` → `/dashboard/examples`.

### Task 2 — Knowledge v2 layout
4. `packages/dashboard/lib/knowledge-layout.ts` — czyste, testowalne funkcje (bez DOM), przeniesione 1:1 z decyzji UX makiety:
   - stałe: `maxColumns=3`, `maxColumnWidthPx=400`, `minColumnWidthPx=115`, `widthReserveRatio=1.30`, `minTargetChars=12`, `maxTargetChars=46`, `normalRowCap=5`, `allLargeRowCap=8`, `largeRowThreshold=5`, `gapPx=8`, `unbreakableWordCharThreshold=42`.
   - `charTargetForTexts(texts, params)`,`widthForChars(chars, measureText, params)`,`chooseColumnsAndWidths(availableWidth, cardTexts[], measureText, params)`,`targetForRow(counts, params)`,`computeRowCaps(cardCounts, cols, params)`,`hasUnbreakableToken(text, thresholdChars)`.
5. `packages/dashboard/lib/knowledge-layout.test.ts` — testy: charTarget (avg+30%+clamp), widthForChars z fake measure (clamp min/max 400), chooseColumnsAndWidths z fake measure na kilku szerokościach dostępnych (wymusza 3/2/1), targetForRow (przykłady ze specyfikacji: [1,5]→3, [1,1,5]→3, all>5→cap8), computeRowCaps, hasUnbreakableToken (próg 42 znaków).
6. Hook `use-knowledge-grid-layout.ts` (`components/shared/`) — DOM: `ResizeObserver` na kontenerze grid, probe-span pomiar tekstu (dziedziczy font z kontenera), woła `chooseColumnsAndWidths` z lib, zwraca `{ containerRef, cols, widths }`. Osobno od czystej logiki, żeby ta zostawała testowalna bez DOM.
7. Komponent wiersza etykiety z obsługą unbreakable-token: mały `KnowledgeRowLabel` (lub inline w karcie) — normalny wrap (`whitespace-normal break-words`) domyślnie; gdy `hasUnbreakableToken` → tryb `nowrap overflow-hidden` + `‹ ›` przyciski przesuwające `transform: translateX` tylko tego elementu (lokalny `useState` shift, max = scrollWidth-clientWidth po zmierzeniu).
8. Przebudowa `[category]/[[...path]]/page.tsx`: TYLKO część renderowania grida (`<div className="grid grid-cols-1 md:grid-cols-2 ...">` → dynamiczny `style={{gridTemplateColumns: ...}}` z hooka, `justify-content:start`) + `KnowledgeCardGrid` rows: `truncate` → wrap + `KnowledgeRowLabel`, plus cap wysokości/scroll per karta z `computeRowCaps`. Fetch/routing/click-handlers/`DashboardPageShell`/`upLevel` bez zmian.
9. Test dla mock danych z sekcją ~25 wpisów: dodane lokalnie tylko do developerskiego sanity (nie do produkcyjnych danych) — właściwie test tego przypadku pokrywa `knowledge-layout.test.ts` (`computeRowCaps` z count=25) + manualny smoke w przeglądarce z realną kategorią, jeśli istnieje wystarczająco duża sekcja w danych, inaczej opisać w raporcie jako "brak realnej sekcji 25-elementowej w danych — zweryfikowano capem matematycznie + w Knowledge v1 dodatkowo".

### Dokumentacja
10. Zaktualizować/utworzyć krótki dok. feature w `human-docs/dashboard/...` lub `ai-docs/...` opisujący nowy layout Knowledge v2 i Examples hub (rozmiar: krótka notka, nie nowy standard).

### Weryfikacja
11. `pnpm --filter dashboard test` (lub odpowiedni test:unit) dla `knowledge-layout.test.ts` + istniejących testów dashboard.
12. Lokalny rebuild/restart przez `bash-scripts/dashboard/03_local_mac_docker/*` + smoke: Examples→Knowledge v1 wygląda jak stary Knowledge; `/dashboard/knowledge/<realna kategoria>` pokazuje nowy layout 3/2/1, brak globalnego horizontal scroll, otwieranie dokumentów działa.
13. Commit (bez push) tylko plików Story 114.
