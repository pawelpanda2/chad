import { NextResponse } from "next/server";
import {
  LicenseCommerceError,
  declarationText,
  getCurrentLicenseAgreement,
  getLicenseeProfileForCurrentUser,
  getPaymentsForUser,
  getTestPaymentsForUser,
  listActiveLicensePlans,
  runWithRepoContext,
} from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

/**
 * GET /api/settings/payments/commerce
 * Session-scoped: plans, licensee profile, agreement, real + test histories.
 */
export async function GET() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  try {
    const payload = await runWithRepoContext(user, async () => {
      const [plans, profile, agreement, payments, testPayments] = await Promise.all([
        listActiveLicensePlans(),
        getLicenseeProfileForCurrentUser(),
        getCurrentLicenseAgreement(),
        getPaymentsForUser(20),
        getTestPaymentsForUser(20),
      ]);
      const declarationPreview = profile
        ? declarationText({
            legalBusinessName: profile.legalBusinessName,
            agreementVersion: agreement.version,
            productName: plans[0]?.productName ?? "CHAD Dashboard",
            userCount: plans[0]?.userCount ?? 1,
            licensePeriod: plans[0]?.licensePeriod ?? "12 months",
            amountMinor: plans[0]?.amountMinor ?? 0,
            currency: plans[0]?.currency ?? "PLN",
          })
        : null;
      return { plans, profile, agreement, payments, testPayments, declarationPreview };
    });
    return NextResponse.json({ success: true, ...payload });
  } catch (error) {
    if (error instanceof LicenseCommerceError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: 400 });
    }
    console.error("[settings/payments/commerce]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Failed to load payments" }, { status: 500 });
  }
}
