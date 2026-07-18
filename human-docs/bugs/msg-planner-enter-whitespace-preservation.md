# Bug: Msg Planner Enter Whitespace Preservation

## Summary

In the Msg Planner editor, pressing Enter must preserve the exact raw leading whitespace of the current line. A line that starts with one or more real tab characters (`\t`) must create the next line with the same raw prefix. The editor must not normalize indentation to spaces, and it must not convert spaces to tabs.

## Symptom

When editing a plan body such as:

```text
\t03/06/51; test
```

and pressing Enter at the end of the line, the next line can appear with space-based indentation instead of a raw tab prefix. After multiple Enter presses, the visible whitespace can also disappear on empty lines, which makes it look like indentation was lost.

Observed user case:

```text
	d; 26-05-07_pi_Ola_Solodka

//sorted
```

After pressing Enter repeatedly, indentation looked like four spaces, and then appeared to move to another line while the previous line looked empty.

Exact reproduced sequence from browser session on `http://localhost:3000/dashboard/msg-planner`:

1. Cursor was placed at end of a line that starts with a real tab.
2. Enter was pressed three times.
3. The current line became four spaces (`[32,32,32,32]`) instead of `\t` (`[9]`).
4. Around-cursor snapshot showed consecutive empty lines and one space-indented line.

So the reported behavior was real: Enter x3 produced space indentation in that scenario.

## Root Cause

The bug came from treating Enter as an editor-formatting action instead of a raw-text action.

The editor must copy the leading whitespace from the current raw line text and insert it unchanged into the new line. Any code path that uses CodeMirror indentation helpers, default auto-indent behavior, or string normalization can mutate the stored body and break the format.

There was also a visualization gap: tab markers were not reliably visible on empty lines that contained only tabs. This created a false impression that tabs had disappeared or been moved.

Additionally, a runtime regression in custom tab-marker decorations caused CodeMirror plugin crashes:

`Error: Ranges must be added sorted by from position and startSide`

This made some interactions unreliable until the marker ordering was fixed.

## Required Rule

The Msg Planner body format is tab-based.

- Real `\t` characters are part of the saved data
- `\t` must never be replaced by spaces
- spaces must never be rewritten as tabs
- Enter must preserve the exact leading whitespace prefix from the current line
- no auto-formatting may mutate the raw body

## Solution

### 1. Raw Enter handler
**File:** `../components/shared/body-text-editor.tsx`

Enter now reads the current line as a raw string, extracts the prefix with:

```typescript
const currentLinePrefix = currentLine.match(/^[\t ]*/)?.[0] ?? "";
```

and inserts:

```typescript
"\n" + currentLinePrefix
```

That keeps the exact leading whitespace, including real tabs.

The Enter/Tab keymaps are now wrapped with `Prec.highest(...)`, so CodeMirror default newline-indent behavior cannot override the raw-preservation handler and inject spaces.

### 2. Visual-only whitespace overlay
**File:** `../components/shared/body-text-editor.tsx`

Whitespace visibility is controlled only by presentation:

- tabs stay raw in the saved content
- the editor can show or hide whitespace markers with the `ws` button
- visible whitespace is only a debug overlay
- the underlying body is not rewritten when the overlay changes

To make tabs visible even on empty lines with tab-only content, the editor uses an explicit tab marker decoration (`→`) on each raw tab character when `ws` is enabled.

Decoration insertion order was corrected to satisfy CodeMirror sorting requirements and remove the plugin crash.

### 3. Diagnostic helper
**File:** `../components/shared/body-text-editor.tsx`

A helper is available to visualize raw whitespace in debug output:

- tab -> `\\t`
- space -> `·`
- newline -> `\\n`

This is for inspection only and does not change the stored body.

## Manual Test

1. Open a Msg Planner body whose raw content starts with `\t`.
2. Put the cursor at the end of that line.
3. Press Enter.
4. The new line must start with the same raw whitespace prefix.
5. Press Enter several more times.
6. Every inserted line must keep raw `\t` prefixes, not spaces.
7. Empty lines that contain tabs must still show the tab marker when whitespace overlay is enabled.
8. Save and reload the file.
9. Raw body must still contain `\t`, not space indentation.

### Extra regression test for repeated Enter

1. Start with a line beginning with a tab:

```text
	d; 26-05-07_pi_Ola_Solodka
```

2. Put cursor at end of line and press Enter multiple times.
3. Verify each created line preserves the same raw prefix (`\t`).
4. Confirm `ws` mode shows tab markers on tab-only lines.
5. Save and reload.
6. Verify raw value still contains tabs, not four spaces.

### Verified result after fix

Re-tested on the same page with cursor at end of a tab-prefixed line and Enter pressed 3 times.

Observed around-cursor lines:

- line 10: `→\t03/06/79/03/11; ...`
- line 11: `→\t`
- line 12: `→\t`
- line 13: `→\t`

Character codes on created lines were `[8594, 9]` (arrow widget + real tab), not `[32,32,32,32]`.

This confirms Enter now preserves raw tab prefix across repeated Enter presses.

## Known Constraints

- This bug is solved only at the editor layer.
- It does not change the Msg Planner format itself.
- The raw body must remain the source of truth.

## Files Changed

- `../components/shared/body-text-editor.tsx`
- `../app/(dashboard)/dashboard/msg-planner/page.tsx`
