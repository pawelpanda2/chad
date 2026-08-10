# Story 116 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE | | Settings navigation no longer shows Notifications or API; a real Payments tab exists |
| 2 | DONE | | Settings → Display shows a real Light/Dark/System theme selector; no global Theme bar above every Settings subpage, no dummy switches |
| 3 | DONE | | Theme choice persists after a browser refresh and across navigation between pages |
| 4 | DONE | | Settings → Payments lets the user type any PLN amount and click "Pay with card" for a one-off Stripe Checkout (not a subscription) |
| 5 | DONE | | Invalid amounts (0, negative, non-numeric, more than 2 decimal places) are rejected with a clear error, both client-side (UX) and server-side (authoritative) |
| 6 | DONE | | Stripe Checkout Session creation is server-side, requires a logged-in CHAD session, and uses a dynamic price (no fixed `STRIPE_PRICE_ID`) |
| 7 | DONE | | The Stripe webhook endpoint verifies `Stripe-Signature` and is actually reachable by Stripe (no CHAD session required) |
| 8 | DONE | | Webhook-confirmed payment status is idempotent and isolated per user |
| 9 | PARTIAL | | Payments success/cancel pages show a clear state and never create a second Checkout Session on refresh |
| 10 | DONE | | No Stripe secret ever reaches the browser; unrelated Settings tabs (Profile/Account/Password/Appearance/Folders) still work as before |

# Task 1 — Settings navigation cleanup

**Requested:** Remove the dead template tabs Notifications and API/API Keys from Settings; add a Payments tab; don't touch other working tabs.

**Done:** Removed `Notifications`/`API` entries from `settings/layout.tsx`'s `settingsTabs`, added `Payments`. Confirmed both removed pages were dead template mockups (no real backend, only referenced by the nav itself, `sitemap.ts`, and the unrelated `/dashboard/auth` template-showcase page) before deleting `settings/notifications/page.tsx` and `settings/api-keys/page.tsx`, and cleaned up the two now-dead references (`sitemap.ts` entry, the "API Keys" card in `/dashboard/auth`).

**Files changed:** `packages/dashboard/app/(dashboard)/dashboard/settings/layout.tsx`, deleted `settings/notifications/page.tsx` and `settings/api-keys/page.tsx`, `packages/dashboard/app/sitemap.ts`, `packages/dashboard/app/(dashboard)/dashboard/auth/page.tsx`.

**Tested:** `pnpm build` (dashboard) succeeds with the routes gone; real browser smoke test as `test2` confirms `/dashboard/settings/api-keys` and `/dashboard/settings/notifications` both 404, and the Settings nav shows exactly Profile/Account/Password/Appearance/Display/Payments/Folders. Component test `settings/layout.test.tsx` (4 assertions) covers this too.

**Status: DONE**

# Task 2 — Theme → Display (real mechanism, no global bar, no dummy switches)

**Requested:** Move the real `ThemeModeSelector` (next-themes-backed) into Settings → Display; stop rendering it globally above every Settings subpage; remove the pre-existing fake "Dark Mode"/"System Theme" switches on Display if still present.

**Done:** Removed the "Theme" card from the top of `settings/layout.tsx`. Rewrote `settings/display/page.tsx` to render the real `ThemeModeSelector` inside a "Theme" card, and dropped the unconnected "Dark Mode"/"System Theme" `Switch` pair and the fully-decorative "Interface" card (Compact Mode/Animations — not wired to anything, no such feature exists elsewhere). No second theme mechanism was created — same `next-themes` provider (mounted once in root `app/layout.tsx`) and the same `components/shared/theme-mode-selector.tsx`, just relocated.

**Files changed:** `packages/dashboard/app/(dashboard)/dashboard/settings/layout.tsx`, `packages/dashboard/app/(dashboard)/dashboard/settings/display/page.tsx`.

