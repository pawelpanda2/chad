import { NextResponse } from "next/server";
import { getPaymentsForAdmin } from "dba";
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
    const payments = await getPaymentsForAdmin(200, {
      repoGuid: repoGuid && repoGuid !== "all" ? repoGuid : null,
    });
    return NextResponse.json({ success: true, payments });
  } catch (error) {
    console.error("[admin/payments]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Failed to load payments", payments: [] }, { status: 500 });
  }
}
