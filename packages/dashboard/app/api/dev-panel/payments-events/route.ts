import { NextResponse } from "next/server";
import { getRecentPaymentEvents } from "dba";

/**
 * GET /api/dev-panel/payments-events
 * Dev Panel → Payments — recent sanitized lifecycle events (no card data,
 * no secrets, no raw Stripe payloads — enforced at write time in
 * packages/dba/src/payments.ts). Dev/local runtimes only, same gate as the
 * other dev-settings routes (Story 116 continuation).
 */
function assertDevOnly(): NextResponse | null {
  const chadEnv = process.env.CHAD_ENVIRONMENT;
  const allowed =
    chadEnv === "local" || (chadEnv !== "test" && chadEnv !== "prod" && process.env.NODE_ENV !== "production");
  if (!allowed) {
    return NextResponse.json({ error: "DISABLED_OUTSIDE_LOCAL" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const denied = assertDevOnly();
  if (denied) return denied;

  try {
    const events = await getRecentPaymentEvents(100);
    return NextResponse.json({ success: true, events });
  } catch (error) {
    console.error("[dev-panel/payments-events]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Failed to load payment events", events: [] }, { status: 500 });
  }
}
