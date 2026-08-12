import { NextRequest, NextResponse } from "next/server";
import { getDateReportTextByAddress, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

/**
 * GET /api/views/dates-reports/item?address=…
 *
 * Full body for a Text item under the caller's `randki` tree
 * (top-level Text report, or a part like before/after/report inside a Folder).
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
    const item = await runWithRepoContext(user, () => getDateReportTextByAddress(address));
    if (!item) {
      return NextResponse.json({ success: false, error: "Report not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error("[views/dates-reports/item GET]", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
