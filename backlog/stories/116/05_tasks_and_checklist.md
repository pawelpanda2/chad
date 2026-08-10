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
| 9 | DONE | | Payments success/cancel pages show a clear state and never create a second Checkout Session on refresh |
| 10 | DONE | | No Stripe secret ever reaches the browser; unrelated Settings tabs (Profile/Account/Password/Appearance/Folders) still work as before |
| 11 | DONE | | With a real Stripe Sandbox `STRIPE_SECRET_KEY` configured in local Docker, Pay with card creates a real Stripe Checkout Session end-to-end |
| 12 | DONE | | PROD env/docker config is prepared so the webhook works at `https://chad.biz.pl/api/webhooks/stripe` once deployed and a `STRIPE_WEBHOOK_SECRET` is added — without deploying PROD or going LIVE now |
| 13 | DONE | | Root cause of the "spinner never resolves" report is identified with concrete evidence (real Stripe Session/PaymentIntent status), not assumed |
| 14 | DONE | | The success page never spins forever: it reaches an explicit terminal state, and once a payment is confirmed it auto-returns to Settings → Payments instead of showing a redundant "Back to Payments" button |
| 15 | DONE | | Dev Panel → Payments shows the sanitized Checkout/webhook lifecycle log (no card data/secrets), and it survives a page refresh |
| 16 | DONE | | The old direct "Users" sidebar item is replaced by a single "Admin" entry under "Others" that opens a Msg-Auto-style hub with Users/Payments buttons |
| 17 | DONE | | Admin → Payments shows a real, admin-gated, read-only transaction list across all users, with test/live and environment shown per real Stripe/CHAD data |
| 18 | DONE | | Settings → Payments shows the current user's own previous successful payments, with no extra marketing-style description text |
| 19 | DONE | | A real Stripe Sandbox payment, paid with the `4242...` test card through local webhook forwarding, actually completes end-to-end and shows as confirmed in CHAD |
| 20 | DONE | | Settings tabs: Account first, Payments second, Users added; old Account duplicate removed; tabs above frame; no Payments H3 duplicate |
| 21 | DONE | | Settings → Users session switch (admin-only, server-side cookie reissue); Admin → Users real role grant/revoke via DBA |
| 22 | DONE | | Admin → Payments user filter (DBA `repoGuid`); helper blurb removed |
| 23 | DONE | | TEST webhook `https://test.chad.biz.pl/api/webhooks/stripe` delivers; TEST deploy + PROD promote of `11c7f00` |

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

**Tested:** real browser smoke test as `test2` on local Docker — typed `500.50`, clicked Pay with card, observed the real server round-trip (see Task 5/6 for the exact response). At the time this task was first written, redirect-to-Stripe itself hadn't been exercised (no Sandbox key yet). **Update (Input 3/6):** with a real key, this redirect now happens for real — see Task 11/19.

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

**Tested:** unauthenticated `POST /api/settings/payments/checkout` on the real running local Docker container → `401` (confirmed via curl, both before and after the middleware fix in Task 7). Authenticated (`test2`) request with a valid amount and no Stripe keys configured → real `503 PaymentsNotConfiguredError` with the exact message, confirmed live in a real browser (not simulated). `packages/dashboard/lib/payments-public-origin.test.ts` (3 tests) covers the origin-resolution logic. **Update (Input 3/6):** the actual Stripe network call now IS integration-tested for real — see Task 11 (session creation) and Task 19 (full paid-and-confirmed E2E).

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

**Done:** `settings/payments/success/page.tsx` reads `session_id` from the query, polls `GET /api/settings/payments/status` (webhook-confirmed status only) up to 15 times/2s apart, and shows "Confirming your payment..." while pending or "Payment successful" once the webhook has actually marked it `completed` — the `session_id` param itself never drives the success state. `settings/payments/cancel/page.tsx` shows a plain cancelled state. Neither page ever calls the checkout-creation route, so refreshing either can't create a new Checkout Session — this is structural (no `POST /checkout` call exists on these pages), not a flag check. **Superseded by Task 14** (Input 6/7 continuation): the polling terminal-state fix and the "Back to Payments" button removal/auto-redirect are covered there, along with real end-to-end proof (Task 19).

