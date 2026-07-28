# Tests — start here

Read this before adding, moving, or deleting anything under `tests/`. Full
detail (commands, local vs QNAP TEST vs real-Google-Sheets, PASS/FAIL/
SKIPPED/BLOCKED semantics) lives in `tests/README.md` — this file is the
orientation map for AI agents, that one is the reference.

## The 4 fixed pillars (2026-07-28 reorg)

```
tests/
├── 1_1_data-protection/{description.md, unit/, integration/, e2e/}
├── 1_2_google-sheets-sync/{description.md, unit/, integration/, e2e/}
├── 1_3_history-integrity/{description.md, unit/, integration/, e2e/}
├── 1_4_tables-release/{description.md, daily/{unit,integration,e2e}, dates/{...}, leads/{...}}
└── support/{database/, users/, google-sheets/, assertions/, fixtures/}
```

There is no 5th pillar and no `tests/regression/` — every test belongs in
exactly one of these four, chosen by its **actual purpose**, never by
filename or by where it's convenient to drop it. If a test is genuinely
cross-cutting (e.g. it protects Daily+Dates+Leads system folders together,
or covers login + Daily/Dates round-trip + History in one file), assign it
to the ONE pillar it most directly protects rather than splitting it — never
duplicate a test file across pillars to make it "belong everywhere."

Each pillar has a `description.md` — a short paragraph (Polish, matches the
existing 4 verbatim) stating what kind of change requires that pillar's
regression to pass before the task is DONE. **These are not required before
every commit** — only before finishing a task that touches that pillar's
area, and before a release-readiness audit.

## unit / integration / e2e

- **`unit/`** — pure logic, no network/DB/browser, safe to run anywhere.
- **`integration/`** — real database or real HTTP API. Files named
  `local-*` target `localhost` (Postgres/Mongo/dashboard you started
  yourself); files named `qnap-test3-*` target the real, already-running
  QNAP TEST deployment, always scoped to test3's own repoGuid.
- **`e2e/`** — Playwright against a real, already-running dashboard, never
  one the test itself starts.

## Adding a new test

1. Decide the pillar by actual purpose (see the 4 `description.md` files).
2. Decide unit/integration/e2e by what it touches (see above).
3. Reuse shared helpers/fixtures from `tests/support/{database,users,
   google-sheets,assertions,fixtures}/` — never duplicate a helper
   per-pillar. Add new shared helpers there, not inside a pillar folder.
4. If it's `node:test`-based (`.test.mjs`, `import { test } from "node:test"`),
   it's run via `node --test` (see the `test:regression:*` / `test:tables-sync*`
   scripts in root `package.json`). If it's Vitest-based (`.test.ts`/`.test.mjs`
   with `import ... from "vitest"`), it must also be added to `vitest.config.mjs`'s
   `include` array (explicit file paths, not a directory glob — the two test
   runners share these directories, and a glob would sweep in the other
   runner's files).
5. If the test mutates a real, shared environment (QNAP TEST's real Mongo/
   Postgres, or real Google Sheets), gate it behind an explicit env var
   (`E2E_TEST3_PASSWORD`, `E2E_LOGIN_PASSWORD`, `GOOGLE_SERVICE_ACCOUNT_*`)
   and `describe.skipIf`/`it.skipIf` — never fail when the credential is
   simply absent, and never touch pawel_f/kamil_s. Label a real-Google-Sheets
   test explicitly in its own header comment (see
   `tests/1_2_google-sheets-sync/integration/qnap-test3-google-sheets.test.mjs`
   for the pattern).
6. A SKIPPED or BLOCKED test must never be reported as PASS — surface it by
   name in whatever report/checklist the task produces. A FAIL must always
   produce a non-zero exit code.

## Moving/renaming a test

Fix its imports (relative depth to `tests/support/*` and to
`packages/dba/dist|src/*` almost always changes) and re-run it before
considering the move done — a move that "just" changes the path is exactly
the kind of change that silently breaks `path.resolve(__dirname, "../..")`-
style constants inside test helpers. Never change what a test asserts as
part of a pure move.
