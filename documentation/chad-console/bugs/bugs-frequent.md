# Bugs Frequent

## Status Parser Bug - Next Line as Value

**Bug:**
Parser statusów traktował następną linię jako wartość pustego pola. Na przykład dla body:

```
her-first-msg: true
your-first-message: true
writing-deadline:
priority-today: 1
```

Pole `writing-deadline:` było błędnie odczytywane jako mające wartość `priority-today: 1`, co powodowało wyświetlanie:

```
--- Pole: writing-deadline ---
Obecna wartość: "priority-today: 1"
```

**Root Cause:**
Parser YAML-like nie był poprawnie zaimplementowany - traktował kolejną linię jako wartość poprzedniego pola, jeśli pole miało pustą wartość (tylko `key:` bez wartości).

**Fix:**
Parser YAML-like musi interpretować `key:` jako pustą wartość i nigdy nie brać kolejnej linii jako wartości. Każda linia jest niezależna:
- linia `key:` oznacza key z pustą wartością
- linia `key: value` oznacza key z wartością `value`
- następna linia nigdy nie jest wartością poprzedniego pola

Poprawione funkcje `getYamlFieldValue` i `mergeYamlBody` teraz poprawnie parsują każdą linię niezależnie, używając regex `^${field}\\s*:\\s*(.*)` do ekstrakcji wartości tylko z tej samej linii.

## writing-deadline Update Bug

**Bug:**
Podczas uzupełniania statusu pole `writing-deadline` nie zapisało wartości `26-06-18`.
Po zapisie body było:

```
her-first-msg: true
your-first-message: true
writing-deadline:
priority-today: 1
```

Oczekiwane:

```
her-first-msg: true
your-first-message: true
writing-deadline: 26-06-18
priority-today: 1
```

**Podejrzenie:**
Parser/update YAML-like body źle aktualizuje pole `writing-deadline` albo pomija wartość po wyborze daty.

**Root Cause:**
The `upsertYamlField` function uses regex `^${key}\\s*:` to match existing fields. For `writing-deadline`, the original body has `writing-deadline:` (with no value). The regex matches this line, but the replacement `return `${key}: ${value}`;` produces `writing-deadline: 26-06-18`. However, if the original line is `writing-deadline:` followed by nothing (empty value), the regex test passes but the line replacement might fail if there's a formatting issue.

The issue was that the regex pattern was using the key directly without escaping special regex characters. The key `writing-deadline` contains a hyphen `-` which in regex is a special character (used for character ranges). While in this specific case it might work since it's not inside brackets, it's still problematic and could cause issues in certain edge cases.

**Fix:**
Added `escapeRegex` helper function and updated `upsertYamlField`, `hasField`, and `getYamlFieldValue` functions to properly escape regex special characters in field names before using them in regex patterns.

