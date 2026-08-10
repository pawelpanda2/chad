/**
 * Webhook signature verification (§1.7). Wraps stripe.webhooks.constructEvent
 * — the raw, unparsed request body plus the `Stripe-Signature` header are
 * required; a parsed/re-serialized body will not verify even if genuine
 * (per Stripe's own docs). The caller (packages/dba) is responsible for
 * getting the raw body from the Next.js route handler (`await request.text()`
 * in the App Router already yields the raw body, unlike the Pages Router
 * which needed `bodyParser: false`).
 */
import Stripe from "stripe";
import { requireStripeWebhookSecret, requireStripeSecretKey } from "./config.js";
import { InvalidWebhookSignatureError } from "./errors.js";

export function constructWebhookEvent(
  rawBody: string | Buffer,
  signature: string | null | undefined,
): Stripe.Event {
  if (!signature) {
    throw new InvalidWebhookSignatureError("Missing Stripe-Signature header.");
  }

  const stripe = new Stripe(requireStripeSecretKey());
  const webhookSecret = requireStripeWebhookSecret();

  try {
    return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown signature verification error";
    throw new InvalidWebhookSignatureError(message);
  }
}
