# Bug: Shared Editor Layout and Toolbar v2

## Summary

After implementing the shared `TextEditorWithToolbar` component, several layout and UX issues were identified that needed correction.

## Affected Views

- `app/(dashboard)/dashboard/todo-msg/edit/page.tsx`
- `app/(dashboard)/dashboard/leads/msg-workout/page.tsx`
- `app/(dashboard)/dashboard/msg-planner/page.tsx`

---

## Issues and Fixes

### Issue 1: Editor Height Not Filling Window with Little Text

**Symptom:**
When the editor contains only a small amount of text (e.g., one line), the CodeMirror background only extends to cover that one line. The rest of the editor area shows no background, making it look like the editor is "floating" or incomplete.

**Root Cause:**
The CodeMirror component and its container were not properly configured to expand and fill the available parent height. The `.cm-editor` and `.cm-scroller` had `height: 100%` but the parent flex containers didn't always have explicit heights, causing the editor to collapse to its content size.

**Fix:**
1. Added `flex-1` to the CodeMirror className to ensure it expands in flex containers
2. Added `&` selector in the theme to ensure the root element has `height: 100%`
3. Ensured all parent containers in `TextEditorWithToolbar` have proper flex layout with `flex-1`, `min-h-0`, and `overflow-hidden`
4. Removed the `Card` component wrapper that was adding unnecessary padding and borders

**Files Changed:**
- `components/shared/text-editor-with-toolbar.tsx` - Removed Card wrapper, improved flex layout
- `components/shared/body-text-editor.tsx` - Added flex-1, improved height theme

---

### Issue 2: Button Order and Visibility

**Symptom:**
The toolbar button order was: `[Save] [Preview|Editor tabs] [WCH]`
The desired order is: `[Preview|Editor tabs] [Save] [WCH]`

Additionally, Save and WCH buttons should only be visible when in Editor mode (not in Preview mode).

**Root Cause:**
The original implementation showed all buttons regardless of the active tab. The button order was also not matching the desired UX pattern.

**Fix:**
1. Reordered the toolbar to place Tabs first, then Save, then WCH
2. Added conditional rendering: `showSave && isEditorMode` and `showWhitespaceToggle && isEditorMode`
3. The "Saved" indicator is also only shown in Editor mode
4. Updated the TabsList styling to have flat tabs (no rounded corners, no background) that blend seamlessly with the toolbar

**Files Changed:**
- `components/shared/text-editor-with-toolbar.tsx`

---

### Issue 3: Preview Mode Gaps Between Borders

**Symptom:**
In Preview mode, there were visible gaps between the toolbar border and the content area. The Card component was adding padding and rounded borders that created visual inconsistency.

**Root Cause:**
The `Card` and `CardContent` components from shadcn/ui add default padding and rounded corners that created unwanted spacing.

**Fix:**
1. Removed the `Card` and `CardContent` wrapper entirely
2. Replaced with a simple `div` container with `flex-1 min-h-0 overflow-hidden`
3. Added `border-b` to the toolbar div to create a clean separator
4. Updated TabsList to have `rounded-none border-0 bg-transparent` for flat tabs
5. Updated TabsTrigger to have `rounded-none` and custom active state styling

**Files Changed:**
- `components/shared/text-editor-with-toolbar.tsx`

---

### Issue 4: Msg Planner Not Using Shared Editor

**Symptom:**
The `msg-planner` page was still using `BodyTextEditor` directly with its own custom toolbar implementation, instead of the shared `TextEditorWithToolbar` component.

**Root Cause:**
The msg-planner had additional toolbar elements (date selector, "new" button, refresh button) that made migration seem complex. The existing implementation was working, so it was not prioritized during the initial shared component rollout.

**Fix:**
1. Migrated msg-planner to use `TextEditorWithToolbar`
2. Used the `toolbarExtra` prop to pass the date selector, "new" button, and refresh button
3. The `toolbarExtra` content is placed after the WCH button and pushed to the right with `ml-auto`
4. Removed duplicate imports (`Card`, `CardContent`, `Tabs`, `PreviewContent`, `BodyTextEditor`, `Save`)
5. Updated `EditorPageShell` gapClassName to `gap-0` for seamless layout

