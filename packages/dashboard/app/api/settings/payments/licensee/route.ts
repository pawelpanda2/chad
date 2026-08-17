import { NextResponse } from "next/server";
import { LicenseCommerceError, runWithRepoContext, saveLicenseeProfile } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export async function POST(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const profile = await runWithRepoContext(user, () =>
      saveLicenseeProfile({
        legalBusinessName: String(body.legalBusinessName ?? ""),
        country: String(body.country ?? ""),
        state: typeof body.state === "string" ? body.state : null,
        filingId: typeof body.filingId === "string" ? body.filingId : null,
        businessAddress: typeof body.businessAddress === "string" ? body.businessAddress : null,
        representativeFullName: String(body.representativeFullName ?? ""),
        representativeEmail: String(body.representativeEmail ?? ""),
      }),
    );
    return NextResponse.json({ success: true, profile });
  } catch (error) {
    if (error instanceof LicenseCommerceError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: 400 });
    }
    console.error("[settings/payments/licensee]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Failed to save licensee" }, { status: 500 });
  }
}
