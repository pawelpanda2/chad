/**
 * Story 116 — Settings → Payments: one-off Stripe Checkout, dynamic PLN
 * amount (not a subscription — every payment is its own Checkout Session).
 *
 * This is the ONLY module in the monorepo allowed to import `payments`
 * (per the user's architecture correction): Dashboard → dba → payments →
 * Stripe. Dashboard API routes call only the functions exported here, never
 * `payments` directly.
 *
 * `createPaymentCheckoutSession`/`getPaymentStatus` read the current user
 * from the request-scoped repo context (see repo-context.ts) — the caller
 * (a Dashboard route) must resolve the session and wrap the call in
 * `runWithRepoContext(user, ...)`, same convention as every other
 * session-scoped dba function. `handleStripeWebhookEvent` intentionally
 * takes no repo context — Stripe is calling CHAD, not a logged-in user; the
 * target row is found by Checkout Session id, already recorded at creation
 * time under the paying user's repo_guid.
 *
 * Diagnostic event logging (Story 116 continuation, after a real Sandbox
 * payment succeeded on Stripe but never showed as confirmed in CHAD — see
 * `0006_stripe_payment_diagnostics.sql`'s own doc comment for the full root
 * cause): every lifecycle stage writes a best-effort row to
 * `cp_stripe_payment_events`, sanitized (no card data, no secrets, no raw
 * Stripe payloads) and NEVER allowed to break the real payment flow — a
 * logging failure is caught and reported to stderr, never rethrown.
 */
import { randomUUID } from "node:crypto";
import {
  parseAmountToMinorUnits,
  createCheckoutSession as createStripeCheckoutSession,
  constructWebhookEvent,
  PaymentsError,
  PaymentsNotConfiguredError,
  InvalidAmountError,
  InvalidWebhookSignatureError,
  LiveStripeKeyForbiddenError,
  isStripeLiveConfigured,
  type Stripe,
} from "payments";
import { withPostgresClient } from "./postgres.js";
import { getCurrentRepoGuid, getCurrentUsername } from "./repo-context.js";
import {
  LicenseCommerceError,
  getLicenseAcceptanceForCurrentUser,
  getLicensePlan,
  resolveUsernameByRepoGuid,
  sha256Hex,
} from "./license-commerce.js";

export {
  PaymentsError,
  PaymentsNotConfiguredError,
  InvalidAmountError,
  InvalidWebhookSignatureError,
  LiveStripeKeyForbiddenError,
  isStripeLiveConfigured,
} from "payments";

function chadEnvironment(): string {
  return process.env.CHAD_ENVIRONMENT || "local";
}

function stripeMode(livemode: boolean | null | undefined): "test" | "live" | null {
  if (livemode === true) return "live";
  if (livemode === false) return "test";
  return null;
}

export type PaymentEventStage =
  | "checkout_create_requested"
  | "checkout_created"
  | "checkout_create_failed"
  | "webhook_received"
  | "webhook_verified"
  | "webhook_rejected"
  | "payment_completed"
  | "payment_failed";

interface RecordPaymentEventInput {
  stage: PaymentEventStage;
  stripeMode?: "test" | "live" | null;
  checkoutSessionId?: string | null;
  paymentIntentId?: string | null;
  repoGuid?: string | null;
  username?: string | null;
  amountMinor?: number | null;
  currency?: string | null;
  status?: string | null;
  message?: string | null;
}

/**
 * Best-effort diagnostic write — never throws, never blocks the real
 * checkout/webhook flow. `message` must already be sanitized by the caller
 * (short, human-readable, no secrets/card data/raw payloads).
 */
