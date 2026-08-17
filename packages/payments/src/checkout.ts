/**
 * Stripe Checkout Session creation — one-off card payment (`mode: "payment"`).
 */
import Stripe from "stripe";
import { requireStripeLiveSecretKey, requireStripeTestSecretKey } from "./config.js";
import { InvalidAmountError } from "./errors.js";
import type { ParsedAmount } from "./amount.js";

export interface CreateCheckoutSessionInput {
  amount: ParsedAmount;
  successUrl: string;
  cancelUrl: string;
  clientReferenceId: string;
  metadata: Record<string, string>;
  productName?: string;
  /** LIVE for user payments; test for admin Sandbox test checkout. */
  stripeMode: "live" | "test";
}

export interface CreatedCheckoutSession {
  id: string;
  url: string;
  livemode: boolean;
}

export async function createCheckoutSession(
  input: CreateCheckoutSessionInput,
): Promise<CreatedCheckoutSession> {
  const secretKey =
    input.stripeMode === "live" ? requireStripeLiveSecretKey() : requireStripeTestSecretKey();
  const stripe = new Stripe(secretKey);

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
            currency: input.amount.currency.toLowerCase(),
            unit_amount: input.amount.minorUnits,
            product_data: {
              name: input.productName || "CHAD Dashboard license",
            },
          },
        },
      ],
    });
  } catch (error) {
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

  return { id: session.id, url: session.url, livemode: session.livemode };
}
