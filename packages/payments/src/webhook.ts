/**
 * Webhook signature verification — tries LIVE then test webhook secrets so
 * one endpoint can serve both modes.
 */
import Stripe from "stripe";
import {
  requireStripeLiveWebhookSecret,
  requireStripeTestWebhookSecret,
  requireStripeLiveSecretKey,
  requireStripeTestSecretKey,
} from "./config.js";
import { InvalidWebhookSignatureError } from "./errors.js";

function stripeForWebhookMode(mode: "live" | "test"): Stripe {
  return new Stripe(mode === "live" ? requireStripeLiveSecretKey() : requireStripeTestSecretKey());
}

export function constructWebhookEvent(
  rawBody: string | Buffer,
  signature: string | null | undefined,
): Stripe.Event {
  if (!signature) {
    throw new InvalidWebhookSignatureError("Missing Stripe-Signature header.");
  }

  const attempts: Array<{ mode: "live" | "test"; secret: string }> = [];
  try {
    attempts.push({ mode: "live", secret: requireStripeLiveWebhookSecret() });
  } catch {
    /* LIVE webhook not configured — skip */
  }
  try {
    attempts.push({ mode: "test", secret: requireStripeTestWebhookSecret() });
  } catch {
    /* test webhook not configured — skip */
  }
  if (attempts.length === 0) {
    throw new InvalidWebhookSignatureError("No Stripe webhook secrets are configured.");
  }

  let lastError: unknown;
  for (const attempt of attempts) {
    const stripe = stripeForWebhookMode(attempt.mode);
    try {
      return stripe.webhooks.constructEvent(rawBody, signature, attempt.secret);
    } catch (error) {
      lastError = error;
    }
  }

  const message =
    lastError instanceof Error ? lastError.message : "Unknown signature verification error";
  throw new InvalidWebhookSignatureError(message);
}
