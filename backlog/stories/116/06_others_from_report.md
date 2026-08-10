# Story 116 — Other notes

## Architectural decisions

- **`packages/payments` as a new dedicated package**, per the user's explicit
  mid-task correction (Input 2): `Dashboard → dba → payments → Stripe`,
  Dashboard never imports `payments` directly. This deliberately does NOT
  follow `packages/google-contacts`'s own precedent (its Dashboard routes
  import `google-contacts` directly for a stateless OAuth-URL helper) —
  Input 2 explicitly overrides that precedent for Payments.
- **Minimal persistence** (`cp_stripe_payments`, migration `0005`) — exactly
  enough to make webhook redelivery idempotent and give the success page a
  non-spoofable status to poll. No entitlement/billing system, per the
  Story's own instruction not to over-build this.
- **Real `test2`/`test3` identities in the Postgres integration test**, per
  the user's explicit correction — `test2`'s repoGuid is resolved
  dynamically from the real `chad_admin/users/users-list` (never
  hardcoded/guessed), `test3`'s from the existing confirmed
  `TEST3_REPO_GUID` constant. Only the synthetic Stripe Checkout Session ids
  (`story116_test_*`, which don't correspond to anything in a real Stripe
  account either way) are fake.

## Problems encountered and how they were resolved

- **Pre-existing unrelated work in the working tree at Story start.** `git
  status` showed substantial uncommitted changes (Knowledge v2, Folders,
  DBA refactors) that don't belong to this Story. Left completely untouched
  per the safety rules — this Story's own changes are staged/committed
  file-by-file, never via a blanket `git add`. Starting commit SHA:
  `bf37a5f`.
- **Three accidental partial secret exposures this session, all flagged to
  the user immediately, none repeated.** (1) A `grep`/`sed` redaction
  pattern missed a line while checking `.env.local` for the local-mac-docker
  Postgres convention, printing that local-only Postgres password once. (2)
  A broader `grep -n "^GOOGLE_CONTACTS"` (meant to just locate a section
  header) matched full lines and printed the real
  `GOOGLE_CONTACTS_CLIENT_SECRET`. (3) **Input 5 continuation:** `stripe
  listen --forward-to ... > log-file` was started with its stdout
  redirected to a file, then that file was `cat`'d to confirm the listener
  started — `stripe listen` prints its (ephemeral, session-scoped) webhook
  signing secret to stdout by default, so it appeared in a tool result too.
  Fixed the same way each time going forward: the listener was restarted
  with output still redirected to a file, but the file was only ever
  `grep -c`/pattern-matched for *presence* (never displayed), and the
  actual `whsec_...` value was extracted and written into `.env.local` via
  a Python script that reads the log file and writes the target file
  directly — the value itself never passed through a Bash command or tool
  output a second time. User told to consider rotating all three affected
  credentials (the local Postgres password, the Google Contacts client
  secret, and — lowest priority, since it's a disposable per-CLI-session
  value tied to a local dev process — nothing further needed for the
  `stripe listen` secret). The one unavoidable exception across the whole
  session: Input 3's own real Stripe secret key had to appear once,
  literally, in the single command that wrote it to `.env.local` — there is
  no way to place a value into a file via a tool call without that value
  appearing in the call itself, and the user had already put the same value
  in their own message. It was never repeated, echoed, or included in any
  diagnostic command afterward — only `${#STRIPE_SECRET_KEY}` (a length,
  107) was ever checked post-write.
