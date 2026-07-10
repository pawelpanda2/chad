# Bug: Msg Planner Editor Tab Inconsistency

## Summary

In the Msg Planner editor, automatically generated content uses tab characters (`\t`) for indentation, but when users manually press the Tab key, the editor inserts a different format (typically spaces), causing visual and functional inconsistency.

## Symptom

When viewing a newly created Msg Planner plan:

1. **Auto-generated content** displays lines like:
   ```
   	03/06/51; 26-04-09_pn_Veranika_Yarasheushkaya
   ```
   (indented with a tab character)

2. **Manually typed content** (after pressing Tab) displays differently:
   ```
     03/06/test; test
   ```
   (indented with spaces, typically 2 spaces)

This creates:
- Visual misalignment between auto-generated and manual entries
- Inconsistent data format when saved (tabs vs spaces)
- Confusion about the expected indentation format

## Root Cause

The issue had two components:

### 1. Auto-generated content format
In `chad-dba/src/leads.ts`, the `generatePlanContent()` function uses `\t` (tab character) for indentation:

```typescript
// Line 1463 and 1471
...todoEntries.map(e => `\t${e.address}; ${e.leadName}`),
...firstMsgEntries.map(e => `\t${e.address}; ${e.leadName}`),
```

### 2. Editor Tab key behavior
In `chad-dashboard/components/shared/body-text-editor.tsx`, the CodeMirror editor did not have explicit Tab key handling. The default behavior was to insert spaces (typically 2 spaces) instead of a tab character.

Additionally, the CSS `tab-size` was set to 3, which was non-standard.

## Solution

### Decision: Use tab character (`\t`) consistently

Both auto-generated content and manual Tab key presses should insert the same `\t` character. This ensures:
- Consistent visual rendering
- Consistent data format in saved content
- Proper alignment when viewed in different editors

### Changes Made

#### 1. Updated BodyTextEditor component
**File:** `../chad-dashbord/components/shared/body-text-editor.tsx`

Added a custom CodeMirror extension to intercept the Tab key and insert a `\t` character:

```typescript
/**
 * Creates an extension that handles the Tab key to insert a tab character (\t)
 * instead of the default behavior (which may insert spaces or move focus).
 */
function tabKeyExtension(): Extension {
  return keymap.of([
    {
      key: "Tab",
      run: ({ state, dispatch }) => {
        const selection = state.selection.main;
        const from = selection.from;
        const to = selection.to;

        if (from !== to) {
          dispatch(state.update({
            changes: { from, to, insert: "\t" },
            scrollIntoView: true,
          }));
        } else {
          dispatch(state.update({
            changes: { from, insert: "\t" },
            scrollIntoView: true,
          }));
        }
        return true; // Prevent default behavior
      },
    },
  ]);
}
```

### Regression: Double tab arrow and broken caret

After the initial Tab/Enter fixes, a new editor regression appeared:

- one tab was rendered with two arrow-like markers
- the caret could appear visually before or inside the marker area
- pressing `Tab` again inserted a real `\t`, but the caret looked stuck in the wrong place

### Root Cause of the double arrow

The editor mixed raw text editing with multiple visual tab overlays.

There were two independent sources of tab visualization:

1. shared `BodyTextEditor` custom tab widget overlay
2. additional per-page tab overlay in `todo-msg/edit/page.tsx`

On top of that, CodeMirror whitespace rendering could still add its own small tab indicator depending on editor rendering state. That meant a single raw `\t` could be represented by multiple visual layers at once.

This broke the 1:1 mapping between:

- stored document text
- rendered tab width
- caret hit-testing / visual caret position

So the real text model was still correct, but the visual layer no longer matched the editing layer.

### Final fix

To avoid another caret regression, tab markers were removed from edit mode entirely.

- `Tab` still inserts a real `\t`
- `Enter` still preserves the exact raw whitespace prefix
- `Save` / reload still preserve raw `\t`
- editor no longer renders custom tab arrows in edit mode
- `todo-msg/edit` no longer injects its own extra tab overlay

This is the safer architecture for now: raw editing stays authoritative, and debug visualization does not interfere with caret geometry.

