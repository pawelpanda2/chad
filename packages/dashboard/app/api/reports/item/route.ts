import { NextRequest, NextResponse } from "next/server";
import { getReportTextByAddress, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

/**
 * GET /api/reports/item?address=…
 *
 * Full Text body for one report (Creator Your Pick / Views editor load).
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  const address = request.nextUrl.searchParams.get("address")?.trim() ?? "";
  if (!address) {
    return NextResponse.json({ success: false, error: "address is required" }, { status: 400 });
  }

  try {
    const item = await runWithRepoContext(user, () => getReportTextByAddress(address));
    if (!item) {
      return NextResponse.json({ success: false, error: "Report not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error("[reports/item GET]", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
