import { NextResponse } from "next/server";
import {
  LicenseCommerceError,
  LICENSE_UNIT_PRICE_MINOR,
  LICENSE_USER_COUNT_MAX,
  LICENSE_USER_COUNT_MIN,
  buildLicensePlanForUserCount,
  declarationText,
  getCurrentLicenseAgreement,
  getLicenseeProfileForCurrentUser,
  getPaymentsForUser,
  getPurchaseVerificationForPlan,
  getTestPaymentsForUser,
  isBusinessProfileComplete,
  isStripeLiveConfigured,
  licensePlanIdForUserCount,
  normalizeLicenseUserCount,
  resolveAccountEmailForCurrentUser,
  runWithRepoContext,
} from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

/**
 * GET /api/settings/payments/commerce
 * Session-scoped: license quote, business profile, agreement, verification, histories.
 */
export async function GET(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const url = new URL(request.url);
  let userCount = LICENSE_USER_COUNT_MIN;
  try {
    const raw = url.searchParams.get("userCount");
    if (raw !== null && raw !== "") {
      userCount = normalizeLicenseUserCount(raw);
    }
  } catch (error) {
    if (error instanceof LicenseCommerceError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: 400 });
    }
    throw error;
  }

  try {
    const payload = await runWithRepoContext(user, async () => {
      const [profile, agreement, payments, testPayments, accountEmail] = await Promise.all([
        getLicenseeProfileForCurrentUser(),
        getCurrentLicenseAgreement(),
        getPaymentsForUser(20),
        getTestPaymentsForUser(20),
        resolveAccountEmailForCurrentUser().catch(() => null),
      ]);
      const selectedPlan = buildLicensePlanForUserCount(userCount);
      const verification = await getPurchaseVerificationForPlan(selectedPlan.id);
      const declarationPreview =
        profile && isBusinessProfileComplete(profile)
          ? declarationText({
              legalBusinessName: profile.legalBusinessName,
              agreementVersion: agreement.version,
              productName: selectedPlan.productName,
              userCount: selectedPlan.userCount,
              amountMinor: selectedPlan.amountMinor,
              currency: selectedPlan.currency,
            })
          : null;
      return {
        userCount,
        unitPriceMinor: LICENSE_UNIT_PRICE_MINOR,
        userCountMin: LICENSE_USER_COUNT_MIN,
        userCountMax: LICENSE_USER_COUNT_MAX,
        planId: licensePlanIdForUserCount(userCount),
        selectedPlan,
        profile,
        agreement,
        payments,
        testPayments,
        accountEmail,
        verification,
        businessComplete: isBusinessProfileComplete(profile),
        liveConfigured: isStripeLiveConfigured(),
        declarationPreview,
      };
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
