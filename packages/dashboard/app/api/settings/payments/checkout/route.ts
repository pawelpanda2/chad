import { NextResponse } from "next/server";
import {
  createPaymentCheckoutSession,
  LicenseCommerceError,
  PaymentsError,
  runWithRepoContext,
} from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";
import { paymentsPublicOrigin } from "@/lib/payments-public-origin";

/**
 * POST /api/settings/payments/checkout
 * Body: { acceptanceId, provider } — never amount. Plan price is server-side.
 */
export async function POST(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  let body: { acceptanceId?: unknown; provider?: unknown };
  try {
    body = (await request.json()) as { acceptanceId?: unknown; provider?: unknown };
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const originUrl = paymentsPublicOrigin({
    forwardedProto: request.headers.get("x-forwarded-proto"),
    forwardedHost: request.headers.get("x-forwarded-host"),
    host: request.headers.get("host"),
    requestUrl: request.url,
  });

  try {
    const result = await runWithRepoContext(user, () =>
      createPaymentCheckoutSession(originUrl, {
        acceptanceId: body.acceptanceId,
        provider: body.provider,
      }),
    );
    return NextResponse.json({ success: true, url: result.url });
  } catch (error) {
    if (error instanceof LicenseCommerceError || error instanceof PaymentsError) {
      const status = "code" in error && error.code === "not_configured" ? 503 : 400;
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status });
    }
    console.error("[settings/payments/checkout]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Failed to start checkout" }, { status: 500 });
  }
}
