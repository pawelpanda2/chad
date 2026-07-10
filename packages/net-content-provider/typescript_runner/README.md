# Content Provider TypeScript Runner

This package provides a TypeScript adapter for calling the C# Content Provider SimpleRun application.

## Overview

The TypeScript runner allows you to invoke the C# implementation of the content provider from TypeScript/Node.js code. Each call spawns a new C# process, executes the requested operation, and returns the result.

## Installation

```bash
npm install
```

## Usage

### Running the Demo

```bash
npm run demo
```

This will execute a demo that calls `getItem("root", "")` using both the convenience wrapper and the generic invoke function.

### Using in Your Code

```typescript
import { getItem, invokeSharp, invokeMethod } from './sharp-runner';

// Option 1: Use the convenience getItem wrapper
const result = await getItem('root', '');
console.log(result);

// Option 2: Use the generic invokeMethod
const result2 = await invokeMethod('IRepoService', 'IItemWorker', 'GetItem', 'root', '');
console.log(result2);

// Option 3: Use the low-level invokeSharp with raw args
const result3 = await invokeSharp([
  'IRepoService',
  'IItemWorker',
  'GetItem',
  'root',
  ''
]);
console.log(result3);
```

### Available Functions

#### `invokeSharp(args: string[]): Promise<string>`
Low-level function that invokes the C# SimpleRun application with the provided arguments.
- **Parameters**: `args` - Array of arguments to pass to the C# application
- **Returns**: Promise that resolves with the stdout output (trimmed)
- **Throws**: Error if the process fails

#### `getItem(repo: string, loca: string): Promise<string>`
Convenience wrapper for calling `IRepoService.IItemWorker.GetItem`.
- **Parameters**:
  - `repo` - The repository ID
  - `loca` - The location within the repository
- **Returns**: Promise that resolves with the item content

#### `invokeMethod(service, worker, method, ...additionalArgs): Promise<string>`
Generic method to invoke any service/method through the C# application.
- **Parameters**:
  - `service` - Service name (e.g., 'IRepoService')
  - `worker` - Worker name (e.g., 'IItemWorker')
  - `method` - Method name (e.g., 'GetItem')
  - `additionalArgs` - Additional arguments to pass
- **Returns**: Promise that resolves with the result

## Running C# Directly

You can also run the C# application directly from the command line:

```bash
# From the SimpleRun directory
cd content-provider/charp/SimpleRun
dotnet run -- IRepoService IItemWorker GetItem root ""

# Or with an absolute project path
dotnet run --project content-provider/charp/SimpleRun/SimpleRun.csproj -- IRepoService IItemWorker GetItem root ""
```

## Building

To compile TypeScript to JavaScript:

```bash
npm run build
```

This will output compiled files to the `dist/` directory.

## Development Scripts

- `npm run build` - Compile TypeScript
- `npm run demo` - Run the demo with ts-node (no compilation needed)
- `npm run demo:compiled` - Run the compiled demo
- `npm run typecheck` - Type-check without emitting files
- `npm run clean` - Remove the dist directory

## Architecture

```
content-provider/
├── charp/                    # C# implementation (source of truth)
│   └── SimpleRun/           # CLI entry point
├── typescript/              # Future native TypeScript implementation
└── typescript_runner/       # TypeScript adapter (this package)
    └── src/
        ├── sharp-runner.ts  # Main adapter
        └── demo.ts          # Demo/test file
```

## How It Works

1. TypeScript code calls one of the runner functions (e.g., `getItem()`)
2. The runner constructs the appropriate command line arguments
3. It spawns a new `dotnet run` process for the C# SimpleRun application
4. The C# application:
   - Prepares the container and services
   - Parses the command line arguments
   - Invokes the requested service/method
   - Writes the result to stdout
5. The TypeScript runner captures stdout and returns it as a string
6. Any errors are written to stderr by C# and included in the thrown error

## Notes

- Each call spawns a new C# process (no persistent daemon)
- The C# application handles all the business logic
- TypeScript runner is just an adapter/wrapper
- Stdout contains only the result (no extra formatting)
- Stderr is used for logs and error messages