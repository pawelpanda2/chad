import { NextResponse } from "next/server";
import { listReportCategories, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

/**
 * GET /api/reports/categories
 *
 * Folder children of root logical `reports`, display names without leading `\d+\s+`.
 * Missing folder → success with [].
 */
export async function GET() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "Not authenticated", categories: [] }, { status: 401 });
  }

  try {
    const categories = await runWithRepoContext(user, () => listReportCategories());
    return NextResponse.json({ success: true, categories });
  } catch (error) {
    console.error("[reports/categories GET]", error instanceof Error ? error.message : error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        categories: [],
      },
      { status: 500 },
    );
  }
}
