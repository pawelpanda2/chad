/**
 * Story 116 — unit tests for packages/payments's webhook signature
 * verification (§1.7/§1.13). Physically located under packages/dba/src —
 * see packages/dba/src/payments-amount.test.ts's doc comment for why (a
 * pre-existing, unrelated Vitest/vite-oxc toolchain issue for test files
 * placed directly inside most leaf `packages/*` packages).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Stripe from "stripe";
import { constructWebhookEvent, InvalidWebhookSignatureError, PaymentsNotConfiguredError } from "payments";

// generateTestHeaderString/constructEvent are pure local HMAC operations —
// no network call to Stripe, so these are real signature-verification
// tests, not mocks, even without a Sandbox account.
const WEBHOOK_SECRET = "whsec_test_secret_for_story_116";
const payload = JSON.stringify({
  id: "evt_test_123",
  object: "event",
  type: "checkout.session.completed",
  data: { object: { id: "cs_test_123" } },
});

function signPayload(secret: string): string {
  const stripe = new Stripe("sk_test_dummy_key_for_local_signing_only");
  return stripe.webhooks.generateTestHeaderString({ payload, secret });
}

describe("constructWebhookEvent", () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy_key_for_local_signing_only";
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it("accepts a correctly signed payload and returns the parsed event", () => {
    const signature = signPayload(WEBHOOK_SECRET);
    const event = constructWebhookEvent(payload, signature);
    expect(event.id).toBe("evt_test_123");
    expect(event.type).toBe("checkout.session.completed");
  });

  it("rejects a missing signature header", () => {
    expect(() => constructWebhookEvent(payload, null)).toThrow(InvalidWebhookSignatureError);
    expect(() => constructWebhookEvent(payload, undefined)).toThrow(InvalidWebhookSignatureError);
    expect(() => constructWebhookEvent(payload, "")).toThrow(InvalidWebhookSignatureError);
  });

  it("rejects a garbage/invalid signature", () => {
    expect(() => constructWebhookEvent(payload, "t=1,v1=not-a-real-signature")).toThrow(
      InvalidWebhookSignatureError,
    );
  });

  it("rejects a signature generated with the wrong secret", () => {
    const signature = signPayload("whsec_a_completely_different_secret");
    expect(() => constructWebhookEvent(payload, signature)).toThrow(InvalidWebhookSignatureError);
  });

  it("rejects a signature that doesn't match a tampered payload", () => {
    const signature = signPayload(WEBHOOK_SECRET);
    const tamperedPayload = payload.replace("cs_test_123", "cs_test_attacker_swapped");
    expect(() => constructWebhookEvent(tamperedPayload, signature)).toThrow(
      InvalidWebhookSignatureError,
    );
  });

  it("fails with a controlled error, not a crash, when STRIPE_WEBHOOK_SECRET is not configured", () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const signature = signPayload(WEBHOOK_SECRET);
    expect(() => constructWebhookEvent(payload, signature)).toThrow(PaymentsNotConfiguredError);
  });

  it("fails with a controlled error, not a crash, when STRIPE_SECRET_KEY is not configured", () => {
    delete process.env.STRIPE_SECRET_KEY;
    const signature = signPayload(WEBHOOK_SECRET);
    expect(() => constructWebhookEvent(payload, signature)).toThrow(PaymentsNotConfiguredError);
  });
});
