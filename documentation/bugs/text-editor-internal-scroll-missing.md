# Bug: Text Editor Internal Scrollbar Missing

## Status
Fixed and verified in browser.

## Context
- **Projects affected:** `chad-dashbord`
- **Feature:** Todo Msg editor view
- **Date identified:** 2026-07-07
- **Related bug:** [text-editor-overflows-page.md](./text-editor-overflows-page.md)

## Symptom

The editor's internal vertical scrollbar was not appearing, making it impossible to scroll through long text content within the editor. While the page-level scrollbar was successfully removed, the text inside the editor became unscrollable.

## Expected Behavior

1. The entire editor container must fit within the visible viewport (no page scrollbar).
2. The text area must have its own vertical scrollbar that appears when content exceeds the editor's height.
3. Scrolling should happen ONLY inside the editor, not on the page.
4. Long lines should wrap visually in the editor without creating a horizontal scrollbar.
5. The CodeMirror component must have proper height constraints and overflow settings.

## Root Cause

After removing the page-level overflow, the CodeMirror layout still depended on an unstable height chain. The issue was:

1. **The editor wrapper was not the direct height owner**: the scroll area inherited height through an extra absolute wrapper, which made the internal scroller harder to constrain reliably.
2. **`.cm-editor` needed a full-height flex chain**: the editor must fill a parent with fixed available height.
3. **`.cm-scroller` needed explicit axis overflow**: vertical scroll must be handled by `.cm-scroller` with `overflow-y: auto`, while horizontal overflow is hidden for wrapped lines.
4. **The parent container needed `min-h-0` and `overflow-hidden`**: without that, the editor can grow instead of scrolling internally.

## Fix Applied

### Layout Structure
```tsx
// Outer wrapper - fixed viewport slice, no page scroll
<div className="-m-[22px] flex h-[calc(100dvh-4rem-20px)] min-h-0 flex-col gap-[10px] overflow-hidden">
  {/* Header - doesn't shrink */}
  <div className="flex items-center gap-2 shrink-0">
    {/* ... header content ... */}
  </div>

  {/* Editor container - fills remaining space and clips page overflow */}
  <div className="flex-1 min-h-0 overflow-hidden rounded-md border">
    <CodeMirror
      height="100%"
      className="h-full min-h-0"
      extensions={[
        EditorView.lineWrapping,
        EditorView.theme({
          "&.cm-editor": {
            height: "100%",
          },
          ".cm-scroller": {
            height: "100%",
            overflowY: "auto",
            overflowX: "hidden",
          },
          // ... other styles
        }),
      ]}
      // ...
    />
  </div>
</div>
```

### Key CSS Rules for CodeMirror

```css
/* Editor container must fill parent */
.cm-editor {
  height: 100%;
}

/* Scroller handles overflow */
.cm-scroller {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
}

/* Visual wrapping only, data stays unchanged */
.cm-content {
  white-space: break-spaces;
}

/* Hide line numbers gutter if not needed */
.cm-gutter {
  display: none;
}
```

## Verification Checklist

After the fix:
- [x] No scrollbar on the page/body level
- [x] Vertical scrollbar appears inside the editor when text exceeds editor height
- [x] Text can be scrolled within the editor
- [x] Long lines wrap visually to editor width
- [x] No horizontal scrollbar from long lines
- [x] Header and Save button remain visible
- [x] Editor container doesn't extend beyond viewport

Browser verification on 2026-07-07:
- `documentElement.scrollHeight === clientHeight` on the editor page
- `.cm-scroller { overflow-y: auto; overflow-x: auto; }`
- `.cm-scroller { overflow-y: auto; overflow-x: hidden; }`
- `.cm-scroller.scrollHeight > .cm-scroller.clientHeight` for long content
- `EditorView.lineWrapping` enabled for visual wrapping (no content rewrite)

## Principles for Future Development

When implementing text editors (CodeMirror, textarea, contenteditable):

1. **Page scroll must be disabled**: The editor container should fit within the viewport.
2. **Text scroll must be internal**: Scrolling happens inside the editor, not on the page.
3. **Proper height inheritance**: Use flexbox with `min-h-0`, a fixed available height, and `overflow-hidden` on the editor parent.
4. **Explicit overflow on scroller**: Set `overflow-y: auto` (or `overflow: auto`) on the scrolling element.

## Related Files

- `../chad-dashbord/app/(dashboard)/dashboard/todo-msg/edit/page.tsx` - Editor page component
- [todo-msg-editor.md](../features/todo-msg-editor.md) - Feature documentation