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
- **Two accidental partial secret exposures, both flagged to the user
  immediately in-session.** (1) While checking `.env.local` for the
  local-mac-docker Postgres connection convention, one `grep`/`sed`
  redaction pattern missed a line and the real local-mac-docker Postgres
  password (not the shared QNAP one) appeared once in a tool output. (2) A
  later broader `grep -n "^GOOGLE_CONTACTS"` (intended to just locate a
  section header) matched full lines and printed the real
  `GOOGLE_CONTACTS_CLIENT_SECRET` value too. Neither was repeated, and the
  user was told to consider rotating both. From that point on, every
  `.env.local`/`.env.qnap` interaction in this session was either pure
  append (no read at all) or a `grep`/output pattern that redacts the value
  before it can ever reach a visible tool result (e.g. `sed -E
  's/(KEY)=.*/\1=[SET]/'`, or checking only `${#VAR}` length inside the
  container). The one unavoidable exception: Input 3's own real Stripe key
  had to appear once, literally, in the single command that wrote it to
  `.env.local` — there is no way to place a value into a file via a tool
  call without that value appearing in the call itself, and the user had
  already put the same value in their own message. It was never repeated,
  echoed, or included in any diagnostic command afterward — only
  `${#STRIPE_SECRET_KEY}` (a length, 107) was ever checked post-write.
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

**Update (Input 3):** a real Stripe Sandbox `STRIPE_SECRET_KEY` was supplied
and configured in local Docker — Checkout Session creation (client →
validation → dba → packages/payments → real Stripe API → real
`checkout.stripe.com` URL → `cp_stripe_payments` row on the real shared
Postgres → status endpoint) is now verified live end-to-end, not just unit
tested. What remains genuinely not executed:

- **Actually completing a payment on Stripe's hosted Checkout page (a real
  test card, e.g. `4242 4242 4242 4242`) and a real webhook delivery from
  Stripe itself: NOT executed.** No `STRIPE_WEBHOOK_SECRET` exists yet (it
  only comes from registering a real, publicly-reachable endpoint in the
  Stripe Dashboard — not possible without a public URL, and PROD wasn't
  deployed per the explicit instruction not to). Webhook signature
  verification/idempotency logic itself is fully proven real (Stripe's own
  local test-signing helper, real Postgres) — only the "Stripe's servers
  actually calling our endpoint over the internet" leg is untested.
- Settings → Payments success page's actual UI after a real completed
  payment was not visually verified (depends on the above).
- The 12.34 PLN test Checkout Session created live in this session
  (`cs_test_a1OXPW...`) was intentionally left as a real, abandoned
  `pending` row in `cp_stripe_payments` — it will simply never be completed
  (same as any real user closing the tab), not cleaned up, since it's a
  genuine product interaction rather than synthetic test data.

## Follow-up proposals (not required by this Story)

- Once PROD is actually deployed to `chad.biz.pl` and a webhook endpoint is
  registered in the Stripe Dashboard (`whsec_...` added to `.env.qnap`), run
  a full manual E2E: Settings → Payments → enter an amount → Stripe test
  card (e.g. `4242 4242 4242 4242`) → success page shows "Payment
  successful" after the real webhook lands → `cp_stripe_payments` row is
  `completed`.
- Consider fixing the pre-existing vite-oxc transform issue for leaf
  `packages/*` test files (affects `packages/mcp` too, not just this
  Story) so future packages don't need the same workaround.
- Consider rotating the local-mac-docker Postgres password and the
  `GOOGLE_CONTACTS_CLIENT_SECRET`, both partially exposed in this session's
  tool output (see above) — low real-world risk (local dev only), but
  cheap to rotate.
