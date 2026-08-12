# Story 117 — Mobile right gutter + Knowledge editor More toolbar

**Start SHA:** `0ad1ff02c2f737e7653803a4f8dbf0c768a193ed` (working tree had unrelated parallel WIP — left untouched)

| # | Status | | Acceptance |
|---|---|---|---|
| 1 | DONE | | Mobile: no large empty right strip; no page horizontal scroll |
| 2 | DONE | | Desktop ≥1280 keeps `xl:pr-[150px]` on main |
| 3 | DONE | | Knowledge document editor uses shared TextEditorWithToolbar with compact Save + More second row (wch/tab) |
| 4 | DONE | | Other TextEditorWithToolbar callers unchanged without new prop |
| 5 | DONE | | Unit tests for More/second-row + existing Save regressions PASS |
| 6 | DONE | | Local Docker rebuilt via official `03_local_mac_docker/06_deploy.sh` |

## Root cause (mobile)

Knowledge document view applied unconditional `className="mr-[150px]"` on `TextEditorWithToolbar`, duplicating the desktop gutter on every viewport. Shared `main` already has `xl:pr-[150px]` only at ≥1280px.

## Shared editor

New opt-in prop `collapseEditorHelpers` (default `false`):
- `false`: previous layout (Preview|Editor then Save; helpers always visible in editor mode inside the frame)
- `true`: primary `[Save] [More] [Preview|Editor]`; helpers (undo/redo/wch/tab) in a second row above the frame, toggled by More

Knowledge document editor sets `collapseEditorHelpers`.
