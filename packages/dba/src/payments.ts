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

  const amount = parseAmountToMinorUnits(rawAmount);
  const { successUrl, cancelUrl } = buildSuccessCancelUrls(originUrl);

  const session = await createStripeCheckoutSession({
    amount,
    successUrl,
    cancelUrl,
    clientReferenceId: repoGuid,
    metadata: { repoGuid, username },
  });

  await withPostgresClient((client) =>
    client.query(
      `INSERT INTO cp_stripe_payments (id, repo_guid, username, amount_minor, currency, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [session.id, repoGuid, username, amount.minorUnits, amount.currency],
    ),
  );

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
  const event = constructWebhookEvent(rawBody, signature);

  if (event.type !== "checkout.session.completed") {
    return { handled: false, type: event.type };
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

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
        `INSERT INTO cp_stripe_payments (id, repo_guid, username, amount_minor, currency, status, stripe_payment_intent_id, stripe_event_id)
         VALUES ($1, $2, $3, $4, $5, 'completed', $6, $7)
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
        ],
      );
    }
  });

  return { handled: true, type: event.type };
}
