# Bug: Status Editor - Double Confirmation on "exit and save"

## Description

When user selects the "exit and save" option in the status editor, the program:
1. Shows a preview of changes (Before/After)
2. Then asks again: "Zapisać? Yes/No"

This is incorrect UX - the user has already made the decision to save by choosing "exit and save".

## Expected Behavior

- When user selects "exit and save", the program should:
  1. Show the preview (Before/After) - this is informative, not a confirmation request
  2. Save the changes immediately without asking for confirmation
  3. Exit the editor / return to previous flow

- The "Zapisać?" confirmation should only appear in other paths where the user hasn't explicitly chosen to save.

## Actual Behavior

After selecting "exit and save", the program shows the preview and then asks "Zapisać?" requiring another confirmation.

## Affected Code Locations

1. `../chad-console/src/cli.ts` - Option 3 "Uzupełnij statusy" (around lines 1341-1362)
2. `../chad-console/src/cli.ts` - Option 4 "Statuses Update" (around lines 2082-2116)

## Fix

Remove the `clack.confirm({ message: 'Zapisać?' })` call after showing the preview when the user has selected "exit and save". The save should happen automatically after showing the preview.