**Files changed:** `packages/dashboard/app/(dashboard)/dashboard/settings/payments/success/page.tsx`, `.../cancel/page.tsx`.

**Tested:** see Task 14/19 — a full success-page walkthrough with a real completed Stripe payment (Sandbox test card, local webhook forwarding) was exercised live in this same Story's continuation.

**Status: DONE** (was PARTIAL when first written — see Task 14/19 for the completed verification).

# Task 10 — No secret leakage; no regression on other Settings tabs

**Requested:** `STRIPE_SECRET_KEY` never sent to the browser; other Settings tabs keep working.

**Done:** `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` are only read inside `packages/payments` (server-only code, never imported by the Dashboard directly — only by `packages/dba`). No client component or API response ever includes them; the only client-visible error text is `PaymentsError.message` (e.g. "STRIPE_SECRET_KEY is not configured..."), never the key's value.

**Files changed:** none beyond what's listed above — Profile/Account/Password/Appearance/Folders pages were not touched.

**Tested:** `pnpm build` (dashboard) succeeded with no new client-bundle warnings referencing Stripe secrets. Real browser smoke test confirmed the Payments page's own error message names the missing env var, not its value (there is none to leak locally). Password/Account/Appearance/Folders pages were not modified by this Story; `settings/layout.test.tsx` explicitly asserts all of Profile/Account/Password/Appearance/Display/Folders links still render.

**Status: DONE**

# Task 11 — Real Stripe Sandbox key, end-to-end Checkout Session creation

**Requested (Input 3):** place the user-supplied real Stripe test secret key in the real local env used by local Mac Docker (never in `.example`/docs/Story/logs/Git); confirm docker-compose actually passes `STRIPE_SECRET_KEY` to the right container; restart/rebuild via the official CHAD scripts and verify Checkout.

**Done:** appended `STRIPE_SECRET_KEY=sk_test_...` to `.env.local` (append-only, value never echoed back in any later command). Confirmed `docker-compose.local.yml`'s `dashboard:` service already passes it through (`STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY:-}`, wired in the original Story 116 work). Restarted via the official `03_re-start.sh` (`--env-file .env.local`, per `01_config.sh` — no rebuild needed for an env-only change). Verified inside the running container (`docker exec ... printenv`-equivalent length check only, never the value) that the key actually reached the process.

