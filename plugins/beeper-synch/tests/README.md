# tests/

This package's actual tests live **next to the source they test**
(`src/config.test.ts`, `src/lock.test.ts`, `src/backoff.test.ts`), run via
`pnpm test` (`tsx src/*.test.ts`) — the same convention already used by
`packages/beeper-sync/lib/owner-db.test.mjs` and
`packages/dropbox-sync`, rather than a parallel `tests/` tree.

This folder is kept (per the plugin's minimal structure) for any future
test that genuinely needs fixtures/data separate from `src/`, e.g. a real
child-process integration test spawning the built `dist/index.js`.