async function recordPaymentEvent(input: RecordPaymentEventInput): Promise<void> {
  try {
    await withPostgresClient((client) =>
      client.query(
        `INSERT INTO cp_stripe_payment_events
           (stage, chad_environment, stripe_mode, checkout_session_id, payment_intent_id,
            repo_guid, username, amount_minor, currency, status, message)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          input.stage,
          chadEnvironment(),
          input.stripeMode ?? null,
          input.checkoutSessionId ?? null,
          input.paymentIntentId ?? null,
          input.repoGuid ?? null,
          input.username ?? null,
          input.amountMinor ?? null,
          input.currency ?? null,
          input.status ?? null,
          input.message ?? null,
        ],
      ),
    );
  } catch (error) {
    console.error("[payments] failed to record diagnostic event (non-fatal):", error instanceof Error ? error.message : error);
  }
}

export interface CreatePaymentCheckoutSessionResult {
  url: string;
}

function buildSuccessCancelUrls(originUrl: string): { successUrl: string; cancelUrl: string } {
  const base = originUrl.replace(/\/+$/, "");
  return {
    successUrl: `${base}/dashboard/settings/payments/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${base}/dashboard/settings/payments/cancel`,
  };
}

/**
 * Creates a real Stripe Checkout Session for an already-accepted license.
 * Amount/plan come from the immutable acceptance snapshot — never from the
 * client. `provider` other than stripe is rejected (Revolut is not a
 * verifiable integration in this repo).
 */
export async function createPaymentCheckoutSession(
  originUrl: string,
  input: { acceptanceId: unknown; provider: unknown },
): Promise<CreatePaymentCheckoutSessionResult> {
  const repoGuid = getCurrentRepoGuid();
  const username = getCurrentUsername();

  await recordPaymentEvent({
    stage: "checkout_create_requested",
    repoGuid,
    username,
    message: "real license checkout requested",
  });

  const provider = typeof input.provider === "string" ? input.provider.trim() : "";
  if (provider === "revolut") {
    throw new LicenseCommerceError(
      "provider_unavailable",
      "Revolut is not available — no verifiable merchant payment API is configured.",
    );
  }
  if (provider !== "stripe") {
    throw new LicenseCommerceError("provider_unavailable", "Unsupported payment provider.");
  }
  if (typeof input.acceptanceId !== "string" || !input.acceptanceId.trim()) {
    throw new LicenseCommerceError("acceptance_not_found", "License acceptance is required before payment.");
  }

  const acceptance = await getLicenseAcceptanceForCurrentUser(input.acceptanceId.trim());
  const snapshotHash = sha256Hex(JSON.stringify(acceptance.snapshot));
  if (snapshotHash !== acceptance.snapshotSha256) {
    throw new LicenseCommerceError("acceptance_mismatch", "License acceptance snapshot is not intact.");
  }
  const plan = await getLicensePlan(acceptance.planId);
  if (!plan.active) {
    throw new LicenseCommerceError("plan_inactive", "That license plan is not active.");
  }
  if (plan.amountMinor !== acceptance.snapshot.amountMinor || plan.currency !== acceptance.snapshot.currency) {
    throw new LicenseCommerceError(
      "acceptance_mismatch",
      "Plan price no longer matches the accepted snapshot — accept the current license again.",
    );
  }

  if (!isStripeLiveConfigured()) {
    throw new PaymentsNotConfiguredError(
      "STRIPE_LIVE_SECRET_KEY is not configured — LIVE payment is unavailable.",
    );
  }

  const amount = parseAmountToMinorUnits((acceptance.snapshot.amountMinor / 100).toFixed(2));
  const { successUrl, cancelUrl } = buildSuccessCancelUrls(originUrl);

  let session: Awaited<ReturnType<typeof createStripeCheckoutSession>>;
  try {
    session = await createStripeCheckoutSession({
      amount,
      successUrl,
      cancelUrl,
      clientReferenceId: repoGuid,
      stripeMode: "live",
      productName: `${acceptance.snapshot.productName} (${acceptance.snapshot.userCount} user${acceptance.snapshot.userCount === 1 ? "" : "s"})`,
      metadata: {
        repoGuid,
        username,
        kind: "user_payment",
        provider: "stripe",
        acceptanceId: acceptance.id,
        planId: acceptance.planId,
        agreementVersion: acceptance.agreementVersion,
      },
    });
  } catch (error) {
    await recordPaymentEvent({
      stage: "checkout_create_failed",
      repoGuid,
      username,
      amountMinor: amount.minorUnits,
      currency: amount.currency,
      message: error instanceof Error ? error.message : "checkout session creation failed",
    });
    throw error;
  }

  await withPostgresClient((client) =>
    client.query(
      `INSERT INTO cp_stripe_payments (
         id, repo_guid, username, amount_minor, currency, status, livemode, stripe_mode, chad_environment,
         kind, provider, license_acceptance_id, plan_id, license_user_count, license_period, license_territory
       ) VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8,'user_payment','stripe',$9,$10,$11,$12,$13)`,
      [
        session.id,
        repoGuid,
        username,
        amount.minorUnits,
        amount.currency,
        session.livemode,
        "live",
        chadEnvironment(),
        acceptance.id,
        acceptance.planId,
        acceptance.snapshot.userCount,
        acceptance.snapshot.licensePeriod,
        acceptance.snapshot.territory,
      ],
    ),
  );

  await recordPaymentEvent({
    stage: "checkout_created",
    stripeMode: stripeMode(session.livemode),
    checkoutSessionId: session.id,
    repoGuid,
    username,
    amountMinor: amount.minorUnits,
    currency: amount.currency,
    status: "pending",
  });

  return { url: session.url };
}

export type PaymentStatus = "pending" | "completed" | "not_found";

/**
 * Reads the persisted status only — never treats the mere presence of a
 * `session_id` query param as proof of payment. Only the webhook handler
 * below can ever move a row to `completed`.
 */
export async function getPaymentStatus(sessionId: string): Promise<PaymentStatus> {
  const repoGuid = getCurrentRepoGuid();

  return withPostgresClient(async (client) => {
    const { rows } = await client.query<{ status: string }>(
      `SELECT status FROM cp_stripe_payments WHERE id = $1 AND repo_guid = $2 LIMIT 1`,
      [sessionId, repoGuid],
    );
    if (rows.length === 0) {
      return "not_found";
    }
    return rows[0].status === "completed" ? "completed" : "pending";
  });
}

export type PaymentKind = "user_payment" | "admin_test";

export interface UserPaymentRow {
  id: string;
  amountMinor: number;
  currency: string;
  createdAt: string;
  kind: PaymentKind;
  provider: string;
  status: string;
  stripeMode: string | null;
  planId: string | null;
  licenseUserCount: number | null;
  licensePeriod: string | null;
  licenseTerritory: string | null;
  licenseActivatedAt: string | null;
  agreementVersion: string | null;
}

function normalizePaymentKind(kind: string): PaymentKind {
  if (kind === "admin_test" || kind === "test") return "admin_test";
  return "user_payment";
}

function mapUserPaymentRow(r: {
  id: string;
  amount_minor: string;
  currency: string;
  created_at: string;
  kind: string;
  provider: string;
  status: string;
  stripe_mode: string | null;
  plan_id: string | null;
  license_user_count: number | null;
  license_period: string | null;
  license_territory: string | null;
  license_activated_at: string | null;
  agreement_version: string | null;
}): UserPaymentRow {
  return {
    id: r.id,
    amountMinor: Number(r.amount_minor),
    currency: r.currency,
    createdAt: r.created_at,
    kind: normalizePaymentKind(r.kind),
    provider: r.provider,
    status: r.status,
    stripeMode: r.stripe_mode,
    planId: r.plan_id,
    licenseUserCount: r.license_user_count === null ? null : Number(r.license_user_count),
    licensePeriod: r.license_period,
    licenseTerritory: r.license_territory,
    licenseActivatedAt: r.license_activated_at,
    agreementVersion: r.agreement_version,
  };
}

const USER_PAYMENT_SELECT = `p.id, p.amount_minor, p.currency, p.created_at, p.kind, p.provider, p.status, p.stripe_mode,
              p.plan_id, p.license_user_count, p.license_period, p.license_territory, p.license_activated_at,
              a.agreement_version`;

/**
 * Settings → Payments — LIVE user payments only (user_payment + live + completed).
 */
export async function getPaymentsForUser(limit = 20): Promise<UserPaymentRow[]> {
  return listUserPayments("live", limit);
}

/** Settings → Payments — admin Sandbox test payments for this user only. */
export async function getTestPaymentsForUser(limit = 20): Promise<UserPaymentRow[]> {
  return listUserPayments("test", limit);
}

async function listUserPayments(mode: "live" | "test", limit: number): Promise<UserPaymentRow[]> {
  const repoGuid = getCurrentRepoGuid();
  const kind = mode === "live" ? "user_payment" : "admin_test";
  const stripeMode = mode;
  return withPostgresClient(async (client) => {
    const { rows } = await client.query<{
      id: string;
      amount_minor: string;
      currency: string;
      created_at: string;
      kind: string;
      provider: string;
      status: string;
      stripe_mode: string | null;
      plan_id: string | null;
      license_user_count: number | null;
      license_period: string | null;
      license_territory: string | null;
      license_activated_at: string | null;
      agreement_version: string | null;
    }>(
      `SELECT ${USER_PAYMENT_SELECT}
       FROM cp_stripe_payments p
       LEFT JOIN cp_license_acceptances a ON a.id = p.license_acceptance_id
       WHERE p.repo_guid = $1
         AND (p.kind = $2 OR ($2 = 'user_payment' AND p.kind = 'real'))
         AND (p.stripe_mode = $3 OR (p.stripe_mode IS NULL AND (($3 = 'live' AND p.livemode IS TRUE) OR ($3 = 'test' AND p.livemode IS FALSE))))
         AND p.status = 'completed'
       ORDER BY p.created_at DESC
       LIMIT $4`,
      [repoGuid, kind, stripeMode, limit],
    );
    return rows.map(mapUserPaymentRow);
  });
}

export interface WebhookHandleResult {
  handled: boolean;
  type: string;
}

/**
 * Verifies the signature, then — for `checkout.session.completed` only —
 * idempotently marks the matching row `completed`. Any other event type is
 * acknowledged (handled: false) without side effects, since this Story only
 * needs the one confirming event (§1.7).
 *
 * Idempotency: the UPDATE's WHERE clause only matches a row that hasn't
 * already recorded this exact `event.id`, so a Stripe redelivery of the
 * same event is a guaranteed no-op, not a second UPDATE. The upsert fallback
 * only fires if the row is somehow missing (it shouldn't be, since
 * `createPaymentCheckoutSession` inserts it synchronously before Stripe
 * could ever redirect the customer back) — it reconstructs the row from the
 * event's own metadata/client_reference_id rather than silently dropping
 * the webhook.
 */
export async function handleStripeWebhookEvent(
  rawBody: string,
  signature: string | null,
): Promise<WebhookHandleResult> {
  await recordPaymentEvent({
    stage: "webhook_received",
    message: `raw body length=${rawBody.length}`,
  });

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(rawBody, signature);
  } catch (error) {
    await recordPaymentEvent({
      stage: "webhook_rejected",
      // Stripe's own SignatureVerificationError message is already generic
      // ("No signatures found matching...") — never includes the secret or
      // the signature value itself.
      message: error instanceof Error ? error.message : "signature verification failed",
    });
    throw error;
  }

  // Best-effort correlation id for the diagnostic log — most Stripe event
  // objects carry an `id`, including Checkout Sessions.
  const eventObjectId = (event.data.object as { id?: string } | undefined)?.id ?? null;

  await recordPaymentEvent({
    stage: "webhook_verified",
    stripeMode: stripeMode(event.livemode),
    checkoutSessionId: event.type === "checkout.session.completed" ? eventObjectId : null,
    message: `event type=${event.type}`,
  });

  if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
    const expired = event.data.object as Stripe.Checkout.Session;
    await withPostgresClient((client) =>
      client.query(
        `UPDATE cp_stripe_payments
         SET status = CASE
               WHEN $2 = 'checkout.session.expired' THEN 'canceled'
               ELSE 'failed'
             END,
             updated_at = now()
         WHERE id = $1 AND status = 'pending' AND kind IN ('user_payment', 'admin_test', 'real')`,
        [expired.id, event.type],
      ),
    );
    return { handled: true, type: event.type };
  }

  if (event.type !== "checkout.session.completed") {
    return { handled: false, type: event.type };
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  try {
    await withPostgresClient(async (client) => {
      const updateResult = await client.query(
        `UPDATE cp_stripe_payments
         SET status = 'completed',
             stripe_payment_intent_id = $2,
             stripe_event_id = $3,
             updated_at = now(),
             license_activated_at = CASE
               WHEN kind IN ('user_payment', 'real') THEN COALESCE(license_activated_at, now())
               ELSE NULL
             END
         WHERE id = $1
           AND kind IN ('user_payment', 'admin_test', 'real')
           AND (stripe_event_id IS NULL OR stripe_event_id <> $3)`,
        [session.id, paymentIntentId, event.id],
      );

      if (updateResult.rowCount === 0) {
        const metadata = session.metadata ?? {};
        await client.query(
          `INSERT INTO cp_stripe_payments (id, repo_guid, username, amount_minor, currency, status, stripe_payment_intent_id, stripe_event_id, livemode, stripe_mode, chad_environment, kind, provider, license_acceptance_id, plan_id, license_activated_at)
           VALUES ($1, $2, $3, $4, $5, 'completed', $6, $7, $8, $9, $10, 'user_payment', 'stripe', $11, $12, now())
           ON CONFLICT (id) DO UPDATE SET
             status = 'completed',
             stripe_payment_intent_id = EXCLUDED.stripe_payment_intent_id,
             stripe_event_id = EXCLUDED.stripe_event_id,
             license_activated_at = CASE
               WHEN cp_stripe_payments.kind IN ('user_payment', 'real') THEN COALESCE(cp_stripe_payments.license_activated_at, now())
               ELSE NULL
             END,
             updated_at = now()
           WHERE cp_stripe_payments.kind IN ('user_payment', 'real')
             AND (cp_stripe_payments.stripe_event_id IS NULL
              OR cp_stripe_payments.stripe_event_id <> EXCLUDED.stripe_event_id)`,
          [
            session.id,
            metadata.repoGuid ?? session.client_reference_id ?? "unknown",
            metadata.username ?? "unknown",
            session.amount_total ?? 0,
            (session.currency ?? "pln").toUpperCase(),
            paymentIntentId,
            event.id,
            event.livemode,
            event.livemode ? "live" : "test",
            chadEnvironment(),
            metadata.acceptanceId || null,
            metadata.planId || null,
          ],
        );
      }
    });
  } catch (error) {
    await recordPaymentEvent({
      stage: "payment_failed",
      stripeMode: stripeMode(event.livemode),
      checkoutSessionId: session.id,
      paymentIntentId,
      message: error instanceof Error ? error.message : "failed to persist completed payment",
    });
    throw error;
  }

  await recordPaymentEvent({
    stage: "payment_completed",
    stripeMode: stripeMode(event.livemode),
    checkoutSessionId: session.id,
    paymentIntentId,
    repoGuid: session.metadata?.repoGuid ?? session.client_reference_id ?? null,
    username: session.metadata?.username ?? null,
    amountMinor: session.amount_total ?? null,
    currency: session.currency ? session.currency.toUpperCase() : null,
    status: "completed",
  });

  return { handled: true, type: event.type };
}

export interface PaymentEventRow {
  id: number;
  occurredAt: string;
  stage: string;
  chadEnvironment: string | null;
  stripeMode: string | null;
  checkoutSessionId: string | null;
  paymentIntentId: string | null;
  repoGuid: string | null;
  username: string | null;
  amountMinor: number | null;
  currency: string | null;
  status: string | null;
  message: string | null;
}

/**
 * Dev Panel → Payments — the most recent sanitized lifecycle events, across
 * all users (this is a local development diagnostic tool, not a per-user
 * view; the caller route gates access to dev/local runtimes only). Already
 * sanitized at write time — this is a plain read, no further filtering
 * needed.
 */
export async function getRecentPaymentEvents(limit = 100): Promise<PaymentEventRow[]> {
  return withPostgresClient(async (client) => {
    const { rows } = await client.query<{
      id: number;
      occurred_at: string;
      stage: string;
      chad_environment: string | null;
      stripe_mode: string | null;
      checkout_session_id: string | null;
      payment_intent_id: string | null;
      repo_guid: string | null;
      username: string | null;
      amount_minor: string | null;
      currency: string | null;
      status: string | null;
      message: string | null;
    }>(
      `SELECT id, occurred_at, stage, chad_environment, stripe_mode, checkout_session_id,
              payment_intent_id, repo_guid, username, amount_minor, currency, status, message
       FROM cp_stripe_payment_events
       ORDER BY occurred_at DESC
       LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({
      id: r.id,
      occurredAt: r.occurred_at,
      stage: r.stage,
      chadEnvironment: r.chad_environment,
      stripeMode: r.stripe_mode,
      checkoutSessionId: r.checkout_session_id,
      paymentIntentId: r.payment_intent_id,
      repoGuid: r.repo_guid,
      username: r.username,
      amountMinor: r.amount_minor === null ? null : Number(r.amount_minor),
      currency: r.currency,
      status: r.status,
      message: r.message,
    }));
  });
}

