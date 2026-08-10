/**
 * Stripe Checkout Session creation — one-off card payment (`mode: "payment"`),
 * dynamic price via `line_items[].price_data` (no persistent Stripe `Price`
 * object, no `STRIPE_PRICE_ID` — §1.4). A fresh `Stripe` client is
 * constructed per call rather than cached as a module singleton: Checkout
 * Session creation is not a hot path, and this avoids ever caching a stale
 * client from before STRIPE_SECRET_KEY was configured.
 */
import Stripe from "stripe";
import { requireStripeSecretKey } from "./config.js";
import { InvalidAmountError } from "./errors.js";
import type { ParsedAmount } from "./amount.js";

export interface CreateCheckoutSessionInput {
  amount: ParsedAmount;
  successUrl: string;
  cancelUrl: string;
  /** Opaque caller identifier (CHAD repoGuid) — never trusted back from the client, only echoed by Stripe. */
  clientReferenceId: string;
  metadata: Record<string, string>;
}

export interface CreatedCheckoutSession {
  id: string;
  url: string;
}

export async function createCheckoutSession(
  input: CreateCheckoutSessionInput,
): Promise<CreatedCheckoutSession> {
  const stripe = new Stripe(requireStripeSecretKey());

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: input.clientReferenceId,
      metadata: input.metadata,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      line_items: [
        {
          quantity: 1,
          price_data: {
            // Stripe currency codes are lowercase ISO-4217.
            currency: input.amount.currency.toLowerCase(),
            unit_amount: input.amount.minorUnits,
            product_data: {
              name: "CHAD payment",
            },
          },
        },
      ],
    });
  } catch (error) {
    // Stripe enforces its own per-currency minimum charge (e.g. ~2.00 PLN)
    // independently of our own §1.5 validation — surfaced as a controlled
    // 400 (the amount, not the server, is the problem), not a raw 500.
    if (
      error instanceof Stripe.errors.StripeInvalidRequestError &&
      (error.code === "amount_too_small" || error.param === "line_items[0][price_data][unit_amount]")
    ) {
      throw new InvalidAmountError(
        "Amount is too small for Stripe to process — try a larger amount.",
      );
    }
    throw error;
  }

  if (!session.url) {
    throw new Error("Stripe did not return a Checkout Session URL.");
  }

  return { id: session.id, url: session.url };
}