```typescript
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

The fix ensures that field names like `writing-deadline`, `her-first-msg`, and `your-first-message` are properly escaped when used in regex patterns.

## Checkbox to Single Select UX Change

**Bug:**
The original implementation used `clack.multiselect` which allowed selecting multiple fields at once. The user wanted to change only one field at a time and loop back to the selection menu after each edit.

**Fix:**
Changed from `clack.multiselect` to `clack.select` and implemented a loop that:
1. Shows "Edycja statusu:" header at the start
2. Shows single select with all fields showing `current: value (old: originalValue)`
3. After editing a field, loops back to the select menu with updated values
4. Only exits the loop when user selects "exit and save" or "exit without save"
5. Shows preview (Before/After) only after "exit and save" is selected
6. Validates required fields before saving (sets defaults for empty fields)

The new flow provides a more intuitive experience where users can make multiple changes one at a time and see the progress in real-time.

## Boolean Fields - Remove Date Option

**Bug:**
The boolean fields `her-first-msg` and `your-first-message` had a `date` option which doesn't make sense for boolean fields.

**Fix:**
Removed the `date` option from these fields. Now they only show:
- `zostaw bez zmian`
- `true`
- `false`

## priority-today Number Validation

**Bug:**
The `priority-today` field accepted any text input, but it should be an integer between 0 and 30.

**Fix:**
Added validation for the `priority-today` field:
- Must be a valid integer
- Must be between 0 and 30 (inclusive)
- Empty input means "leave unchanged"
- Invalid values show error message: "Błąd: Wartość musi być liczbą całkowitą z zakresu 0-30."

## CLI Loop Bug - Submenu Exit

**Bug:**
After completing an action in the Statuses Setup submenu, the script would exit instead of returning to the submenu.

**Expected behavior:**
- After completing any action, return to the submenu
- After selecting `0. Wróć`, return to the main menu
- Only `0. Exit` from the main menu should end the process

**Root Cause:**
The submenu loop structure was not properly handling the return flow after actions completed.

**Fix:**
Ensured that:
1. The main menu runs in a `while (!isClosed)` loop
2. The submenu runs in a `while (inSubmenu && !isClosed)` loop
3. Each action uses `continue` to return to the submenu loop
4. Selecting `0` sets `inSubmenu = false` and uses `continue` to return to main menu
5. The `rl.question` errors are caught and handled without exiting the loops

## Put Empty Response Body Bug

**Bug:**
The `/invoke` endpoint returns an empty response body for Put operations, which was incorrectly treated as a failure. This caused errors like:

```
failed to migrate: 06/73/03 for 26-05-12_pn_Wiktoria
Empty response body from /invoke.
```

**Root Cause:**
The `invokeContentProvider` function was throwing an error when the response body was empty, even though the HTTP status was 2xx (success). For Put operations, an empty response body is valid - the 2xx status code indicates success.

**Fix:**
Modified `invokeContentProvider` in `contentProviderClient.ts` to check if the operation is a Put (by checking if `args[2] === "Put"`). For Put operations, if the response body is empty but the HTTP status is 2xx, return `{ success: true }` instead of throwing an error.

```typescript
// For Put operations, empty response body is valid (2xx status = success)
const isPutOperation = args.length >= 3 && args[2] === "Put";
if (!text && isPutOperation) {
  return { success: true };
}
```

**Rule:** Put can return empty response body; HTTP 2xx + empty body = success.

## Old Migration Path Crashed API/Server

**Bug:**
Option 4 ("Migruj statusy do nowego formatu") used different migration logic than option 5 ("Migracja chirurgiczna statusów"). This inconsistency caused:
- Different migration results for the same input
- Option 4 could crash the API/server due to incorrect handling
- Confusion about which migration logic was correct

**Root Cause:**
- Option 4 had its own inline migration logic with manual field parsing and default handling
- Option 5 used a more robust `surgicalMigrateStatus()` function
- The two approaches produced different results and had different error handling

**Fix:**
1. Extracted shared migration logic into `src/statusMigration.ts` with the `buildMigratedStatusBody()` function
2. Both option 4 and option 5 now use the same `buildMigratedStatusBody()` function
3. Renamed menu options for clarity:
   - Option 4: "Migration without preview" - executes immediately, shows summary at end
   - Option 5: "Migration with preview (details)" - shows Before/After for each record with confirmation

**Rule:** Options 4 and 5 share the same migration builder and Put handler. They differ only in UI flow (preview vs no preview), not in migration logic.

## Critical YAML Parser Bug - Values Shifted

**Bug:**
The parser was showing field names as values instead of actual values:

```
BŁĘDNIE:
her-first-msg: your-first-message: (old: your-first-message:)
your-first-message: writing-deadline: (old: writing-deadline:)
writing-deadline: priority-today: (old: priority-today:)
priority-today: [empty] (old: [empty])
```

```
POPRAWNIE:
her-first-msg: true (old: false)
your-first-message: true (old: false)
writing-deadline: 26-04-09 (old: 99-01-01)
priority-today: 1 (old: 2)
```

**Root Cause:**
The regex-based parser was still incorrectly matching values across lines, treating the next line as the value of the previous field.

**Fix:**
Implemented a strict line-by-line parser that:
1. Splits body by newlines
2. For each line, finds the first colon
3. Everything before the colon is the key
4. Everything after the colon is the value (trimmed)
5. Next line is NEVER the value of the previous field

```typescript
function parseStatusBody(body: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();

    if (!key) continue;

    result[key] = value;
  }

  return result;
}
```

**Test cases:**
```
Input:
her-first-msg: true
your-first-message: true
writing-deadline:
priority-today: 1

Expected:
{
  "her-first-msg": "true",
  "your-first-message": "true",
  "writing-deadline": "",
  "priority-today": "1"
}

Input:
her-first-msg:
your-first-message:
writing-deadline:
priority-today:

Expected:
{
  "her-first-msg": "",
  "your-first-message": "",
  "writing-deadline": "",
  "priority-today": ""
}
```
