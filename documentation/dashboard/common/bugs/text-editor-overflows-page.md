# Bug: Text Editor Overflows Page and Creates Scrollbar

## Status
Identified - needs fix.

## Context
- **Projects affected:** `chad-dashbord`
- **Feature:** Todo Msg editor view
- **Date identified:** 2026-07-07

## Symptom

The editor's border/frame has been positioned too low on the page, causing:
1. A scrollbar to appear for the entire page
2. The editor extending beyond the viewport
3. The actual text input field (CodeMirror/contenteditable) not aligned with the border/frame

## Expected Behavior

1. The entire editor must fit within the visible viewport.
2. No scrollbar should appear for the whole page (`body`/`html`).
3. The scroll functionality should be ONLY inside the editor's text area.
4. The border/frame and the actual text editing area must be perfectly aligned — same height and position.
5. **The bottom border of the editor must be raised significantly (approximately 50px from the bottom edge)** to ensure no page scrollbar appears. Do not use small 5-10px adjustments — provide a safe margin.

## Current Incorrect Layout

```
┌─────────────────────────────────────────────────────────────┐
│ [← Back]                                    [Save]          │
│                                                              │
│ Lead Name                                                    │
│ address                                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────────────────────────────────────────────┐  │
│   │                                                     │  │
│   │  // todo                                            │  │ ← Border positioned too low
│   │                                                     │  │
│   │  [Actual text input area is NOT aligned            │  │ ← Text area doesn't match border
│   │   with this border!]                                │  │
│   │                                                     │  │
│   │                                                     │  │
│   │                                                     │  │
│   │                                                     │  │
│   │                                                     │  │
│   └─────────────────────────────────────────────────────┘  │
│                                                             │
│                    ↑                                        │
│              This border extends                           │
│              beyond viewport →                             │
│              [Page scrollbar appears]                      │
└─────────────────────────────────────────────────────────────┘
```

## Correct Layout

```
┌─────────────────────────────────────────────────────────────┐
│ [← Back]                                    [Save]          │
│                                                              │
│ Lead Name                                                    │
│ address                                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────────────────────────────────────────────┐  │
│   │  // todo                                            │  │ ← Border and text area aligned
│   │                                                     │  │
│   │  [Text input area matches border exactly]           │  │
│   │                                                     │  │
│   │                                                     │  │
│   │                                                     │  │
│   │                                                     │  │
│   │                                                     │  │
│   └─────────────────────────────────────────────────────┘  │
│                                                             │
│   ↑                                                         │
│   Editor fits within viewport                             │
│   [No page scrollbar]                                     │
│   [Scroll only inside editor]                             │
└─────────────────────────────────────────────────────────────┘
```

## Root Cause

During layout adjustments, the editor's border/frame was moved downward without:
1. Adjusting the actual text input area to match
2. Verifying the total height fits within the viewport
3. Ensuring the page doesn't overflow

## Fix Guidelines

1. **Check total height**: Ensure the editor component (header + text area + buttons) fits within the viewport height.
2. **Align border and text area**: The CodeMirror/contenteditable container must have the exact same dimensions and position as the border frame.
3. **Prevent page scroll**: Add appropriate CSS to prevent `overflow` on `body`/`html` if needed.
4. **Internal scroll only**: The text area should have `overflow-y: auto` so scrolling happens only inside the editor.
5. **Raise the bottom border significantly**: If the bottom border is too low, move it up by approximately **50px** from the bottom edge of the viewport. Do NOT use small 5-10px adjustments — provide a safe margin to ensure no page scrollbar appears.

## Common Mistakes to Avoid

- ❌ DO NOT let the editor create a scrollbar for the entire page
- ❌ DO NOT position the border and the text editing area at different heights/positions
- ❌ DO NOT forget to account for header, buttons, and padding when calculating editor height

## Impact

- Users experience unwanted page scrolling instead of editor-internal scrolling
- Visual misalignment between border and actual editing area
- Editor content may be partially hidden outside the viewport
- Poor user experience and unprofessional appearance

## Related Files

- `../chad-dashbord/app/(dashboard)/dashboard/todo-msg/edit/page.tsx` - Editor page component

## Related Documentation

- [todo-msg-editor.md](../features/todo-msg-editor.md) - Feature documentation for Todo Msg editor