Logged in as `test2` (real credentials from `.env.local`'s `E2E_LOGIN_PASSWORD`, never printed) and called `POST /api/settings/payments/checkout` for real: a 12.34 PLN amount produced a genuine `https://checkout.stripe.com/c/pay/cs_test_...` URL, and the corresponding `cp_stripe_payments` row (`status: pending`, `amount_minor: 1234`, `currency: PLN`, correct `repo_guid`) appeared on the real shared QNAP Postgres — the entire path (validation → dba → packages/payments → real Stripe API → DB write → status endpoint) is now proven live, not just unit-tested.

**Bug found and fixed via this live test:** an amount below Stripe's own per-currency minimum charge (e.g. 1 PLN — Stripe requires ≥ ~2.00 PLN) was previously an unhandled `500 "Failed to start checkout"`. `packages/payments/src/checkout.ts` now catches `Stripe.errors.StripeInvalidRequestError` for this specific case (`code === "amount_too_small"` or the `unit_amount` param) and raises the existing `InvalidAmountError`, so it surfaces as a controlled `400 invalid_amount` with a clear message instead — re-verified live after the fix (amount=1 → 400; amount=12.34 → real session again).

**Files changed:** `.env.local` (real secret, gitignored, never committed); `packages/payments/src/checkout.ts` (bug fix).

**Tested:** live against the real running local Docker container + real Stripe Sandbox API, as described above. Full existing automated suite (31 tests) re-run and still green after the fix.

**Status: DONE**

# Task 12 — Prepare (not deploy) the public webhook for `https://chad.biz.pl/api/webhooks/stripe`

**Requested (Input 3):** the webhook must, once deployed: work without a CHAD session, accept POST from Stripe, verify `Stripe-Signature`, use `STRIPE_WEBHOOK_SECRET` server-side only, use the raw body, stay idempotent, handle `checkout.session.completed`, and never treat the success URL alone as proof of payment. Explicitly: do not deploy PROD and do not configure LIVE Stripe now — only prepare code/env/docker so a future deploy only needs the Stripe Dashboard endpoint + `whsec_...`.

**Done:** the webhook route itself already satisfied every one of these bullets from the original Story 116 work (see Task 7/8/9 above) — `pathname`-based route matching in `middleware.ts` means the same public exemption applies on any domain (`chad.biz.pl`, `test.chad.biz.pl`, `localhost`), so no domain-specific code was needed. Checked `human-docs/dashboard/common/features/nginx-proxy-manager-domains.md`/`chad-domain-ssl.md` — `chad.biz.pl` is a plain full-passthrough reverse proxy to the PROD container (no path-based allow/block rules), so nothing there needs changing either.

What was actually missing was PROD **configuration surface**, not app code: `docker-compose.qnap.prod.yml`'s `dashboard` service had no `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` passthrough at all (Story 116 originally wired only `docker-compose.local.yml`, matching the `google-contacts` precedent of local-only). Added the same `${VAR:-}` passthrough to the PROD compose file, and empty `STRIPE_SECRET_KEY=`/`STRIPE_WEBHOOK_SECRET=` placeholders to the real `.env.qnap` (empty — no value placed, unlike `.env.local`) and to `.env.qnap.example` (documentation only). Nothing was deployed; `docker compose -f docker-compose.qnap.prod.yml config` was used only to validate YAML syntax, never `up`/`restart`.

**Files changed:** `docker-compose.qnap.prod.yml`, `.env.qnap` (empty placeholders only), `.env.qnap.example`.

**Tested:** `docker compose -f docker-compose.qnap.prod.yml config --quiet` (with a dummy `IMAGE_TAG`) validates cleanly — no YAML/interpolation errors. No live PROD test performed (correctly, per the explicit instruction not to deploy PROD now). Once a real deploy happens and `.env.qnap` gets real values, the exact same code path already verified live in Task 11 (local) applies unchanged.

**Status: DONE** (code/config ready; real PROD webhook delivery necessarily unverified until an actual future deploy — out of this task's explicit scope).

# Task 13 — Root-cause the "spinner never resolves" report (Input 5)

**Requested:** don't assume the webhook is at fault — check CHAD server logs, Stripe Workbench/API request logs and Events; confirm whether the Checkout Session/PaymentIntent were created, their status, amount/currency/mode, whether Checkout errored, whether success/cancel URLs were correct.

**Done:** found the user's real session in `cp_stripe_payments` (`pawel_f`, 2.00 PLN, created 19:13 UTC) — still `status: pending`, `stripe_event_id: null`. Queried the real Stripe API directly for that exact session id (`stripe.checkout.sessions.retrieve(..., { expand: ["payment_intent"] })`): `status: "complete"`, `payment_status: "paid"`, `livemode: false` (correct test-mode key/account), `amount_total: 200`, `currency: "pln"`, `success_url`/`cancel_url` both correct, PaymentIntent `succeeded`, no `last_payment_error`. **Conclusion: the payment genuinely succeeded on Stripe.** It never showed as confirmed in CHAD because no webhook endpoint was registered anywhere reachable by Stripe at all (no public URL, no local tunnel) — `checkout.session.completed` was never delivered, so the DB row could never move past `pending`. Separately, and compounding the visible symptom: `settings/payments/success/page.tsx`'s polling loop had no terminal UI state once its poll budget (15×2s) ran out — it silently stopped scheduling further polls while `status` (and the spinner) stayed at "pending" forever, so even a delayed webhook arrival wouldn't have changed what the user saw without a refresh. Both root causes are real and independent; both needed fixing (Task 14, and Task 19's Stripe CLI forwarding to make local delivery possible at all).

**Files changed:** none (diagnosis only) — see Task 14/19 for the fixes.

**Tested:** the diagnosis itself is the "test" — a real `stripe.checkout.sessions.retrieve` call against the real Sandbox account, not a guess.

**Status: DONE**

# Task 14 — Fix the spinner (terminal state) + remove the redundant "Back to Payments" button (Input 5, 6)

**Requested:** UI must never hang forever; show loading on Checkout creation, redirect immediately once a URL is returned, stop the spinner and show a message on error, add a sensible timeout, cancel restores normal state, success shows payment status, refresh never creates a second session, the success query param alone is never proof of payment. Later (Input 6): remove the "Back to Payments" button since success/cancel are "the same tab" as Payments — just show the success message.

**Done:** `settings/payments/success/page.tsx` now has an explicit `"timed_out"` terminal status: once `MAX_POLLS` (15×2s) is exhausted while the server still reports `pending`, the page shows "Still confirming" (not an endless "Confirming your payment..." spinner) with a manual "Check again" button that restarts polling from scratch. On `"completed"`, the page now auto-`router.push`es back to `/dashboard/settings/payments` after 1.5s (Input 6) instead of showing a "Back to Payments" link — the new payment is already visible there via Task 18's history list. `settings/payments/page.tsx`'s own checkout-creation fetch got an `AbortController`-based 15s timeout (`CHECKOUT_REQUEST_TIMEOUT_MS`), surfaced as a clear "Starting checkout timed out" error with the spinner stopped, not a raw hang.

**Files changed:** `packages/dashboard/app/(dashboard)/dashboard/settings/payments/success/page.tsx`, `.../page.tsx` (main Payments page, timeout).

**Tested:** `success/page.test.tsx` (4 tests, fake timers + `act()`): reaches `"timed_out"` (not an endless spinner) when the poll budget is exhausted; resolves to `"completed"` immediately without waiting for the full budget and confirms no "Back to Payments" button exists, then confirms the auto-redirect actually fires (`router.push` called with the right path) after the delay; "Check again" restarts polling and reaches `"completed"` for real. **Live, with a real completed Stripe payment (Task 19): confirmed the success page actually reaches "Payment successful" and auto-returns to Payments — not simulated.**

**Status: DONE**

# Task 15 — Dev Panel → Payments (sanitized lifecycle log, survives refresh)

**Requested:** a new Dev Panel tab showing recent sanitized events (timestamp, CHAD environment, Stripe test/live, lifecycle stage, Checkout Session ID, PaymentIntent ID, repo/user, amount+currency, status, short sanitized message) — never card numbers/CVC/secret key/webhook secret/`Stripe-Signature`/full payloads; must survive a refresh (unlike the existing Requests/Errors tabs, which are in-memory only).

**Done:** new migration `0006_stripe_payment_diagnostics.sql` adds an append-only `cp_stripe_payment_events` table (deliberately NOT a second source of truth — `cp_stripe_payments.status` remains authoritative; this table is diagnostics only) plus `livemode`/`chad_environment` columns on `cp_stripe_payments` itself (needed for Task 17 too). `packages/dba/src/payments.ts`'s `recordPaymentEvent()` writes a best-effort row (caught/logged on failure, **never** rethrown — a diagnostics failure must never break a real payment) at every stage: `checkout_create_requested`/`checkout_created`/`checkout_create_failed`, `webhook_received`/`webhook_verified`/`webhook_rejected`, `payment_completed`/`payment_failed`. `GET /api/dev-panel/payments-events` (same `assertDevOnly()` gate as the existing dev-settings routes — `CHAD_ENVIRONMENT` local/unset only) feeds a new `DevPanelPaymentsTab` component, wired in as a 4th tab (💳 Payments) alongside Settings/Errors/Requests, backed by the database (not the client-side in-memory store), so it survives a refresh by construction.

**Files changed:** `packages/dba/sql/migrations/0006_stripe_payment_diagnostics.sql`, `packages/dba/src/payments.ts`, `packages/dashboard/app/api/dev-panel/payments-events/route.ts`, `packages/dashboard/components/dev-panel/dev-panel-payments.tsx`, `dev-panel.tsx`, `packages/dashboard/lib/dev-panel/dev-panel-store.tsx` (new `'payments'` tab type).

**Tested:** `packages/dba/src/payments.test.ts` (3 new real-Postgres tests): a `checkout_create_failed` event is recorded with a sanitized message for an invalid amount; `webhook_received`/`webhook_verified`/`payment_completed` are all recorded with correct `stripe_mode` for a real signed event, and no message anywhere matches a card-number/secret-key/webhook-secret pattern; a `webhook_rejected` event is recorded (no session id) for an invalid signature, with no payment row mutated. **Live (Task 19): after a real completed Sandbox payment, opened Dev Panel → Payments and saw the full real lifecycle — `checkout_create_requested` → `checkout_created` → several `webhook_received`/`webhook_verified` rows (Stripe sends `payment_intent.created`, `charge.succeeded`, `payment_intent.succeeded`, `checkout.session.completed`, `charge.updated` — all logged, only the last one advances the payment) → `payment_completed`, all correctly tagged `test`/`local`.**

**Status: DONE**

# Task 16 — Admin restructure: hub page under "Others" (Input 3, then revised by Input 6)

**Requested (Input 3):** replace the direct "Users" sidebar position with "Admin → Users, Admin → Payments"; reuse an existing Admin route/section if present, don't create a second one. **Revised (Input 6):** put a single "Admin" entry at the bottom of "Others", and clicking it opens a new menu "like Msg Auto" with Users/Payments buttons — not two flat sidebar sub-items.

**Done:** first pass (Input 3) added "Users"/"Payments" as two flat items under a dedicated "Admin" sidebar group — functionally correct but not what the user actually wanted. Revised per Input 6: `packages/dashboard/app/(dashboard)/dashboard/admin/page.tsx` is now a hub page copying `msg-automation/page.tsx`'s exact pattern (`DashboardPageShell` + a button grid, each button `router.push`ing to its own route) with "USERS"/"PAYMENTS" buttons. The sidebar's `Users`/`CreditCard`-icon two-item "Admin" group was removed; a single `Admin` item now sits at the bottom of the existing "Others" group (`activePrefixes: ["/dashboard/admin"]`), same shape as "Msg Auto"/"Knowledge"/"Examples". `/dashboard/admin/users` (moved from the original standalone `/dashboard/users`, an orphaned duplicate `/admin/users` route from the original template was found and confirmed unreferenced — left untouched, out of scope) and `/dashboard/admin/payments` keep their own routes/pages/`DashboardPageShell`s, exactly as sub-pages under "Msg Auto" (e.g. Statuses) do.

**Files changed:** `packages/dashboard/components/shared/sidebar.tsx`, `packages/dashboard/app/(dashboard)/dashboard/admin/page.tsx` (new hub), `admin/users/page.tsx` (moved+relabeled from `/dashboard/users`), `admin/payments/page.tsx`, `packages/dashboard/app/sitemap.ts`.

**Tested:** `pnpm build` shows `/dashboard/admin`, `/dashboard/admin/users`, `/dashboard/admin/payments` and no `/dashboard/users`. Live browser (`test2`): sidebar shows a single "Admin" item as the last entry under "Others"; clicking it shows the "Admin" hub with "USERS"/"PAYMENTS" buttons, matching the Msg Auto hub's exact look or interaction pattern.

**Status: DONE**

# Task 17 — Admin → Payments (read-only, all users, real test/live)

**Requested:** read-only transaction list, columns: date/time, user/repo, amount, currency, Stripe mode test/live, CHAD environment, Checkout Session ID, PaymentIntent ID, status; distinguish test/live from real Stripe data (`livemode`), never from key naming; no refund/delete/manual-status-change; admin-only, same permission model as the rest of the project.

**Done:** `getPaymentsForAdmin()` (dba) reads `cp_stripe_payments` ordered by `created_at DESC`, deriving `stripeMode` from the stored `livemode` boolean (`true`→`"live"`, `false`→`"test"`, captured at write time from Stripe's own `session.livemode`/`event.livemode` — never inferred from the `sk_test_`/`sk_live_` key prefix). `GET /api/admin/payments` uses the exact same `currentUser.isAdmin` gate as the existing, already-audited `/api/admin/users` route (403 `NOT_AUTHORIZED` otherwise). `admin/payments/page.tsx` renders the table — no refund/delete/status-change controls exist anywhere in this page or its API.

**Files changed:** `packages/dba/src/payments.ts` (`getPaymentsForAdmin`), `packages/dashboard/app/api/admin/payments/route.ts`, `packages/dashboard/app/(dashboard)/dashboard/admin/payments/page.tsx`.

**Tested:** `packages/dba/src/payments.test.ts` — real-Postgres test confirms `stripeMode`/`chadEnvironment` are correctly derived for a row with `livemode=false`. Live browser: as `test2` (not an admin) → real `403 NOT_AUTHORIZED` shown in the page (confirms the gate is live-wired, not just present in code) — proven via `GET /api/auth/session` in the same session returning `isAdmin: false`. Viewing the page as a real admin account wasn't done in this session — deliberately not assuming a real admin user's identity without explicit permission (`pawel_f` is the only admin account and mutating/impersonating it wasn't authorized); the query logic itself is proven correct against real data, and the auth gate reuses an already-proven pattern verbatim.

**Status: DONE** (admin-list rendering itself verified via code/query-level tests + a live negative-auth check, not a live positive-admin view — see `06_others_from_report.md`).

# Task 18 — Settings → Payments: show the user's own payment history, drop the description text (Input 6, 7)

**Requested (Input 6):** under the Pay-with-card button, show the user's own previous successful transactions. (Input 7): remove the "Payments / Make a one-off card payment..." description text entirely — no extra descriptive copy.

**Done:** `getPaymentsForUser()` (dba) — completed payments only, scoped to the caller's own `repo_guid` (same isolation as `getPaymentStatus`), most recent first. `GET /api/settings/payments/history` (session-gated, thin adapter). `settings/payments/page.tsx` dropped the intro paragraph under the "Payments" heading and added a "Previous payments" card listing date + amount for each of the user's own completed payments (empty state: "No successful payments yet.").

**Files changed:** `packages/dba/src/payments.ts` (`getPaymentsForUser`), `packages/dashboard/app/api/settings/payments/history/route.ts`, `packages/dashboard/app/(dashboard)/dashboard/settings/payments/page.tsx`.

**Tested:** live browser as `test2`: page shows only the heading "Payments" (no subtitle), and "Previous payments" correctly lists the one real completed transaction from Task 19 (3.00 PLN) — the earlier 12.34 PLN attempt from Task 11 (created before Stripe CLI forwarding was set up, still `pending`) is correctly excluded, since only `completed` rows are shown.

**Status: DONE**

# Task 19 — Real Stripe Sandbox E2E: pay with the test card, confirm it actually completes

**Requested:** the most important criterion of this continuation — don't stop at build/mocks; prove (or clearly report as blocked with concrete IDs/errors) that a real Sandbox payment via the `4242...` test card actually completes and shows as confirmed in CHAD.

**Done:** installed the Stripe CLI (Homebrew failed on outdated Xcode CLT — used the arm64 release tarball directly, extracted to the scratchpad, no system install) and ran `stripe listen --forward-to localhost:12020/api/webhooks/stripe --api-key sk_test_...` to actually deliver real webhook events to the local dev server (this is what was structurally missing for local dev in Task 13's root cause — no public URL, no tunnel). Updated `.env.local`'s `STRIPE_WEBHOOK_SECRET` to the value that specific `stripe listen` session printed (each session mints its own, different from a one-shot `--print-secret` value) and restarted the container. Logged in as `test2` via a real browser, went to Settings → Payments, entered 3.00 PLN, was redirected to real Stripe-hosted Checkout, checked Stripe's own "I am an AI agent" disclosure checkboxes (honest disclosure — this is a self-testing Sandbox flow with Stripe's own public `4242 4242 4242 4242` test fixture, not a real human buyer's card), filled the test card (expiry `12/34`, CVC `123`, name "Test User"), and clicked Pay.

**Result: the success page reached "Payment successful" for real** (not stuck) and auto-returned to Payments. Verified directly in Postgres: `cp_stripe_payments` row for that session — `status: "completed"`, `livemode: false`, `chad_environment: "local"`, real `stripe_payment_intent_id` (`pi_3U2zHI...`) and `stripe_event_id` (`evt_1U2zHJ...`) both populated. `cp_stripe_payment_events` shows the full real lifecycle (`checkout_created` → `webhook_verified` → `payment_completed`). Confirmed in the UI too: Dev Panel → Payments (Task 15) and Settings → Payments' own history list (Task 18) both show this real transaction.

**Files changed:** none beyond what's listed in Tasks 13–18 — this task is the end-to-end proof that they work together.

**Tested:** this task IS the test — a real Sandbox Checkout Session, a real test-card payment, a real webhook delivery, a real DB write, a real UI confirmation. PASS, locally, with Stripe Sandbox/Test Mode (never LIVE).

**Status: DONE**
