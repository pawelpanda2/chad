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

The implementation in `src/ai-answer.ts` had the correct logic for saving, but the following issues were identified and fixed:

1. **Missing integration in calling code**: The `askOpenAiAboutGirl.ts` file did not call `SaveAiAnswerToMsgWorkout` after getting the AI response
2. **No post-save menu**: After showing the AI response, the CLI would just wait for Enter and return, without showing the menu to view the saved item
3. **Missing verification output**: The save confirmation message was minimal and didn't clearly show where the item was saved

## Fix Applied

1. **Updated `src/ai-answer.ts`**:
   - Added diagnostic logging for all API calls (PostParentItem msg workout args, PostParentItem ai answer args, Put ai answer args)
   - Improved success message to clearly show loca, name, and address
   - Better handling of Put response (which may return empty body with just success: true)

2. **Updated `contentProviderClient.ts`**:
   - Added export for `SaveAiAnswerToMsgWorkout` and `SaveAiAnswerResult` type

3. **Updated `askOpenAiAboutGirl.ts`**:
   - Added import for `SaveAiAnswerToMsgWorkout`, `invokeContentProvider`, `SHARED_REPO_ID`, and `readline`
   - After displaying AI response, calls `SaveAiAnswerToMsgWorkout` to save the answer
   - Added `showPostSaveMenu` function that shows:
     ```
     1. Wyświetl zapisany msg workout item
     0. Powrót
     ```
   - Option 1 fetches and displays the saved item body
   - Option 0 returns to main menu
   - CLI continues to work normally after the flow

## Implementation Reference

The correct implementation follows the C# test pattern exactly:

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

## Additional UX Issues Fixed (2026-06-19)

### Problem: AI Answer Auto-Printed and Debug Spam

After the initial fix, new issues were identified:

1. **Automatic full answer display**: After getting OpenAI response, the full AI answer was automatically printed to console without user choice
2. **Debug log spam**: The following debug logs were printing the full AI answer body, cluttering the console:
   - `DEBUG: Put ai answer args: [..., "pełna długa odpowiedź AI..."]`
   - `DEBUG: Put response: {"Body":"pełna długa odpowiedź AI..."}`
3. **No clean summary**: After saving, user was overwhelmed with full content instead of a clean summary

### Expected Behavior

1. After OpenAI response, do NOT automatically print the full answer
2. Show only a short summary after saving:
   ```
   ✅ OpenAI answer received
   ✅ AI answer saved
   loca: 03/06/75/02/05
   name: 26-06-19; ai bot
   ```
3. Then show a menu:
   ```
   --- Menu ---
   1. Wyświetl zapisany item z Content Providera
   2. Wyświetl odpowiedź AI z pamięci
   0. Powrót
   ```
4. Only show full AI answer content when user explicitly chooses option 2
5. No debug logs that print full AI answer body

### Fix Applied

1. **Removed auto-print of AI answer** in `askOpenAiAboutGirl.ts`:
   - Removed the block that printed full response with `console.log(response)`
   - Now shows only summary: "✅ OpenAI answer received", lead name, saved item name

2. **Removed debug logs** in `src/ai-answer.ts`:
   - Removed `console.log("DEBUG: Put ai answer args:", JSON.stringify(putArgs))`
   - Removed `console.log("DEBUG: Put response:", JSON.stringify(putResponse))`
   - Removed `console.log("DEBUG: PostParentItem msg workout args:", ...)`
   - Removed `console.log("DEBUG: PostParentItem ai answer args:", ...)`

3. **Added option 2 to post-save menu** in `askOpenAiAboutGirl.ts`:
   - Option 1: Fetch and display saved item from Content Provider via `GetItem`
   - Option 2: Display AI answer from memory (the `response` variable)
   - Option 0: Return to main menu

## Files Involved

- `src/ai-answer.ts` - Core save logic
- `../chad-console/src/contentProviderClient.ts` - Re-exports for console
- `../chad-console/src/openai/askOpenAiAboutGirl.ts` - Calling code that integrates save and continues flow
- `../chad-console/src/cli.ts` - Main CLI menu flow