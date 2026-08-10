import { NextResponse } from "next/server";
import { createPaymentCheckoutSession, PaymentsError, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";
import { paymentsPublicOrigin } from "@/lib/payments-public-origin";

/**
 * POST /api/settings/payments/checkout
 * Body: { amount: string | number } — PLN major units, e.g. "500.00".
 * Creates a one-off Stripe Checkout Session for the CURRENT session's user
 * only (never trusts a repoGuid/userId from the request body — §1.6).
 */
export async function POST(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const amount = (body as { amount?: unknown } | null)?.amount;
  const originUrl = paymentsPublicOrigin({
    forwardedProto: request.headers.get("x-forwarded-proto"),
    forwardedHost: request.headers.get("x-forwarded-host"),
    host: request.headers.get("host"),
    requestUrl: request.url,
  });

  try {
    const result = await runWithRepoContext(user, () => createPaymentCheckoutSession(amount, originUrl));
    return NextResponse.json({ success: true, url: result.url });
  } catch (error) {
    if (error instanceof PaymentsError) {
      const status = error.code === "not_configured" ? 503 : 400;
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status });
    }
    console.error("[settings/payments/checkout]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Failed to start checkout" }, { status: 500 });
  }
}
