# cp-core (`packages/content-provider/common/`)

Shared, **database-independent** Content Provider contracts:

- `contracts.ts` — `CpItem`, `ContentProviderStorage`
- `types.ts` — `CpConfig`, `CpItemType`, …
- `errors.ts`

No storage selection here — that is `cp-entry` (router/factory). Backend-specific code lives under `mongo/` and `postgre/` only.
