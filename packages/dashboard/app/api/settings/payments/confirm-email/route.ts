import { NextResponse } from "next/server";
import { LicenseCommerceError, confirmRepresentativeOtp, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export async function POST(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  let body: { code?: unknown };
  try {
    body = (await request.json()) as { code?: unknown };
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const profile = await runWithRepoContext(user, () => confirmRepresentativeOtp(body.code));
    return NextResponse.json({ success: true, profile });
  } catch (error) {
    if (error instanceof LicenseCommerceError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: 400 });
    }
    console.error("[settings/payments/confirm-email]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Failed to confirm email" }, { status: 500 });
  }
}
