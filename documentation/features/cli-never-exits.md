# Feature: CLI Never Exits

## Principle

The CLI application runs continuously and never terminates on its own. The only ways to exit the application are external signals: `Ctrl+C`, `Ctrl+D`, or killing the process.

## Core Rules

1. **No hidden exits** - No menu option, submenu, or helper function can terminate the application
2. **No process.exit() in helpers** - No helper function may call `process.exit()`
3. **No closing main readline** - No helper function may close the main readline interface
4. **Always return to menu** - Every menu and submenu must return to the appropriate parent menu after completion
5. **Main loop is infinite** - The main loop runs until EOF (Ctrl+D) or external termination

## Expected Behavior

- After any operation completes, the user returns to the appropriate menu
- After selecting "0. Wróć" (Back) in any submenu, the user returns to the parent menu
- The application continues running indefinitely until the user explicitly terminates it
- All error conditions are handled gracefully and return to the menu

## Implementation Details

### Main Loop Structure

```typescript
let rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let isClosed = false;

rl.on("close", () => {
  isClosed = true;
});

while (!isClosed) {
  // Show menu
  // Process option
  // Return to loop
}
```

### Submenu Pattern

Submenus use nested loops that set a flag to exit when "Back" is selected:

```typescript
let inSubmenu = true;
while (inSubmenu && !isClosed) {
  // Show submenu options
  let answer = await rl.question("Wybierz opcję: ");
  
  if (answer === "0") {
    inSubmenu = false;
    continue;
  }
  
  // Process option
}
// Returns to parent loop automatically
```

### Clack Integration

When using `@clack/prompts`, the library may call `process.stdin.unref()` which allows the process to exit. After any clack operation, we must restore stdin:

```typescript
// After clack operations
if (typeof process.stdin.ref === 'function') {
  process.stdin.ref();
}

if (typeof process.stdin.resume === 'function') {
  process.stdin.resume();
}

// Re-create readline if it was closed by clack
if (isClosed) {
  isClosed = false;
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.on("close", () => {
    isClosed = true;
  });
}
```

## Architecture

- One `readline` interface created at startup
- One main loop `while (!isClosed)`
- `rl.close()` only on EOF (Ctrl+D) or critical error
- Submenus use `clack` instead of creating their own `readline`
- After returning from submenus, `process.stdin.ref()` keeps the process alive

## Related Files

- `../chad-console/src/cli.ts` - Main CLI implementation
- `../chad-console/src/openai/askOpenAiAboutGirl.ts` - Example of proper clack integration