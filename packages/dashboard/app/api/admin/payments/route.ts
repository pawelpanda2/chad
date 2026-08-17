import { NextResponse } from "next/server";
import {
  createAdminTestPayment,
  getPaymentsForAdmin,
  LicenseCommerceError,
  listActiveLicensePlans,
  runWithRepoContext,
} from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

/**
 * GET /api/admin/payments?repoGuid=...
 * Admin → Payments — read-only transaction list. Optional `repoGuid` filters
 * in DBA/Postgres. Same admin-only gate as /api/admin/users.
 */
export async function GET(request: Request) {
  const currentUser = await getCurrentUserFromCookies();
  if (!currentUser || !currentUser.isAdmin) {
    return NextResponse.json({ error: "NOT_AUTHORIZED" }, { status: 403 });
  }

  const url = new URL(request.url);
  const repoGuid = url.searchParams.get("repoGuid");

  try {
    const [payments, plans] = await Promise.all([
      getPaymentsForAdmin(200, {
        repoGuid: repoGuid && repoGuid !== "all" ? repoGuid : null,
      }),
      listActiveLicensePlans(),
    ]);
    return NextResponse.json({
      success: true,
      payments,
      plans,
      currentUser: { repoGuid: currentUser.repoGuid, username: currentUser.username },
    });
  } catch (error) {
    console.error("[admin/payments]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Failed to load payments", payments: [] }, { status: 500 });
  }
}

/**
 * POST /api/admin/payments
 * Body: { targetRepoGuid, planId } — creates a TEST payment without charging.
 */
export async function POST(request: Request) {
  const currentUser = await getCurrentUserFromCookies();
  if (!currentUser || !currentUser.isAdmin) {
    return NextResponse.json({ error: "NOT_AUTHORIZED" }, { status: 403 });
  }

  let body: { targetRepoGuid?: unknown; planId?: unknown };
  try {
    body = (await request.json()) as { targetRepoGuid?: unknown; planId?: unknown };
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const payment = await runWithRepoContext(currentUser, () =>
      createAdminTestPayment({
        targetRepoGuid: body.targetRepoGuid,
        planId: body.planId,
      }),
    );
    return NextResponse.json({ success: true, payment });
  } catch (error) {
    if (error instanceof LicenseCommerceError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: 400 });
    }
    console.error("[admin/payments POST]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Failed to create test payment" }, { status: 500 });
  }
}
