# Local browser smoke-test login credentials

Read this before asking the user for local login credentials — the answer
is almost always "they're already in `.env.local`, don't ask again."

## The rule

Local browser smoke tests (Playwright driving `http://localhost:12020`, or
an AI agent driving the same browser) read login credentials from the
**local dashboard `.env.local`** (repo root, gitignored — never committed,
never copied into `.env.local.example`).

**Required variable names** (values are never written to ai-docs, Story
files, reports, commits, logs, or screenshots):

- `E2E_LOGIN_PASSWORD` — shared local-Docker seed password for the
  ordinary local users (`pawel_f`, `test2`, `test3`). Existing convention,
  already used by `tests/1_1_data-protection/e2e/local-login.spec.mjs`.
- `E2E_TEST3_PASSWORD` — separate, pre-existing convention specifically for
  logging `test3` into the **real QNAP TEST** deployment over HTTP (see
  `tests/support/database/qnap-env.mjs`). Not needed for a purely local
  Docker smoke test — only set this if the task actually targets QNAP TEST.

Usernames (`pawel_f`, `test2`, `test3`) are not secret and are fine to
reference directly by name; only the password values are protected.

## How to use them in a smoke test / agent-driven browser session

1. Check `.env.local` for the variable above before asking the user for
   anything — if it's already set, use it silently, don't ask again.
2. If genuinely missing for the current session, ask the user once, then
   write the value directly into `.env.local` yourself (never have the user
   paste it somewhere it could be logged/echoed unnecessarily, and never
   echo it back in your own output).
3. Log in via the normal `/login` form (`Username` / `Password` fields) or
   `POST /api/auth/login` with `{ username, password }` — same contract
   real users go through, nothing test-only.
4. Never print the password value in terminal output, a report, a Story
   file, a commit message, or a screenshot. Screenshots of the login page
   before submit are fine; screenshots after typing the password (with the
   field unmasked) are not.

## Never

- Never commit `.env.local`.
- Never add these variables (or their values) to `.env.local.example`.
- Never write a password value into `ai-docs/`, `backlog/stories/`, or any
  report/checklist — variable *names* only, as in this file.
