# Bug: Msg Planner Editor Internal Scroll Missing

## Status
Fixed.

## Context

- Project: `chad-dashbord`
- Page: `/dashboard/msg-planner`
- Area: `Msg Planner -> Editor`
- Related historical bug: `chad-dba/architecture/bugs/text-editor-internal-scroll-missing.md`

## Symptom

- Editor tab in `Msg Planner` did not keep scrolling inside the editor area reliably.
- Page-level/right-edge scrollbar could appear instead of internal CodeMirror scroll.

## Root Cause

The same editor type (`body.txt` text editing) had multiple independent implementations:

- `Msg Todo` editor had a working, stabilized height/overflow chain.
- `Msg Planner` had a separate inline CodeMirror setup.

Because these implementations diverged, future changes could regress scroll behavior on one page while the other still worked.

## Fix

Created a shared editor component and reused it in both places.

### Shared component

- `components/shared/body-text-editor.tsx`

This component centralizes:

- CodeMirror base config
- fixed internal scrolling setup on `.cm-scroller`
- `lineWrapping`
- full-height editor chain (`h-full`, `min-h-0`, wrapper overflow)

### Refactored usages

- `app/(dashboard)/dashboard/todo-msg/edit/page.tsx`
- `app/(dashboard)/dashboard/msg-planner/page.tsx`

Both pages now use the same editor implementation.

`Msg Todo` still adds its tab-arrow plugin through `extraExtensions`, without forking the layout/scroll logic.

## Why this solves it

There is now one source of truth for this editor type.

- Same height chain.
- Same overflow behavior.
- Same CodeMirror baseline config.

Adding this editor in future tabs should reuse `BodyTextEditor` and avoid repeating scrollbar regressions.

## Manual test

1. Open `/dashboard/todo-msg/edit?loca=...` with long content.
2. Confirm page does not need to scroll for editor content.
3. Confirm editor has its own vertical scrollbar and can scroll to end.
4. Open `/dashboard/msg-planner`.
5. Switch to `Editor` tab and select date with long text.
6. Confirm internal editor scrollbar appears and works exactly like in `Msg Todo`.