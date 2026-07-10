# Shared Text Editor with Toolbar

## Overview

The `TextEditorWithToolbar` component provides a standardized text editor interface used across all text-item views in the dashboard. It combines a toolbar with Save, Preview/Editor tabs, and WCH (whitespace toggle) button above a content area that switches between preview and editor modes.

## Component Location

```
components/shared/text-editor-with-toolbar.tsx
```

## Goals

1. **Consistent UX**: All text-item editors (Msg Todo, Msg Workout, etc.) behave identically
2. **Toolbar above content**: Buttons are never inside CodeMirror or inside tab panels
3. **Working WCH**: Whitespace toggle reliably shows/hides whitespace characters in the editor
4. **Preview support**: All text-item views have Preview/Editor tabs
5. **Configurable**: Flags control which features are shown

## Component API

```typescript
interface TextEditorWithToolbarProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  showPreview?: boolean;        // default: true
  showSave?: boolean;           // default: true
  showWhitespaceToggle?: boolean; // default: true
  placeholder?: string;         // default: "Enter content..."
  label?: string;               // optional label (not currently rendered by component)
  icon?: React.ReactNode;       // optional icon for label
  toolbarExtra?: React.ReactNode; // extra content after main buttons
  className?: string;
}
```

## Layout

```
[Header from page - back button, title, etc.]
--------------------------------
[Save] [Preview|Editor] [WCH] [Saved indicator] [extra]
--------------------------------
[Card with Preview content OR BodyTextEditor]
```

Key rules:
- Toolbar is a separate row above the content card
- Toolbar is NOT inside the Tabs component's content panels
- Toolbar is NOT inside CodeMirror
- Preview and Editor are Tabs inside the content Card

## Features

### Save Button
- Calls `onSave()` when clicked
- Shows "Saving..." with spinner while `saving=true`
- Shows green "Saved" indicator for 3 seconds after save
- Supports Ctrl+S / Cmd+S keyboard shortcut via `BodyTextEditor`

### Preview / Editor Tabs
- **Preview**: Renders content using `PreviewContent` (headers format parser)
- **Editor**: Raw text editing via `BodyTextEditor` (CodeMirror)
- Tab state is managed internally by `TextEditorWithToolbar`
- Switching tabs preserves scroll independently in each panel

### WCH (Whitespace Toggle)
- Toggles visibility of whitespace characters (spaces, tabs) in the editor
- Only affects the Editor tab (Preview doesn't show whitespace markers)
- State is managed internally by `TextEditorWithToolbar`
- Works correctly after switching between Preview and Editor
- Works correctly after changing content / reloading data

### BodyTextEditor (Low-level component)
The `BodyTextEditor` component remains as the low-level CodeMirror wrapper. It accepts:
- `showWhitespace: boolean` - controls whether whitespace is highlighted
- `onSaveShortcut: (event: KeyboardEvent) => void` - Ctrl+S handler
- Standard props: `value`, `onChange`, `placeholder`, `className`, `extraExtensions`

## Usage Examples

### Basic usage (Msg Todo, Msg Workout)

```typescript
import { TextEditorWithToolbar } from "@/components/shared/text-editor-with-toolbar";
import { EditorPageShell } from "@/components/shared/editor-page-shell";

export default function MyTextItemPage() {
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      // ... save logic
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditorPageShell>
      {/* Page-specific header (back button, title) */}
      <div className="flex shrink-0 items-center gap-2">
        <Button onClick={handleBack} variant="outline" size="icon">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="font-semibold">My Text Item</span>
      </div>

      {/* Shared editor with toolbar */}
      <TextEditorWithToolbar
        value={content}
        onChange={setContent}
        onSave={handleSave}
        saving={saving}
        saved={saved}
        placeholder="Enter content..."
      />
    </EditorPageShell>
  );
}
```

### Without Preview (editor-only mode)

```typescript
<TextEditorWithToolbar
  value={content}
  onChange={setContent}
  onSave={handleSave}
  saving={saving}
  saved={saved}
  showPreview={false}  // Hides Preview/Editor tabs, shows only editor
  showWhitespaceToggle={true}
/>
```

### Without Save button

```typescript
<TextEditorWithToolbar
  value={content}
  onChange={setContent}
  onSave={handleSave}
  saving={saving}
  saved={saved}
  showSave={false}  // Hides Save button
/>
```

## Views Using This Component

### 1. Msg Todo Editor (`/dashboard/todo-msg/edit`)
- Shows: Save, Preview/Editor tabs, WCH button
- All features enabled (defaults)

### 2. Msg Workout Details (`/dashboard/leads/msg-workout`)
- Shows: Save, Preview/Editor tabs, WCH button
- All features enabled (defaults)

### 3. Msg Planner (`/dashboard/msg-planner`)
- **Not yet migrated** - has a custom layout with date selector and "new" button in the toolbar
- Future: Could use `toolbarExtra` prop to accommodate custom controls

## Implementation Details

### WCH State Management
The `showWhitespace` state is managed internally by `TextEditorWithToolbar` and passed down to `BodyTextEditor` via the `showWhitespace` prop. This ensures:
- The state persists when switching between Preview and Editor tabs
- The state resets only when the component unmounts (navigating away)
- The WCH button visual state (default/outline variant) matches the actual editor state

### Preview Content
Preview uses the existing `PreviewContent` component which wraps `HeadersRenderer`. This renders the headers format with colored sections, badges, and hierarchical structure.

### Scroll Behavior
- Preview panel has its own scroll (overflow-auto inside the preview tab content)
- Editor panel has its own scroll (managed by CodeMirror's internal scroller)
- Scrolls are independent - switching tabs doesn't affect the other panel's scroll position

## Files Modified

### New Files
- `components/shared/text-editor-with-toolbar.tsx` - The shared component

### Updated Files
- `app/(dashboard)/dashboard/todo-msg/edit/page.tsx` - Migrated to use shared component
- `app/(dashboard)/dashboard/leads/msg-workout/page.tsx` - Migrated to use shared component

## Manual Testing Checklist

### Msg Todo (`/dashboard/todo-msg/edit`)
1. Open an entry from Msg Todo list
2. Verify toolbar is above the content area (not inside editor)
3. Click WCH button - verify whitespace characters become visible in editor
4. Click WCH again - verify whitespace characters are hidden
5. Switch to Preview tab - verify content is rendered
6. Switch to Editor tab - verify editor is shown
7. Click WCH in Editor tab - verify it works after tab switch
8. Make a change, click Save - verify "Saved" indicator appears
9. Verify Ctrl+S triggers save

### Msg Workout (`/dashboard/leads/msg-workout`)
1. Open a msg workout from lead details
2. Verify same behavior as Msg Todo
3. Verify back button returns to lead details
4. Verify save works correctly

### Cross-cutting
1. Browser console shows no new errors
2. Network tab shows correct PUT/POST requests on save
3. Scroll in preview is independent of scroll in editor