export interface AdminPaymentRow {
  id: string;
  repoGuid: string;
  username: string;
  amountMinor: number;
  currency: string;
  status: string;
  stripeMode: string | null;
  chadEnvironment: string | null;
  paymentIntentId: string | null;
  createdAt: string;
  updatedAt: string;
  kind: PaymentKind;
  provider: string;
  planId: string | null;
  licenseActivatedAt: string | null;
}

/**
 * Admin → Payments — read-only, all users, no card data (this table never
 * stored any). Distinguishes test/live via the stored `livemode` column
 * (captured from Stripe's own session/event, never inferred from key
 * naming).
 */
export async function getPaymentsForAdmin(
  limit = 200,
  options: { repoGuid?: string | null } = {}
): Promise<AdminPaymentRow[]> {
  const repoGuid = options.repoGuid?.trim() || null;
  return withPostgresClient(async (client) => {
    const { rows } = await client.query<{
      id: string;
      repo_guid: string;
      username: string;
      amount_minor: string;
      currency: string;
      status: string;
      livemode: boolean | null;
      chad_environment: string | null;
      stripe_payment_intent_id: string | null;
      created_at: string;
      updated_at: string;
      kind: string;
      provider: string;
      plan_id: string | null;
      license_activated_at: string | null;
    }>(
      repoGuid
        ? `SELECT id, repo_guid, username, amount_minor, currency, status, livemode,
                  chad_environment, stripe_payment_intent_id, created_at, updated_at,
                  kind, provider, plan_id, license_activated_at
           FROM cp_stripe_payments
           WHERE repo_guid = $1
           ORDER BY created_at DESC
           LIMIT $2`
        : `SELECT id, repo_guid, username, amount_minor, currency, status, livemode,
                  chad_environment, stripe_payment_intent_id, created_at, updated_at,
                  kind, provider, plan_id, license_activated_at
           FROM cp_stripe_payments
           ORDER BY created_at DESC
           LIMIT $1`,
      repoGuid ? [repoGuid, limit] : [limit],
    );
    return rows.map((r) => ({
      id: r.id,
      repoGuid: r.repo_guid,
      username: r.username,
      amountMinor: Number(r.amount_minor),
      currency: r.currency,
      status: r.status,
      stripeMode: r.livemode === null ? null : r.livemode ? "live" : "test",
      chadEnvironment: r.chad_environment,
      paymentIntentId: r.stripe_payment_intent_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      kind: normalizePaymentKind(r.kind),
      provider: r.provider,
      planId: r.plan_id,
      licenseActivatedAt: r.license_activated_at,
    }));
  });
}

