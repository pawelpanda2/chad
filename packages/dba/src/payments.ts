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
import {
  parseAmountToMinorUnits,
  createCheckoutSession as createStripeCheckoutSession,
  constructWebhookEvent,
  PaymentsError,
  PaymentsNotConfiguredError,
  InvalidAmountError,
  InvalidWebhookSignatureError,
  type Stripe,
} from "payments";
import { withPostgresClient } from "./postgres.js";
import { getCurrentRepoGuid, getCurrentUsername } from "./repo-context.js";

export { PaymentsError, PaymentsNotConfiguredError, InvalidAmountError, InvalidWebhookSignatureError };

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
 * Validates the amount, creates the Stripe Checkout Session, and persists a
 * `pending` row synchronously (before returning the redirect URL) so the
 * webhook always has a row to complete against.
 */
export async function createPaymentCheckoutSession(
  rawAmount: unknown,
  originUrl: string,
): Promise<CreatePaymentCheckoutSessionResult> {
  const repoGuid = getCurrentRepoGuid();
  const username = getCurrentUsername();

  await recordPaymentEvent({
    stage: "checkout_create_requested",
    repoGuid,
    username,
    message: typeof rawAmount === "string" || typeof rawAmount === "number" ? `requested amount=${rawAmount}` : "requested",
  });

  let amount: ReturnType<typeof parseAmountToMinorUnits>;
  try {
    amount = parseAmountToMinorUnits(rawAmount);
  } catch (error) {
    await recordPaymentEvent({
      stage: "checkout_create_failed",
      repoGuid,
      username,
      message: error instanceof Error ? error.message : "invalid amount",
    });
    throw error;
  }

  const { successUrl, cancelUrl } = buildSuccessCancelUrls(originUrl);

  let session: Awaited<ReturnType<typeof createStripeCheckoutSession>>;
  try {
    session = await createStripeCheckoutSession({
      amount,
      successUrl,
      cancelUrl,
      clientReferenceId: repoGuid,
      metadata: { repoGuid, username },
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
      `INSERT INTO cp_stripe_payments (id, repo_guid, username, amount_minor, currency, status, livemode, chad_environment)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7)`,
      [session.id, repoGuid, username, amount.minorUnits, amount.currency, session.livemode, chadEnvironment()],
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

export interface UserPaymentRow {
  id: string;
  amountMinor: number;
  currency: string;
  createdAt: string;
}

/**
 * Settings → Payments — the current user's own previously successful
 * payments (never another user's — scoped to repo_guid from the request
 * context, same isolation as getPaymentStatus). Completed only, most
 * recent first.
 */
export async function getPaymentsForUser(limit = 20): Promise<UserPaymentRow[]> {
  const repoGuid = getCurrentRepoGuid();

  return withPostgresClient(async (client) => {
    const { rows } = await client.query<{
      id: string;
      amount_minor: string;
      currency: string;
      created_at: string;
    }>(
      `SELECT id, amount_minor, currency, created_at
       FROM cp_stripe_payments
       WHERE repo_guid = $1 AND status = 'completed'
       ORDER BY created_at DESC
       LIMIT $2`,
      [repoGuid, limit],
    );
    return rows.map((r) => ({
      id: r.id,
      amountMinor: Number(r.amount_minor),
      currency: r.currency,
      createdAt: r.created_at,
    }));
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
         SET status = 'completed', stripe_payment_intent_id = $2, stripe_event_id = $3, updated_at = now()
         WHERE id = $1 AND (stripe_event_id IS NULL OR stripe_event_id <> $3)`,
        [session.id, paymentIntentId, event.id],
      );

      if (updateResult.rowCount === 0) {
        const metadata = session.metadata ?? {};
        await client.query(
          `INSERT INTO cp_stripe_payments (id, repo_guid, username, amount_minor, currency, status, stripe_payment_intent_id, stripe_event_id, livemode, chad_environment)
           VALUES ($1, $2, $3, $4, $5, 'completed', $6, $7, $8, $9)
           ON CONFLICT (id) DO UPDATE SET
             status = 'completed',
             stripe_payment_intent_id = EXCLUDED.stripe_payment_intent_id,
             stripe_event_id = EXCLUDED.stripe_event_id,
             updated_at = now()
           WHERE cp_stripe_payments.stripe_event_id IS NULL
              OR cp_stripe_payments.stripe_event_id <> EXCLUDED.stripe_event_id`,
          [
            session.id,
            metadata.repoGuid ?? session.client_reference_id ?? "unknown",
            metadata.username ?? "unknown",
            session.amount_total ?? 0,
            (session.currency ?? "pln").toUpperCase(),
            paymentIntentId,
            event.id,
            event.livemode,
            chadEnvironment(),
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
    }>(
      repoGuid
        ? `SELECT id, repo_guid, username, amount_minor, currency, status, livemode,
                  chad_environment, stripe_payment_intent_id, created_at, updated_at
           FROM cp_stripe_payments
           WHERE repo_guid = $1
           ORDER BY created_at DESC
           LIMIT $2`
        : `SELECT id, repo_guid, username, amount_minor, currency, status, livemode,
                  chad_environment, stripe_payment_intent_id, created_at, updated_at
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
    }));
  });
}
