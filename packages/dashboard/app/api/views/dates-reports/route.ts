import { NextResponse } from "next/server";
import { listDateReports, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

/**
 * GET /api/views/dates-reports
 *
 * Lists date (randka) reports under root logical folder `randki` for the
 * authenticated user's repo. No full bodies.
 */
export async function GET() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "Not authenticated", reports: [] }, { status: 401 });
  }

  try {
    const reports = await runWithRepoContext(user, () => listDateReports());
    return NextResponse.json({ success: true, reports });
  } catch (error) {
    console.error("[views/dates-reports GET]", error instanceof Error ? error.message : error);
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
