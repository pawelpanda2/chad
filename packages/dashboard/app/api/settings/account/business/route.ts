import { NextResponse } from "next/server";
import {
  LicenseCommerceError,
  getLicenseeProfileForCurrentUser,
  runWithRepoContext,
  saveLicenseeProfile,
} from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

/**
 * GET /api/settings/account/business — business profile for purchase/agreement.
 */
export async function GET() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  try {
    const profile = await runWithRepoContext(user, () => getLicenseeProfileForCurrentUser());
    return NextResponse.json({ success: true, profile });
  } catch (error) {
    console.error("[settings/account/business GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Failed to load business profile" }, { status: 500 });
  }
}

/**
 * POST /api/settings/account/business — save Account → Business details.
 */
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
        city: typeof body.city === "string" ? body.city : null,
        postalCode: typeof body.postalCode === "string" ? body.postalCode : null,
        businessEmail: typeof body.businessEmail === "string" ? body.businessEmail : null,
      }),
    );
    return NextResponse.json({ success: true, profile });
  } catch (error) {
    if (error instanceof LicenseCommerceError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: 400 });
    }
    console.error("[settings/account/business POST]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Failed to save business profile" }, { status: 500 });
  }
}