- **`dev-db-override.ts` has no "arbitrary local Postgres" mode by design**
  (red-rules Rule 1) — a literal `localhost:5433` `POSTGRES_URI` is silently
  ignored unless real QNAP credentials are also present, at which point it
  connects to the real QNAP host regardless. `packages/dba/src/
  payments.test.ts` therefore loads real QNAP credentials the same way
  `tests/support/database/qnap-env.mjs` does for other QNAP-targeted tests
  (duplicated inline, since `packages/dba`'s own `tsconfig.json` `rootDir`
  can't import across into `tests/`), and is written to be safe to run
  against the real shared server (idempotent schema check, prefixed
  disposable ids, exact-id cleanup in `afterAll` — verified 0 leftover rows
  after the real run in this session).
- **Pre-existing Vitest/vite-oxc toolchain bug**, unrelated to this Story:
  ANY test file placed directly inside a leaf `packages/*` workspace
  package other than `dba`/`dashboard` fails to transform at all
  (`Invalid jsx option: automatic`), reproduced independently with a
  trivial probe test in both `packages/mcp` and `packages/google-contacts`
  before touching `packages/payments`. Worked around by placing the
  amount-validation/webhook unit tests under `packages/dba/src/` (their
  only real consumer) instead of `packages/payments/src/` — no production
  code was changed to work around this. Not investigated/fixed further —
  out of this Story's scope, but worth a future Story if more packages ever
  need their own colocated tests.
- **Dockerfile didn't build the new `payments` package** — the first local
  Docker rebuild failed on `dba`'s `tsc` (`Cannot find module 'payments'`)
  because `packages/dashboard/Dockerfile`'s explicit build-order `RUN`
  listed every workspace dependency of `dba` except the new one. Fixed by
  adding `pnpm --filter payments build` before `pnpm --filter dba build`.
- **Real bug found by the local Docker smoke test**: the global
  `middleware.ts` gated `/api/webhooks/stripe` behind a CHAD session cookie
  (like every other `/api/*` route), which would have made it permanently
  unreachable by real Stripe (Stripe never sends that cookie). Fixed by
  adding it to `publicRoutes` — see Task 7 in `05_tasks_and_checklist.md`.
  This is exactly the kind of gap the "must smoke test on the real running
  app, not just build/typecheck" rule exists to catch.
- **Playwright MCP tooling quirks observed in this session** (not app bugs):
  `browser_take_screenshot` consistently times out waiting for
  `fonts.googleapis.com` inside this sandboxed session (same root cause as
  the transient Docker-build font-fetch failure below); `browser_click`'s
  synthesized click occasionally failed to trigger a Next.js `<Link>`
  client-side navigation or a `next-themes` state update, while a raw
  `element.click()` dispatched via `browser_evaluate` worked reliably every
  time. Used the latter throughout the smoke test once this was noticed.
- **Transient Docker build failure** (`getaddrinfo EAI_AGAIN
  fonts.googleapis.com` during `next build`'s font-loading step) — resolved
  itself on a plain retry (`02_build.sh` alone); network-flakiness inside
  the Docker build context, unrelated to any code change.

## Known limitations / not executed this session

**Update (Input 5 continuation) — the real Sandbox E2E is now DONE, not
blocked.** Installed the Stripe CLI locally (bypassing a broken
`brew install` — outdated Xcode Command Line Tools blocked Homebrew's
formula install; used the official arm64 release tarball directly instead,
no system-wide install) and ran `stripe listen --forward-to
localhost:12020/api/webhooks/stripe`, which gives real webhook delivery to
a local dev server with no public URL. Paid a real 3.00 PLN Sandbox
Checkout Session with Stripe's `4242 4242 4242 4242` test card through a
real browser session — the success page reached "Payment successful", the
`cp_stripe_payments` row shows `status: completed` with real
`stripe_payment_intent_id`/`stripe_event_id`, and the full lifecycle is
visible in Dev Panel → Payments. See Task 13/19 in
`05_tasks_and_checklist.md` for the exact evidence. What remains genuinely
out of this session's reach:

- **A real webhook delivery to the eventual public
  `https://chad.biz.pl/api/webhooks/stripe` endpoint: NOT executed** —
  requires an actual PROD deploy and a webhook endpoint registered in the
  Stripe Dashboard, both explicitly out of scope for this task (§1.6: "Nie
  deployuj PROD bez zgody"). The exact same code path just proven live
  locally applies unchanged once that happens (Task 12).
- **Admin → Payments' rendered table, viewed as an actual admin user: NOT
  visually verified.** `test2` (used throughout this session) isn't an
  admin; `pawel_f` is the only real admin account, and logging in as a real
  named user without explicit permission wasn't done, even for a read-only
  page. The query logic (`getPaymentsForAdmin`) is proven correct against
  real data via `payments.test.ts`, and the route's auth gate is a verbatim
  copy of the already-audited `/api/admin/users` pattern — but the actual
  rendered admin view itself is inferred from these, not eyeballed.
- Both abandoned test Checkout Sessions from earlier in this session
  (`cs_test_a1OXPW...` at 12.34 PLN, `cs_test_a1WQ3B...`) remain real,
  intentionally-uncleaned `pending` rows in `cp_stripe_payments` — created
  before Stripe CLI forwarding existed, so they'll simply never complete
  (same as a real user closing the tab). Not synthetic test data, so not
  deleted.

## Follow-up proposals (not required by this Story)

- Once PROD is actually deployed to `chad.biz.pl` and a webhook endpoint is
  registered in the Stripe Dashboard (`whsec_...` added to `.env.qnap`),
  repeat the same real-card E2E already proven locally, against the public
  endpoint, once.
- Have `pawel_f` (or another real admin) personally open Admin → Payments
  once to visually confirm the rendered table — the query/auth logic is
  already proven, only the pixels weren't eyeballed by a real admin
  session.
- Consider fixing the pre-existing vite-oxc transform issue for leaf
  `packages/*` test files (affects `packages/mcp` too, not just this
  Story) so future packages don't need the same workaround.
- Consider rotating the local-mac-docker Postgres password and the
  `GOOGLE_CONTACTS_CLIENT_SECRET`, both partially exposed in this session's
  tool output (see above) — low real-world risk (local dev only), but
  cheap to rotate.
- For future local Stripe webhook testing, the Stripe CLI binary is left in
  this session's scratchpad only (not installed system-wide, not committed)
  — a future session/developer wanting the same local E2E flow will need to
  either re-download it or `brew install stripe/stripe-cli/stripe` once
  Xcode Command Line Tools are updated.