/**
 * Admin → Payments / Test — Stripe Sandbox checkout for a selected user.
 * payment_kind=admin_test, stripe_mode=test. Never activates a real license.
 */
export async function createAdminTestCheckoutSession(
  originUrl: string,
  input: { targetRepoGuid: unknown; amountMajor: unknown },
): Promise<CreatePaymentCheckoutSessionResult> {
  const adminUsername = getCurrentUsername();
  if (typeof input.targetRepoGuid !== "string" || !input.targetRepoGuid.trim()) {
    throw new LicenseCommerceError("user_not_found", "Select a user.");
  }
  const targetRepoGuid = input.targetRepoGuid.trim();
  const username = await resolveUsernameByRepoGuid(targetRepoGuid);
  const amount = parseAmountToMinorUnits(
    typeof input.amountMajor === "string" || typeof input.amountMajor === "number"
      ? String(input.amountMajor)
      : "30.00",
  );

  const base = originUrl.replace(/\/+$/, "");
  const successUrl = `${base}/dashboard/settings/payments/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${base}/dashboard/admin/payments`;

  const session = await createStripeCheckoutSession({
    amount,
    successUrl,
    cancelUrl,
    clientReferenceId: targetRepoGuid,
    stripeMode: "test",
    productName: "CHAD Admin test payment",
    metadata: {
      repoGuid: targetRepoGuid,
      username,
      kind: "admin_test",
      provider: "stripe",
      createdByAdmin: adminUsername,
    },
  });

  await withPostgresClient((client) =>
    client.query(
      `INSERT INTO cp_stripe_payments (
         id, repo_guid, username, amount_minor, currency, status, livemode, stripe_mode, chad_environment,
         kind, provider, created_by_admin_username
       ) VALUES ($1,$2,$3,$4,$5,'pending', false, 'test', $6, 'admin_test', 'stripe', $7)`,
      [
        session.id,
        targetRepoGuid,
        username,
        amount.minorUnits,
        amount.currency,
        chadEnvironment(),
        adminUsername,
      ],
    ),
  );

  await recordPaymentEvent({
    stage: "checkout_created",
    stripeMode: "test",
    checkoutSessionId: session.id,
    repoGuid: targetRepoGuid,
    username,
    amountMinor: amount.minorUnits,
    currency: amount.currency,
    status: "pending",
    message: `admin test Stripe checkout by ${adminUsername}`,
  });

  return { url: session.url };
}

/** @deprecated Use createAdminTestCheckoutSession */
export async function createAdminTestPayment(input: {
  targetRepoGuid: unknown;
  planId: unknown;
}): Promise<UserPaymentRow> {
  throw new LicenseCommerceError(
    "provider_unavailable",
    "Direct test payment records are disabled — use Admin Test Stripe checkout.",
  );
}
