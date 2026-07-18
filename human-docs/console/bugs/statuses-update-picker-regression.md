# Bug: Statuses Update Picker Regression

## Summary

After a refactor, the interactive picker for the Statuses Update feature was replaced with a simple text input, breaking the expected workflow.

## Symptoms

1. **Wrong UI after entering option 4**:
   - Expected: Interactive picker with arrow keys (clack select)
   - Actual: Simple text prompt "Wybierz numer do edycji:"

2. **Error when entering `all`**:
   - User enters `all` in the picker
   - System responds: "Nieprawidłowy numer."
   - This is because `all` was being interpreted as a number in the picker stage

## Root Cause

The two-stage selection process was conflated into a single stage:

- **Stage 1 (Range Selection)**: Should accept `all`, `1-10`, `-10`, etc.
- **Stage 2 (Picker)**: Should be an interactive clack select with arrow keys

The refactor removed Stage 2 entirely and tried to handle everything with text input, causing:
1. `all` to be interpreted as a number in the picker
2. Loss of interactive arrow-key navigation
3. No default selection of the last lead

## Impact

- Users cannot use arrow keys to navigate the lead list
- `all` command fails with "Nieprawidłowy numer"
- Users must manually type lead numbers instead of using visual selection
- No default selection of the last (newest) lead

## Fix

Restore the two-stage selection process:

1. **Stage 1**: Text input for range selection
   ```
   Który zakres leadów pokazać?
     all       - wszystkie
     1,4,5     - konkretne pozycje
     1-10      - zakres
     -10       - ostatnie 10 najnowszych
   
   Zakres:
   ```

2. **Stage 2**: Interactive clack select picker
   ```
   ◆ Wybierz leada do edycji:
   │  ○ 75. 26-05-29_pn_Amelia [ważny]
   │  ○ 77. 26-05-30_pn_Roksana_Characzko [nieaktualny]
   │  ● 88. 26-07-04_pi_Karolina [brak statusu]
   │  ○ 0. Wróć
   ```

Key requirements:
- Default selection should be the last real lead (not "Wróć")
- `all` is entered at Stage 1, NOT in the picker
- After editing, return to the same picker (not main menu)
- No automatic advancement to next lead

## Related Files

- `../chad-console/src/cli.ts` - Main CLI implementation
- `architecture/chad-console/features/status-editor.md` - Feature documentation