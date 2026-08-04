import { NextRequest, NextResponse } from "next/server";
import { listReportsInCategory, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

/**
 * GET /api/reports?category=<address>
 *
 * Text children of the selected reports category folder. No full bodies —
 * only name/address/loca/optional preview.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "Not authenticated", reports: [] }, { status: 401 });
  }

  const category = request.nextUrl.searchParams.get("category")?.trim() ?? "";
  if (!category) {
    return NextResponse.json({ success: false, error: "category is required", reports: [] }, { status: 400 });
  }

  try {
    const reports = await runWithRepoContext(user, () => listReportsInCategory(category));
    return NextResponse.json({ success: true, reports });
  } catch (error) {
    console.error("[reports GET]", error instanceof Error ? error.message : error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        reports: [],
      },
      { status: 500 },
    );
  }
}
