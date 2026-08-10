-- Story 116 (continuation) — root-caused a "spinner never resolves" report:
-- the Checkout Session + payment succeeded for real on Stripe, but
-- cp_stripe_payments stayed 'pending' forever because no webhook endpoint
-- was reachable to deliver checkout.session.completed. This migration adds
-- what's needed to diagnose that class of problem going forward, without
-- replacing cp_stripe_payments as the source of truth for "is this payment
-- done":
--
-- 1. cp_stripe_payments gets two new columns so Admin -> Payments can show
--    real test/live + environment per row, captured from Stripe's own
--    session.livemode (never inferred from key naming, per the explicit
--    instruction) and CHAD_ENVIRONMENT at the time of the call.
-- 2. cp_stripe_payment_events is a new, separate, append-only diagnostic
--    log (Dev Panel -> Payments) — one row per lifecycle stage
--    (checkout_create_requested/created/failed, webhook_received/verified/
--    rejected, payment_completed/failed). Deliberately NOT a second source
--    of truth for payment status — cp_stripe_payments.status remains
--    authoritative; this table only ever gets read for diagnostics, never
--    used to decide whether a payment is complete.

ALTER TABLE cp_stripe_payments
  ADD COLUMN livemode boolean,
  ADD COLUMN chad_environment text;

CREATE TABLE cp_stripe_payment_events (
  id bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  stage text NOT NULL CHECK (stage IN (
    'checkout_create_requested',
    'checkout_created',
    'checkout_create_failed',
    'webhook_received',
    'webhook_verified',
    'webhook_rejected',
    'payment_completed',
    'payment_failed'
  )),
  chad_environment text,
  stripe_mode text CHECK (stripe_mode IN ('test', 'live')),
  checkout_session_id text,
  payment_intent_id text,
  repo_guid text,
  username text,
  amount_minor bigint,
  currency text,
  status text,
  -- Short, sanitized, human-readable note. NEVER card numbers/CVC, NEVER
  -- STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET/Stripe-Signature, NEVER a raw
  -- Stripe payload — enforced at the call site (payments.ts), not here.
  message text
);

CREATE INDEX cp_stripe_payment_events_occurred_idx
  ON cp_stripe_payment_events (occurred_at DESC);
CREATE INDEX cp_stripe_payment_events_session_idx
  ON cp_stripe_payment_events (checkout_session_id)
  WHERE checkout_session_id IS NOT NULL;
