# Bug: ESLint Errors in Local chad-dba Copy Block Build

## Description

The dashboard build fails due to ESLint errors in the local `lib/chad-dba/` directory, which contains a copy of the chad-dba package. These are pre-existing issues unrelated to new feature development.

## Errors

### `@typescript-eslint/no-explicit-any`
Multiple files use `any` type instead of specific types:
- `lib/chad-dba/client.ts` (4 occurrences)
- `lib/chad-dba/leads.ts` (12 occurrences)
- `lib/chad-dba/beeper.ts` (3 occurrences)
- `lib/chad-dba/path-resolver.ts` (2 occurrences)
- `lib/chad-dba/reports.ts` (2 occurrences)
- `lib/chad-dba/ai-answer.ts` (1 occurrence)

### `@typescript-eslint/no-unused-vars`
Variables defined but never used:
- `lib/chad-dba/client.ts`: `parseError`
- `lib/chad-dba/leads.ts`: multiple `key` variables in object iterations
- `lib/chad-dba/beeper.ts`: multiple `key` variables
- `lib/chad-dba/ai-answer.ts`: `key` variable

## Impact

- Build fails with ESLint errors
- Cannot deploy or test the dashboard
- Blocks development of new features

## Workaround

Add ESLint disable comments or configure ESLint to ignore the `lib/chad-dba/` directory:

```js
// eslint.config.mjs
export default [
  // ... existing config
  {
    ignores: ["lib/chad-dba/**"],
  },
];
```

Or change ESLint rules to warnings:

```js
rules: {
  "@typescript-eslint/no-explicit-any": "warn",
  "@typescript-eslint/no-unused-vars": "warn",
}
```

## Recommended Fix

1. Update the local `lib/chad-dba/` copy to use proper TypeScript types
2. Replace `any` with specific interfaces
3. Remove unused variables
4. Or better: use the npm package approach instead of local copy

## Related

This issue exists because the dashboard uses a local copy of chad-dba in `lib/chad-dba/` instead of importing from the npm package. The local copy may be out of sync with the main chad-dba package and doesn't benefit from the same ESLint configuration.