import { NextResponse } from "next/server";
import { getAllReportEntries, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

/**
 * GET /api/views/reports
 *
 * Retrieves all saved reports (views/reports) for the Reports view, each
 * with its full body already fetched (same shape/approach as
 * getAllDateEntries/getAllDailyEntries used by /api/views).
 *
 * Response distinguishes three states so the UI never masks an error as an
 * empty list:
 * - success:true, reports:[]            -> folder exists, genuinely empty
 * - success:true, reports:[ ... ]       -> folder exists, has reports
 * - success:false, error:"..."          -> folder not found, or Content
 *                                          Provider call failed
 */
export async function GET() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json(
      { success: false, error: "Not authenticated", reports: [] },
      { status: 401 }
    );
  }

  try {
    const reports = await runWithRepoContext(user, () => getAllReportEntries());
    return NextResponse.json({ success: true, reports });
  } catch (error) {
    console.error("Error fetching reports:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        reports: [],
      },
      { status: 500 }
    );
  }
}
