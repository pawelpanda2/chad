import { NextRequest, NextResponse } from "next/server";
import { listDateReportChildren, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

/**
 * GET /api/views/dates-reports/children?address=…
 *
 * Direct children (before / after / report / …) of a Folder under `randki`.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "Not authenticated", children: [] }, { status: 401 });
  }

  const address = request.nextUrl.searchParams.get("address")?.trim() ?? "";
  if (!address) {
    return NextResponse.json({ success: false, error: "address is required", children: [] }, { status: 400 });
  }

  try {
    const children = await runWithRepoContext(user, () => listDateReportChildren(address));
    return NextResponse.json({ success: true, children });
  } catch (error) {
    console.error("[views/dates-reports/children GET]", error instanceof Error ? error.message : error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        children: [],
      },
      { status: 500 },
    );
  }
}
