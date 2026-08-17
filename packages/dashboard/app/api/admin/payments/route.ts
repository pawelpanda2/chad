import { NextResponse } from "next/server";
import {
  createAdminTestCheckoutSession,
  getPaymentsForAdmin,
  LicenseCommerceError,
  runWithRepoContext,
} from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export async function GET(request: Request) {
  const currentUser = await getCurrentUserFromCookies();
  if (!currentUser || !currentUser.isAdmin) {
    return NextResponse.json({ error: "NOT_AUTHORIZED" }, { status: 403 });
  }

  const url = new URL(request.url);
  const repoGuid = url.searchParams.get("repoGuid");

  try {
    const payments = await getPaymentsForAdmin(200, {
      repoGuid: repoGuid && repoGuid !== "all" ? repoGuid : null,
    });
    return NextResponse.json({
      success: true,
      payments,
      currentUser: { repoGuid: currentUser.repoGuid, username: currentUser.username },
    });
  } catch (error) {
    console.error("[admin/payments]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Failed to load payments", payments: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUserFromCookies();
  if (!currentUser || !currentUser.isAdmin) {
    return NextResponse.json({ error: "NOT_AUTHORIZED" }, { status: 403 });
  }

  let body: { targetRepoGuid?: unknown; amountMajor?: unknown };
  try {
    body = (await request.json()) as { targetRepoGuid?: unknown; amountMajor?: unknown };
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const originUrl = new URL(request.url).origin;

  try {
    const result = await runWithRepoContext(currentUser, () =>
      createAdminTestCheckoutSession(originUrl, {
        targetRepoGuid: body.targetRepoGuid ?? currentUser.repoGuid,
        amountMajor: body.amountMajor ?? "30.00",
      }),
    );
    return NextResponse.json({ success: true, url: result.url });
  } catch (error) {
    if (error instanceof LicenseCommerceError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: 400 });
    }
    console.error("[admin/payments POST]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Failed to start test payment" }, { status: 500 });
  }
}