#### 2. Standardized tab-size CSS
**File:** `../chad-dashbord/components/shared/body-text-editor.tsx`

Changed `tab-size` to 4 (standard width):

```typescript
".cm-content": {
  padding: "1px 12px",
  tabSize: "4", // Standard 4-space tab width for consistency
},
".cm-line": {
  tabSize: "4", // Standard 4-space tab width
},
```

## Manual Testing

### Test: Tab Consistency

1. **Create a new plan:**
   - Navigate to Msg Planner tab
   - Click "new" button
   - Enter today's date (or keep default)
   - Click "create"

2. **Verify auto-generated content:**
   - Open the newly created plan
   - Note the indentation of entries (e.g., `03/06/51; leadName`)
   - The indentation should be a tab character

3. **Test manual Tab insertion:**
   - Switch to Editor tab
   - Place cursor at the end of a line or in a new line
   - Press Tab key
   - Type a test entry: `03/06/test; test_entry`

4. **Compare alignment:**
   - The manually added entry should align perfectly with auto-generated entries
   - Both should have the same indentation width

5. **Save and verify:**
   - Click Save button
   - Wait for "Saved" confirmation
   - Navigate away and return to the plan (or refresh page)
   - Verify that both auto-generated and manual entries maintain consistent formatting

6. **Check raw content (optional):**
   - If possible, inspect the saved content in Content Provider
   - Verify that both types of entries use `\t` character (not spaces)

### Expected Results

- ✅ Manual Tab press inserts a tab character (`\t`)
- ✅ Tab character renders as 4 spaces width
- ✅ Auto-generated and manual entries align perfectly
- ✅ Saved content contains consistent tab characters
- ✅ Content displays consistently when reopened
- ✅ No double-arrow tab marker appears in edit mode
- ✅ Caret lands after each inserted tab

### Verified browser result after fix

Re-tested in the live Msg Planner editor.

Scenario:

1. Click an empty line in the editor.
2. Press `Tab`.
3. Press `Tab` again.
4. Type `X`.
5. Press `Enter`.
6. Type `Y`.

Observed raw lines:

- current line after `Tab`, `Tab`, `X`: `\t\tX`
- next line after `Enter`, `Y`: `\t\tY`

Observed character codes:

- `\t\tX` -> `[9, 9, 88]`
- `\t\tY` -> `[9, 9, 89]`

This confirms the caret is actually moving behind the real tabs, not staying in front of them.

## Prevention

To prevent similar issues in the future:

1. **Document indentation standard:** All text editors in the dashboard should use consistent indentation (tab character with 4-space width)

2. **Reusable editor component:** The `BodyTextEditor` component is already reused across features, so this fix benefits all text editing areas

3. **Code review checklist:** When adding new text editors, verify Tab key behavior matches the established standard

## Additional Fix: Dropdown Visibility for Letter-Suffixed Plans

### Problem
Plans with letter suffixes (e.g., "26-07-08b", "26-07-08c") were not appearing in the date dropdown because the validation regex only accepted the base `YY-MM-DD` format.

### Solution
Updated the `DATE_PATTERN` regex in `chad-dba/src/leads.ts` to accept optional letter or numeric suffixes:

```typescript
// Old pattern (only base date):
const DATE_PATTERN = /^\d{2}-\d{2}-\d{2}$/;

// New pattern (base date + optional suffix):
const DATE_PATTERN = /^\d{2}-\d{2}-\d{2}([a-z]|\d+)?$/;
```

This allows the dropdown to display:
- Base dates: `26-07-08`
- Letter suffixes: `26-07-08b`, `26-07-08c`, ..., `26-07-08z`
- Numeric suffixes (fallback): `26-07-081234567890`

### Impact
All date folders created through the "new" button (which automatically adds letter suffixes for duplicates) will now be visible in the dropdown selector.

## Related Files

- `../chad-dashbord/components/shared/body-text-editor.tsx` - Editor component (fixed Tab behavior)
- `../chad-dba/src/leads.ts` - Auto-generation logic (uses `\t`) and date pattern validation (fixed)
- `../chad-dashbord/architecture/features/msg-planner.md` - Feature documentation
