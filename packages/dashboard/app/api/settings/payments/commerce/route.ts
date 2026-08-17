import { NextResponse } from "next/server";
import {
  LicenseCommerceError,
  declarationText,
  getCurrentLicenseAgreement,
  getLicenseeProfileForCurrentUser,
  getPaymentsForUser,
  getPurchaseVerificationForPlan,
  getTestPaymentsForUser,
  isBusinessProfileComplete,
  isStripeLiveConfigured,
  listActiveLicensePlans,
  resolveAccountEmailForCurrentUser,
  runWithRepoContext,
} from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

/**
 * GET /api/settings/payments/commerce
 * Session-scoped: plans, business profile, agreement, verification, histories.
 */
export async function GET(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const url = new URL(request.url);
  const planId = url.searchParams.get("planId") ?? undefined;

  try {
    const payload = await runWithRepoContext(user, async () => {
      const [plans, profile, agreement, payments, testPayments, accountEmail] = await Promise.all([
        listActiveLicensePlans(),
        getLicenseeProfileForCurrentUser(),
        getCurrentLicenseAgreement(),
        getPaymentsForUser(20),
        getTestPaymentsForUser(20),
        resolveAccountEmailForCurrentUser().catch(() => null),
      ]);
      const selectedPlanId = planId || plans[0]?.id || "";
      const verification = selectedPlanId
        ? await getPurchaseVerificationForPlan(selectedPlanId)
        : null;
      const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? plans[0];
      const declarationPreview =
        profile && isBusinessProfileComplete(profile) && selectedPlan
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
        plans,
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
