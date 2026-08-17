import { NextResponse } from "next/server";
import { LicenseCommerceError, requestRepresentativeOtp, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export async function POST() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  try {
    const result = await runWithRepoContext(user, () => requestRepresentativeOtp());
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof LicenseCommerceError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: 400 });
    }
    console.error("[settings/payments/verify-email]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Failed to start verification" }, { status: 500 });
  }
}
