import { NextResponse } from "next/server";
import { handleStripeWebhookEvent, InvalidWebhookSignatureError, PaymentsNotConfiguredError } from "dba";

/**
 * POST /api/webhooks/stripe
 * Called by Stripe, not by a logged-in user — no session/repo context here.
 * `request.text()` on a Next.js App Router Request is already the raw,
 * unparsed body (unlike the Pages Router, which needed `bodyParser: false`
 * to get the same thing) — required for signature verification (§1.7).
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  try {
    const result = await handleStripeWebhookEvent(rawBody, signature);
    return NextResponse.json({ received: true, handled: result.handled, type: result.type });
  } catch (error) {
    if (error instanceof InvalidWebhookSignatureError) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
    if (error instanceof PaymentsNotConfiguredError) {
      console.error("[webhooks/stripe] not configured:", error.message);
      return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
    }
    console.error("[webhooks/stripe]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
