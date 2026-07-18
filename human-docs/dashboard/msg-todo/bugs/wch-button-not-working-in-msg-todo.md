# Bug: WCH Button Not Working in Msg Todo

## Summary

In the Msg Todo editor (`/dashboard/todo-msg/edit`), the WCH (whitespace toggle) button did not function correctly, and the view lacked a Preview mode that was available in other text-item views.

## Symptom

When editing a Msg Todo entry:

1. **WCH button didn't work**: Clicking the WCH button did not toggle whitespace visibility in the editor
2. **No Preview tab**: Unlike Msg Workout and Msg Planner, Msg Todo had no Preview/Editor tabs
3. **Inconsistent UI**: Each text-item view had its own toolbar implementation, leading to different behaviors

## Root Cause

The issue had multiple causes:

### 1. No shared editor component
Each page (`todo-msg/edit`, `leads/msg-workout`, `msg-planner`) implemented its own editor UI with:
- Local state for `showWhitespace`
- Local state for `activeTab` (Preview/Editor)
- Inline toolbar buttons

This led to:
- Duplicated code
- Inconsistent behavior
- Difficult maintenance

### 2. Missing Preview in Msg Todo
The `todo-msg/edit/page.tsx` did not include Preview/Editor tabs at all. It only had:
- A WCH button in the header
- A direct `BodyTextEditor` component

### 3. WCH state management issues
In the old implementation, the `showWhitespace` state was:
- Managed at the page level
- Passed to `BodyTextEditor` via props
- But there was no Preview tab, so the state had no context
- The button visual state might not have matched the actual editor state

## Solution

### Decision: Create a shared `TextEditorWithToolbar` component

Instead of fixing each page individually, a new shared component was created that encapsulates:
- Toolbar with Save, Preview/Editor tabs, and WCH button
- Content area with Preview (using `PreviewContent`) and Editor (using `BodyTextEditor`)
- Internal state management for `activeTab` and `showWhitespace`

### Changes Made

#### 1. New shared component
**File:** `components/shared/text-editor-with-toolbar.tsx`

```typescript
export function TextEditorWithToolbar({
  value,
  onChange,
  onSave,
  saving,
  saved,
  showPreview = true,
  showSave = true,
  showWhitespaceToggle = true,
  placeholder = "Enter content...",
  // ... other props
}: TextEditorWithToolbarProps) {
  const [activeTab, setActiveTab] = useState<"preview" | "editor">("preview");
  const [showWhitespace, setShowWhitespace] = useState(false);

  // Toolbar rendered as separate row above content
  // Content area has Tabs with Preview and Editor
  // WCH button toggles showWhitespace state passed to BodyTextEditor
}
```

#### 2. Updated Msg Todo editor
**File:** `app/(dashboard)/dashboard/todo-msg/edit/page.tsx`

- Removed local `showWhitespace` state
- Removed inline WCH button
- Removed inline Preview/Editor tabs
- Now uses `TextEditorWithToolbar` component

#### 3. Updated Msg Workout editor
**File:** `app/(dashboard)/dashboard/leads/msg-workout/page.tsx`

- Same changes as Msg Todo
- Now uses `TextEditorWithToolbar` component

## How WCH Works Now

1. WCH button is in the toolbar (separate row above content)
2. Clicking WCH toggles internal `showWhitespace` state
3. State is passed to `BodyTextEditor` via `showWhitespace` prop
4. `BodyTextEditor` uses `highlightWhitespace()` extension from CodeMirror
5. State persists when switching between Preview and Editor tabs
6. State only resets when navigating away (component unmounts)

## Manual Testing

### Test: WCH in Msg Todo
1. Navigate to `/dashboard/todo-msg`
2. Click on any entry to open the editor
3. Verify toolbar is above the content area
4. Verify Preview/Editor tabs are present
5. Click WCH button
6. Verify whitespace characters become visible in the editor (spaces as dots, tabs as arrows)
7. Click WCH again
8. Verify whitespace characters are hidden
9. Switch to Preview tab
10. Switch back to Editor tab
11. Click WCH again - verify it still works after tab switch
12. Make a change and save - verify WCH state persists after save

### Test: WCH in Msg Workout
1. Navigate to a lead's details page
2. Open a msg workout
3. Verify same WCH behavior as Msg Todo

### Test: Save still works
1. Make a change in the editor
2. Click Save or press Ctrl+S
3. Verify "Saved" indicator appears
4. Verify the change persists after refresh

## Prevention

To prevent similar issues in the future:

1. **Use the shared component**: All new text-item views should use `TextEditorWithToolbar`
2. **Don't duplicate toolbar logic**: The toolbar is part of the shared component, not the page
3. **Don't put buttons inside CodeMirror**: Toolbar is always above the content area
4. **Don't put buttons inside Tabs content**: Toolbar is outside the Tabs component's content panels

## Related Files

- `components/shared/text-editor-with-toolbar.tsx` - New shared component
- `components/shared/body-text-editor.tsx` - Low-level CodeMirror wrapper
- `components/shared/headers-renderer.tsx` - Preview renderer (`PreviewContent`)
- `app/(dashboard)/dashboard/todo-msg/edit/page.tsx` - Updated to use shared component
- `app/(dashboard)/dashboard/leads/msg-workout/page.tsx` - Updated to use shared component

## Not Yet Migrated

- `app/(dashboard)/dashboard/msg-planner/page.tsx` - Has a custom layout with date selector and "new" button in the toolbar. Could be migrated in the future using the `toolbarExtra` prop.

## See Also

- `architecture/chad-dashboard/features/shared-text-editor-toolbar.md` - Feature documentation
- `architecture/bugs/msg-planner-editor-tab-inconsistency.md` - Related tab/whitespace issues