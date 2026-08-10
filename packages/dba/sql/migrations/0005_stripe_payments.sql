-- Story 116 — one-off Stripe Checkout payments (dynamic PLN amount).
--
-- Minimal persistence, deliberately not a billing/entitlement system (per
-- Story 116 input §1.7: "Nie wymyślaj rozbudowanego billing database").
-- The only reason this table exists at all: the webhook handler needs
-- somewhere idempotent to record "this Checkout Session's
-- checkout.session.completed event was already processed" so a Stripe
-- webhook redelivery can never cause a double business effect, and the
-- Payments success page needs a source of truth that isn't just the
-- `session_id` query param (§1.8 — a query param alone is never proof of
-- payment).
--
-- id = Stripe Checkout Session id (cs_...), already globally unique.
CREATE TABLE cp_stripe_payments (
  id text PRIMARY KEY,
  repo_guid text NOT NULL,
  username text NOT NULL,
  amount_minor bigint NOT NULL,
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed')),
  stripe_payment_intent_id text,
  -- Last checkout.session.completed event id applied to this row — the
  -- idempotency key. A redelivered event with the same id is a no-op.
  stripe_event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Payments (settings) page lists/looks up a user's own payments only.
CREATE INDEX cp_stripe_payments_repo_idx
  ON cp_stripe_payments (repo_guid, created_at DESC);

-- A given Stripe event must never be able to complete two different rows.
CREATE UNIQUE INDEX cp_stripe_payments_event_idx
  ON cp_stripe_payments (stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;
