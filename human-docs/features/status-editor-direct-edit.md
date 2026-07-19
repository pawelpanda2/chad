# Feature: Status Editor Direct Edit

## Principle

When editing a field that has only one meaningful action (entering a new value), skip the intermediate "Wybierz opcję" menu and go directly to the value input.

## Problem

Previously, for numeric fields like `priority-today`, the UX was:

```
current: 0

Wybierz opcję:
- zostaw bez zmian
- wpisz wartość (0-30)

Podaj wartość (liczba 0-30):
0
```

This is redundant because:
1. The user can already press Cancel (Esc) to leave unchanged
2. The user can enter an empty value to leave unchanged
3. The intermediate menu adds an unnecessary extra step

## Solution

Go directly to the value input:

```
current: 0

Podaj wartość (0-30):
_
```

The user can:
- Enter a new value and press Enter to update
- Press Enter on empty input to leave unchanged
- Press Esc to cancel and return to field selection

## Implementation

### Before (unnecessary intermediate menu)

```typescript
// Show current value
console.log(`\n--- Pole: ${field} ---`);
console.log(`current: ${currentValue || "[empty]"}`);

// Use clack select for options
const choice = await clack.select({
  message: 'Wybierz opcję:',
  options: [
    { value: 'unchanged', label: 'zostaw bez zmian' },
    { value: 'input', label: 'wpisz wartość (0-30)' }
  ],
  initialValue: 'unchanged'
});

if (clack.isCancel(choice)) {
  continue;
}

if (choice === 'input') {
  const inputValue = await clack.text({
    message: 'Podaj wartość (liczba 0-30):',
    placeholder: currentValue || '0'
  });
  // ... process input
} else {
  newValue = null;
}
```

### After (direct edit)

```typescript
// Direct edit - skip intermediate menu since there's only one action
console.log(`\n--- Pole: ${field} ---`);
console.log(`current: ${currentValue || "[empty]"}`);

const inputValue = await clack.text({
  message: 'Podaj wartość (0-30):',
  placeholder: currentValue || '0'
});

if (clack.isCancel(inputValue)) {
  continue;
}

if (inputValue) {
  const numValue = parseInt(inputValue);
  if (isNaN(numValue) || numValue < 0 || numValue > 30) {
    console.log("Błąd: Wartość musi być liczbą całkowitą z zakresu 0-30.");
    continue;
  }
  newValue = String(numValue);
}
// Empty input means leave unchanged (newValue stays null)
```

## When to Apply

This pattern should be applied when:
1. The field has only one meaningful edit action (entering a value)
2. The "leave unchanged" option can be handled by empty input or Cancel
3. There are no other meaningful options to choose from

## When NOT to Apply

This pattern should NOT be applied when:
1. There are multiple distinct actions (e.g., "choose date" vs "leave unchanged")
2. The field has boolean options that need explicit selection (e.g., true/false)
3. There are validation rules that require a confirmation step

## Affected Fields

- `priority-today` - numeric field (0-30)

## Unaffected Fields

- `her-first-msg` - boolean field with true/false/unchanged options
- `your-first-message` - boolean field with true/false/unchanged options
- `writing-deadline` - date field with "choose date" vs "leave unchanged" options

## Related Files

- `../chad-console/src/cli.ts` - Main CLI implementation