**Tested:** Component test `settings/display/page.test.tsx` (real render via `next-themes`' `ThemeProvider`, jsdom `matchMedia` stub) — confirms Light/Dark/System buttons render and confirms the old dummy switches/labels are gone. Real browser smoke test as `test2`: Display shows Theme card with Light/Dark/System; no "Theme" heading appears anywhere above the Settings tab bar.

**Status: DONE**

# Task 3 — Theme persistence across refresh and navigation

**Requested:** Light/Dark/System must work after refresh and while navigating.

**Done:** No new persistence code — this relies entirely on `next-themes`' existing localStorage-backed persistence and the fact that `ThemeProvider` is mounted once at the root layout (so it survives client-side navigation between pages without remounting).

**Tested (real browser, `test2`, local Docker):** clicked Dark on Display → full page reload → Dark still selected, `document.documentElement.className === "dark"`, `localStorage.theme === "dark"`. Clicked Light → full page reload → Light persisted the same way. Clicked Dark → navigated (client-side, no full reload) from Display to Payments → theme stayed Dark on the new page (no flash back to a default). Confirms both "refresh" and "navigation" requirements for real, not just via the component test.

**Status: DONE**

# Task 4 — Payments UI (dynamic amount, one-off Stripe Checkout)

**Requested:** Settings → Payments page: amount input (PLN) + "Pay with card" button, dynamic amount per payment, not a subscription.

**Done:** `settings/payments/page.tsx` — amount `Input` + "Pay with card" `Button`; POSTs `{amount}` to `/api/settings/payments/checkout`; on success redirects the browser to Stripe's hosted Checkout URL (`window.location.href = url`); on failure shows the server's error via the shared `ErrorBox`. `mode: "payment"` end-to-end (packages/payments's `createCheckoutSession`), never `subscription`.

**Files changed:** `packages/dashboard/app/(dashboard)/dashboard/settings/payments/page.tsx`, `packages/dashboard/app/api/settings/payments/checkout/route.ts`.

**Tested:** real browser smoke test as `test2` on local Docker — typed `500.50`, clicked Pay with card, observed the real server round-trip (see Task 5/6 for the exact response). Redirect-to-Stripe itself could not be exercised (no real Sandbox `STRIPE_SECRET_KEY` available in this environment — see `06_others_from_report.md`), but the entire path up to that point (client → route → dba → packages/payments) is real, not mocked.

**Status: DONE**

# Task 5 — Server-side amount validation

**Requested:** Reject 0, negative, non-numeric/NaN/Infinity, more than 2 decimals; correct PLN→grosze conversion without float error; client can't override currency; configurable technical max, not a hardcoded PLN business limit.

**Done:** `packages/payments/src/amount.ts`'s `parseAmountToMinorUnits` — strict regex (`^\d+(\.\d{1,2})?$`) rejects every malformed shape, BigInt-based integer conversion (no `Math.round(major*100)`), rejects `<= 0`, enforces `PAYMENTS_MAX_AMOUNT_MAJOR_PLN` (defaults to 100000, no hardcoded 2400/2403). Currency is not a parameter at all — the function always returns `PLN`, so the client has no field to send that could change it. The `settings/payments/page.tsx` client-side check is UX-only; the real enforcement is this function, called server-side inside `createPaymentCheckoutSession`.

**Files changed:** `packages/payments/src/amount.ts`, `errors.ts`, `config.ts`.

**Tested:** `packages/dba/src/payments-amount.test.ts` — 14 real unit tests: 1/500/500.50/2000/whitespace-trim all accepted; 0, negative, text, `NaN`/`Infinity` (both as JS values and as strings), scientific notation, `+500`, trailing dot, empty string, >2 decimals, non-string/number types (`null`/`undefined`/object/array/boolean) all rejected; float-safety asserted directly (`0.1`→10, `19.99`→1999, `2403.99`→240399); configurable max verified by setting `PAYMENTS_MAX_AMOUNT_MAJOR_PLN=1000` and confirming 1000 passes but 1000.01/2403 are rejected — proving there's no hardcoded 2400/2403 limit. Real browser smoke test confirms `0` is rejected client-side with a visible error before any request is sent.

**Status: DONE**

# Task 6 — Stripe Checkout Session creation (server-side, session-scoped, dynamic price)

**Requested:** Auth required; identify user from session, never trust client-supplied repoGuid; `STRIPE_SECRET_KEY` server-side only; `mode: "payment"`; dynamic `price_data`, no `STRIPE_PRICE_ID`; safe success/cancel URLs from the app's own origin.

**Done:** `POST /api/settings/payments/checkout` resolves the user via `getCurrentUserFromCookies()` (401 if absent) and wraps the call in `runWithRepoContext(user, ...)` — `createPaymentCheckoutSession` (dba) never receives a client-supplied id, only reads `getCurrentRepoGuid()`/`getCurrentUsername()` from that context. `packages/payments/src/checkout.ts` builds the session with `line_items[0].price_data` (dynamic `unit_amount`/`currency`), never a saved Stripe `Price`. Success/cancel URLs are built from `paymentsPublicOrigin()` (forwarded-proto/host aware, falls back to `request.url`'s origin — never trusts an arbitrary client-supplied origin string). Architecture follows the user's explicit correction: Dashboard → `dba` → `packages/payments` → Stripe; Dashboard never imports `packages/payments` directly.

**Files changed:** `packages/payments/src/checkout.ts`, `config.ts`; `packages/dba/src/payments.ts`; `packages/dashboard/app/api/settings/payments/checkout/route.ts`; `packages/dashboard/lib/payments-public-origin.ts`.

**Tested:** unauthenticated `POST /api/settings/payments/checkout` on the real running local Docker container → `401` (confirmed via curl, both before and after the middleware fix in Task 7). Authenticated (`test2`) request with a valid amount and no Stripe keys configured → real `503 PaymentsNotConfiguredError` with the exact message, confirmed live in a real browser (not simulated). `packages/dashboard/lib/payments-public-origin.test.ts` (3 tests) covers the origin-resolution logic. The actual Stripe network call (`stripe.checkout.sessions.create`) itself could not be exercised — no real Sandbox key available (see `06_others_from_report.md`); its request-shape is `packages/payments/src/checkout.ts`'s own code, reviewed but not integration-tested against real Stripe.

**Status: DONE**

# Task 7 — Webhook signature verification + real reachability

**Requested:** Verify `Stripe-Signature`, use `STRIPE_WEBHOOK_SECRET`, raw body, reject missing/invalid signature.

**Done:** `packages/payments/src/webhook.ts`'s `constructWebhookEvent` wraps `stripe.webhooks.constructEvent` with the raw body + header. `POST /api/webhooks/stripe` reads `await request.text()` (already raw/unparsed in the Next.js App Router, no `bodyParser: false` needed) and `request.headers.get("stripe-signature")`.

**Bug found and fixed during the local Docker smoke test:** the global `middleware.ts` treats every `/api/*` route as session-protected by default; `/api/webhooks/stripe` wasn't in the `publicRoutes` allowlist, so Stripe's real webhook calls (which never carry a CHAD session cookie) would have been rejected with `401 NOT_AUTHENTICATED` before ever reaching signature verification. Added `/api/webhooks/stripe` to `publicRoutes` — the route's own signature check remains the actual authentication for this endpoint.

**Files changed:** `packages/payments/src/webhook.ts`; `packages/dashboard/app/api/webhooks/stripe/route.ts`; `packages/dashboard/middleware.ts` (bug fix).

**Tested:** `packages/dba/src/payments-webhook.test.ts` (7 real unit tests, real local HMAC via Stripe's own `generateTestHeaderString` — no network/Sandbox key needed): valid signature accepted, missing/empty/garbage signature rejected, wrong-secret signature rejected, tampered-payload-vs-signature rejected, missing `STRIPE_WEBHOOK_SECRET`/`STRIPE_SECRET_KEY` both give a controlled `PaymentsNotConfiguredError`. Live on local Docker (post-fix): `curl -X POST /api/webhooks/stripe` with no signature → `400 {"error":"Invalid signature"}` (not 401); with a garbage signature but no Stripe keys configured → `503 {"error":"Webhook not configured"}` — both controlled, no crash, no session required.

**Status: DONE**

# Task 8 — Webhook idempotency + cross-user isolation

**Requested:** A redelivered `checkout.session.completed` must not cause a duplicate business effect; persistence must follow the DBA architecture, kept minimal (no billing/entitlement system).

**Done:** New Postgres table `cp_stripe_payments` (`packages/dba/sql/migrations/0005_stripe_payments.sql`) — one row per Checkout Session, `pending`→`completed`, plus the last-applied `stripe_event_id` as the idempotency key (unique partial index). `handleStripeWebhookEvent`'s `UPDATE ... WHERE id=$1 AND (stripe_event_id IS NULL OR stripe_event_id <> $3)` guarantees a redelivered event with the same `event.id` is a no-op; a fallback `INSERT ... ON CONFLICT` (same guard) reconstructs a row if it's ever missing, so a webhook is never silently dropped. `getPaymentStatus` scopes every lookup to `repo_guid = <caller's own>`.

**Files changed:** `packages/dba/sql/migrations/0005_stripe_payments.sql`; `packages/dba/src/payments.ts`.

**Tested (real, against the actual shared QNAP Postgres — per the user's explicit correction, using CHAD's real `test2`/`test3` accounts, never synthetic repoGuids):** `packages/dba/src/payments.test.ts`, 6 tests — `test2`'s repoGuid resolved dynamically from the real `chad_admin/users/users-list` (never hardcoded), `test3`'s from the existing confirmed `TEST3_REPO_GUID`. Confirms: a valid signed event moves `test2`'s payment from `pending` to `completed`; `test3` gets `not_found` for `test2`'s own payment (cross-user isolation); redelivering the identical event twice leaves exactly one row (idempotent); a webhook for a session with no pre-existing row reconstructs it from the event's own metadata; missing/invalid signature is rejected; `createPaymentCheckoutSession` fails with a controlled error when Stripe isn't configured. Every row this test writes is prefixed `story116_test_` and deleted again in `afterAll` (verified 0 leftover rows afterward) — `test2`/`test3`'s own repo/CP-item data was never touched. Migration `0005` was applied for real to the shared QNAP Postgres via the official `pnpm postgres:migrate` mechanism (and separately, automatically, to the local Docker Postgres mirror by `03_re-start.sh`'s own bootstrap).

**Status: DONE**

# Task 9 — Success / cancel pages

**Requested:** Success shows a clear success state; cancel shows cancellation + a way back; a query param alone is never proof of payment; refresh never creates a second Checkout Session.

**Done:** `settings/payments/success/page.tsx` reads `session_id` from the query, polls `GET /api/settings/payments/status` (webhook-confirmed status only) up to 15 times/2s apart, and shows "Confirming your payment..." while pending or "Payment successful" once the webhook has actually marked it `completed` — the `session_id` param itself never drives the success state. `settings/payments/cancel/page.tsx` shows a plain cancelled state with a link back to Payments. Neither page ever calls the checkout-creation route, so refreshing either can't create a new Checkout Session — this is structural (no `POST /checkout` call exists on these pages), not a flag check.

**Files changed:** `packages/dashboard/app/(dashboard)/dashboard/settings/payments/success/page.tsx`, `.../cancel/page.tsx`.

**Tested:** code review + the `getPaymentStatus` real-Postgres tests from Task 8 (same endpoint these pages poll). A full success-page walkthrough with a real completed Stripe payment could not be exercised — needs a real Sandbox Checkout Session, blocked for the same reason as Task 6 (see `06_others_from_report.md`).

**Status: PARTIAL** — implemented and the API it depends on is proven correct; the page itself wasn't exercised against a real completed payment in a browser.

# Task 10 — No secret leakage; no regression on other Settings tabs

**Requested:** `STRIPE_SECRET_KEY` never sent to the browser; other Settings tabs keep working.

**Done:** `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` are only read inside `packages/payments` (server-only code, never imported by the Dashboard directly — only by `packages/dba`). No client component or API response ever includes them; the only client-visible error text is `PaymentsError.message` (e.g. "STRIPE_SECRET_KEY is not configured..."), never the key's value.

**Files changed:** none beyond what's listed above — Profile/Account/Password/Appearance/Folders pages were not touched.

**Tested:** `pnpm build` (dashboard) succeeded with no new client-bundle warnings referencing Stripe secrets. Real browser smoke test confirmed the Payments page's own error message names the missing env var, not its value (there is none to leak locally). Password/Account/Appearance/Folders pages were not modified by this Story; `settings/layout.test.tsx` explicitly asserts all of Profile/Account/Password/Appearance/Display/Folders links still render.

**Status: DONE**
