import { NextResponse } from "next/server";
import { LicenseCommerceError, createLicenseAcceptance, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export async function POST(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  let body: { planId?: unknown };
  try {
    body = (await request.json()) as { planId?: unknown };
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
  const userAgent = request.headers.get("user-agent");

  try {
    const result = await runWithRepoContext(user, () =>
      createLicenseAcceptance({ planId: body.planId, ip, userAgent }),
    );
    return NextResponse.json({
      success: true,
      acceptanceId: result.acceptance.id,
      declaration: result.declaration,
      snapshot: result.acceptance.snapshot,
    });
  } catch (error) {
    if (error instanceof LicenseCommerceError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: 400 });
    }
    console.error("[settings/payments/accept]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Failed to record license acceptance" }, { status: 500 });
  }
}