**Files Changed:**
- `app/(dashboard)/dashboard/msg-planner/page.tsx`

---

## Toolbar Layout Rules

The shared editor toolbar follows these rules:

1. **Tab order**: Preview | Editor (always first)
2. **Save button**: Only visible in Editor mode, placed after tabs
3. **WCH button**: Only visible in Editor mode, placed after Save
4. **Saved indicator**: Only visible in Editor mode, placed after WCH
5. **Extra content**: Placed at the end, can be pushed to right with `ml-auto`

### Preview Mode Toolbar:
```
[Preview] [Editor]
```

### Editor Mode Toolbar:
```
[Preview] [Editor] [Save] [WCH] [Saved] [extra]
```

---

## Editor Height Rules

The editor must always fill the available viewport height:

1. Parent container uses `flex h-full min-h-0 flex-col`
2. Toolbar is `shrink-0` to maintain fixed height
3. Content area uses `flex-1 min-h-0 overflow-hidden`
4. CodeMirror has `height="100%"` and `flex-1` className
5. All nested containers have proper flex properties
6. Scroll is local to the editor content (`.cm-scroller`), not the page

---

## Preview Mode Rules

Preview mode should have no visual gaps:

1. No Card wrapper with padding/rounded corners
2. Tabs are flat (no rounded corners, no background)
3. Tabs have bottom border when active (not full box)
4. Content area has `m-0 p-0` for TabsContent
5. Preview content has minimal padding inside

---

## Build Status

All modified files compile without errors:
- `components/shared/text-editor-with-toolbar.tsx` ✓
- `components/shared/body-text-editor.tsx` ✓
- `app/(dashboard)/dashboard/msg-planner/page.tsx` ✓
- `app/(dashboard)/dashboard/todo-msg/edit/page.tsx` ✓
- `app/(dashboard)/dashboard/leads/msg-workout/page.tsx` ✓

Pre-existing ESLint errors in other files (lib/chad-dba/*, content-provider page, statuses page) are unrelated to these changes.

---

## Manual Testing

### Test 1: Short Text Editor Height
1. Navigate to `/dashboard/todo-msg`
2. Open an entry with very short content (1-2 lines)
3. Verify the editor background fills the entire available height
4. Verify there's no "floating" single-line background

### Test 2: Long Text Editor Height
1. Open an entry with long content
2. Verify the editor scrolls internally (not the page)
3. Verify the editor still fills the available height

### Test 3: Button Order and Visibility
1. Open any editor
2. Verify toolbar order: Preview | Editor | Save | WCH
3. Switch to Preview tab
4. Verify Save and WCH buttons disappear
5. Switch back to Editor tab
6. Verify Save and WCH buttons reappear

### Test 4: Preview Mode Gaps
1. Switch to Preview mode
2. Inspect the border between toolbar and content
3. Verify there's no gap - just a clean border line
4. Verify the content starts close to the edge

### Test 5: Msg Planner
1. Navigate to `/dashboard/msg-planner`
2. Verify the toolbar shows: Preview | Editor | Save | WCH | [date selector] [new] [refresh]
3. Switch to Preview mode
4. Verify Save and WCH disappear but date selector, new, and refresh remain
5. Verify the editor fills the available height
6. Verify the create panel still works

### Test 6: No Page Scroll
1. Open any editor
2. Add enough content to require scrolling
3. Verify the scroll happens inside the editor, not the page
4. Verify the toolbar stays fixed at the top

---

## Related Files

- `components/shared/text-editor-with-toolbar.tsx` - Main shared component
- `components/shared/body-text-editor.tsx` - CodeMirror wrapper
- `components/shared/editor-page-shell.tsx` - Page layout shell
- `app/(dashboard)/dashboard/todo-msg/edit/page.tsx` - Uses shared component
- `app/(dashboard)/dashboard/leads/msg-workout/page.tsx` - Uses shared component
- `app/(dashboard)/dashboard/msg-planner/page.tsx` - Now uses shared component

## See Also

- `architecture/chad-dashboard/features/shared-text-editor-toolbar.md` - Original feature documentation
- `architecture/bugs/wch-button-not-working-in-msg-todo.md` - Previous WCH bug that led to shared component