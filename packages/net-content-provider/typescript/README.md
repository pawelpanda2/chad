# Content Provider TypeScript Implementation

This folder is reserved for a future native TypeScript implementation of the content provider.

## Current Status

Currently, the TypeScript implementation is **not active**. The system uses the C# implementation through the `typescript_runner` adapter.

## Future Plans

When we implement a native TypeScript version, it will:
- Replicate the logic from the C# implementation
- Provide the same interfaces and functionality
- Be callable directly from Node.js without spawning external processes

## Current Integration

For now, use the `typescript_runner` package to interact with the C# implementation:

```typescript
import { getItem } from '../typescript_runner/src/sharp-runner';

const result = await getItem('root', '');
```

## Structure

The files in this folder (`types.ts`, `repo-service.ts`, etc.) are work-in-progress and may be used for the future native implementation.