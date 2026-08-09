# Story 114 — Knowledge

- `examples/knowledge_v2_clean_no_debug_mockup.html` — jedyna makieta w `examples/` odpowiadająca "Knowledge v2"; kompletny referencyjny JS algorytm (kolumny/szerokości/wysokości/unbreakable-token). Źródło prawdy dla decyzji UX w Task 2.
- `packages/dashboard/app/(dashboard)/dashboard/knowledge/[category]/[[...path]]/page.tsx` — obecny (Story 96 + Story 109 follow-up) catch-all category/document browser; `kind:"folder"` renderuje `grid-cols-1 md:grid-cols-2` kart (`KnowledgeCardGrid`), `kind:"document"` renderuje `EditorPageShell`. Task 2 zmienia WYŁĄCZNIE grid renderowania folderów (kolumny/szerokości/wrap/cap wysokości), nie fetch/routing.
- `packages/dashboard/components/shared/layout-tokens.ts` — `LIST_ROW_CLASS`, `LIST_ROW_WRAPPER_CLASS`, `FRAME_SECTION_GAP_CLASS`: tokeny stylu, które muszą zostać niezmienione (kolor/border/radius/padding kart).
- `packages/dashboard/components/shared/sidebar.tsx` — grupa `"Others"` (History/Folders/Settings) to miejsce na `Examples`.
- `packages/dashboard/app/(dashboard)/dashboard/msg-automation/page.tsx` — wzorzec hub-menu (`DashboardPageShell` + `grid-cols-4` przyciski) do powielenia dla `/dashboard/examples`.
- Story 113 (równoległe, `backlog/stories/113/`) potwierdza, że obszerne niezacommitowane zmiany w working tree na starcie (knowledge routing, folders, zip-import, dba) są świadomie pozostawione bez commitu bazowego — ten sam precedens zastosowany tutaj.
