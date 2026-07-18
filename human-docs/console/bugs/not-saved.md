# Bug: AI Answer Not Saved to `msg workout`

## Description

After displaying the AI response on the console, the answer is not correctly saved to the Content Provider. Additionally, after the AI response is shown, the CLI stops/hangs and does not show the further menu.

## Symptoms

1. AI answer is printed to console
2. The answer is NOT saved to `msg workout` in Content Provider
3. CLI stops/hangs after showing the response
4. No menu appears to view the saved item or return

## Expected Behavior

1. AI answer is saved to `msg workout` under the selected lead
2. Console shows where it was saved (loca and item name)
3. After saving, a menu appears:
   ```
   1. Wyświetl zapisany msg workout item
   0. Powrót
   ```
4. If user selects 1:
   - Fetch and display the saved item body
   - Then return to the small menu
5. If user selects 0:
   - Return to previous menu / main menu
6. CLI continues to work normally after the entire flow

## Root Cause

The current implementation in `src/ai-answer.ts` appears to have the correct logic for saving, but there may be issues with:
- Error handling that causes the process to exit
- Missing confirmation/verification of the PUT operation
- The calling code in `askOpenAiAboutGirl.ts` does not call the save function and does not continue the menu flow after showing the response

## Implementation Reference

The correct implementation should follow the C# test pattern exactly:

1. Get all leads: `["IRepoService", "IItemWorker", "GetByNames", repoId, "leads", "all items"]`
2. Find lead by name in Body map
3. Build leadAddress: `allItem.Address + "/" + leadKey`
4. Extract leadLoca from leadAddress
5. Find or create `msg workout`: `["IRepoService", "IItemWorker", "PostParentItem", repoId, leadLoca, "Text", "msg workout"]`
6. Read existing children from `msgWorkout.Body`
7. Build new item name: `YY-MM-DD; ai bot` (or with suffix b, c, etc.)
8. Create AI answer item: `["IRepoService", "IItemWorker", "PostParentItem", repoId, msgWorkoutLoca, "Text", newName]`
9. Extract createdLoca from createdItem.Address
10. Save AI answer: `["IRepoService", "IItemWorker", "Put", repoId, createdLoca, "Text", newName, aiAnswer]`
11. Verify the saved item and show confirmation
12. Show menu for viewing or returning

## Diagnostic Logging

Add logs for:
- PostParentItem msg workout args
- PostParentItem ai answer args
- Put ai answer args
- Saved item address/name

## Files Involved

- `src/ai-answer.ts` - Core save logic
- `../chad-console/src/openai/askOpenAiAboutGirl.ts` - Calling code that needs to integrate save and continue flow
- `../chad-console/src/cli.ts` - Main CLI menu flow