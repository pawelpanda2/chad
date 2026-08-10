# Story 116 — Plan

## Starting point

- HEAD at start of this Story: `bf37a5f` (fix(folders): ZIP import into
  chad_shared failed with wrong-repo error; open chad_shared to every user).
- Working tree already had substantial unrelated uncommitted changes
  (Knowledge v2, folders, DBA refactors — not this Story's work). Treated as
  parallel/in-progress work per the safety rules: left untouched, not
  committed, not overwritten. This Story's own changes are staged/committed
  separately, file-by-file, never via a blanket `git add -A`.

## Settings navigation cleanup

- Remove `Notifications` and `API` tabs from
  `settings/layout.tsx`'s `settingsTabs` array.
- Confirmed dead-mockup-only: `notifications/page.tsx` (no references beyond
  its own route + nav) and `api-keys/page.tsx` (referenced only by
  `sitemap.ts` and the template's own `/dashboard/auth` demo-links page,
  itself an unrelated dummy showcase of template auth pages — not real
  CHAD auth). Delete both page files; remove the two dead references
  (sitemap entry, `auth/page.tsx`'s "API Keys" card).
- Add `Payments` tab pointing at `/dashboard/settings/payments`.
- Leave `Profile`, `Account`, `Password`, `Appearance`, `Folders`
  (`read-only-folders`) untouched — out of scope, some already dummy
  (`Account`, `Appearance`) but not requested.

## Theme → Display

- `ThemeModeSelector` (`components/shared/theme-mode-selector.tsx`) already
  the real, working mechanism (`next-themes`, persisted via its own
  localStorage + `attribute="class"`, provider mounted once in root
  `app/layout.tsx`). No second mechanism needed.
- Remove the "Theme" card currently rendered at the top of
  `settings/layout.tsx` (above every Settings subpage).
- Rewrite `settings/display/page.tsx`: replace the fake "Dark Mode"/"System
  Theme" `Switch` pair (unconnected to `next-themes`) with the real
  `ThemeModeSelector`. Drop the fully-decorative "Interface" card (Compact
  Mode / Animations toggles — not wired to anything, no such feature exists
  elsewhere in the app; keeping non-functional switches would be worse than
  removing them, and building a real compact-mode feature is out of scope).

## Payments — architecture (per Input 2's correction)

```
Dashboard (thin UI + API routes)
      ↓
  packages/dba          — session/repo context, calls payments package
      ↓
packages/payments        — Stripe SDK wrapper: amount validation,
                            Checkout Session creation, webhook verification
      ↓
     Stripe
```

Dashboard never imports `packages/payments` directly (unlike the existing
`google-contacts` route, which does import that package directly for a
stateless OAuth URL build — that precedent is NOT followed here; Input 2
explicitly overrides it for Payments).

### `packages/payments` (new, mirrors `packages/google-contacts` package
shape: plain TS lib, `tsc` build, no UI/HTTP server, `workspace:*` dependency
of `dba` only)

- `config.ts` — lazy env read (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  optional `PAYMENTS_MAX_AMOUNT_MAJOR_PLN`), `PaymentsNotConfiguredError`
  when secret key/webhook secret missing — never throws at import time
  (mirrors `mongo.ts`/`postgres.ts`'s lazy-env convention, needed because
  Next.js collects page data before docker-compose injects runtime env).
- `amount.ts` — `parseAmountToMinorUnits(input, currency)`: string-based
  parsing (no float multiplication) to avoid float error, rejects
  non-numeric/NaN/Infinity/negative/zero/>2 decimals, enforces the
  configurable technical max (no hardcoded PLN limit — reads
  `PAYMENTS_MAX_AMOUNT_MAJOR_PLN`, sane built-in default only as fallback).
- `checkout.ts` — `createCheckoutSession()` wrapping `stripe.checkout.
  sessions.create` with `mode: "payment"` and `line_items[0].price_data`
  (dynamic price, no persistent `Price` object, no `STRIPE_PRICE_ID`).
- `webhook.ts` — `constructWebhookEvent(rawBody, signature)` wrapping
  `stripe.webhooks.constructEvent` (raw body + `STRIPE_WEBHOOK_SECRET`).
- Currency fixed to `PLN` server-side inside this package — never taken from
  the caller/browser.

### `packages/dba/src/payments.ts` (new)

- `createPaymentCheckoutSession(user: {repoGuid, username}, amountInput,
  originUrl)` — validates amount via `packages/payments`, persists a
  `pending` row (see migration below) keyed by the Checkout Session id,
  calls `packages/payments`'s `createCheckoutSession` with
  `client_reference_id=repoGuid`, metadata `{repoGuid, username}`, and
  success/cancel URLs built from `originUrl` (never trusts a caller-supplied
  origin beyond what the route derives from the request).
- `handleStripeWebhookEvent(rawBody, signature)` — verifies via `packages/
  payments`, on `checkout.session.completed` idempotently marks the stored
  row `completed` (`UPDATE ... WHERE id=$session_id AND stripe_event_id IS
  DISTINCT FROM $event_id`, `ON CONFLICT` upsert fallback if the row is
  somehow missing) — replay-safe, no duplicate business effect.
- `getPaymentStatus(user, sessionId)` — reads the stored row scoped to
  `repo_guid = user.repoGuid` (cross-user isolation), returns
  pending/completed/not_found. Success page polls this — the `session_id`
  query param itself is never treated as proof of payment.
- New Postgres table `cp_stripe_payments` via
  `packages/dba/sql/migrations/0005_stripe_payments.sql` (same convention as
  `cp_lead_archives`/`cp_referenced_files` — this Story's persistence need
  is exactly "avoid double business effect on webhook replay", nothing more;
  no entitlement/billing system).

### Dashboard (thin adapters only)

- `POST /api/settings/payments/checkout` — resolves user via
  `getCurrentUserFromCookies()` (401 if absent), reads `{amount}` from body,
  calls `dba.createPaymentCheckoutSession`, returns `{url}`.
- `POST /api/webhooks/stripe` — raw body (Next.js route config to disable
  body parsing/re-serialize exactly), reads `Stripe-Signature` header, calls
  `dba.handleStripeWebhookEvent`, returns 200/400. No session required (this
  is Stripe calling CHAD, not a user).
- `GET /api/settings/payments/status?sessionId=` — resolves user, calls
  `dba.getPaymentStatus`.
- `settings/payments/page.tsx` — amount input (PLN) + "Pay with card"
  button; client-side sanity checks for UX only; POSTs to checkout route,
  redirects `window.location.href = url`.
- `settings/payments/success/page.tsx` — reads `session_id` from query,
  polls the status route a few times, shows a clear success/"confirming"
  state; link back to Payments. Refresh never re-creates a session (this
  page never calls the checkout route).
- `settings/payments/cancel/page.tsx` — cancelled state + link back.

### Config

- `.env.local.example` / `.env.qnap.example`: add commented, empty
  `STRIPE_SECRET_KEY=` / `STRIPE_WEBHOOK_SECRET=` placeholders (mirroring
  the existing `GOOGLE_CONTACTS_*` block) — no real values, ever.
- `docker-compose.local.yml` (+ qnap test/prod, for parity — not deployed):
  pass `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` through to the
  `dashboard` service with `${VAR:-}` defaults, same pattern as
  `GOOGLE_CONTACTS_*`.

## Tests

- `packages/payments/src/amount.test.ts` — unit tests for every validation
  rule in 1.5/1.13 (valid amounts, 0, negative, text/NaN/Infinity, >2
  decimals, float-safe PLN→grosze conversion, max-limit rejection).
- `packages/dba/src/payments.test.ts` — webhook signature rejection
  (missing/invalid), idempotent replay of `checkout.session.completed`,
  cross-user isolation on `getPaymentStatus`, no-Stripe-config → controlled
  error not a crash. Stripe network calls mocked (no real Sandbox keys
  available in this environment) — real Stripe Sandbox E2E is explicitly
  out of reach this session, reported as such per §2.13/§1.10, not claimed
  as PASS.
- Settings nav test: no `Notifications`/`API` links, `Payments` present.
- No existing regression suite covers Settings/Theme/Payments — no
  `pnpm test:tables-sync` etc. required (this Story doesn't touch tables/
  history/Google Sheets/folders); still run `pnpm typecheck`/relevant
  package builds before commit.

## Docker / smoke

- Rebuild via `bash-scripts/dashboard/03_local_mac_docker/` official
  scripts, restart, status, healthcheck, then a real smoke test of
  Display (theme switch + refresh) and Payments (amount validation errors
  visible in UI; Checkout Session creation attempted — real Stripe redirect
  blocked without real Sandbox keys, documented as such, not faked).
