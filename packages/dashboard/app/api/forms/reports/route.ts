import { NextResponse } from "next/server";
import { createReportEntry, updateReportEntry, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

/**
 * POST /api/forms/reports
 *
 * Saves a Reports form submission under views/reports.
 *
 * Request body:
 * { "content": "...", "loca"?: "07/04/01", "itemName"?: "26-05-06_dg_galeria mokotów" }
 *
 * - No `loca` (Create step): creates a new report via PostParentItem -> Put
 *   (chad-dba.createReportEntry), using `itemName` (required in this case)
 *   as the requested name — the response's `itemName` may differ from the
 *   requested one if a same-named report already existed (collision
 *   suffix, see report-entries.ts). The returned loca must be remembered by
 *   the client and sent back on every subsequent save so repeated saves
 *   never create duplicate reports.
 * - `loca` present (editor Save): updates the existing report via
 *   GetItem -> Put (chad-dba.updateReportEntry) — never PostParentItem,
 *   `itemName` is ignored (a report's identity is fixed at Create time).
 */
export async function POST(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  const payload = await request.json();
  const content = payload?.content;
  const loca = payload?.loca as string | undefined;
  const itemName = payload?.itemName as string | undefined;

  if (content === undefined || content === null || typeof content !== "string") {
    return NextResponse.json(
      { success: false, error: "Missing required parameter: content" },
      { status: 400 }
    );
  }

  try {
    if (loca) {
      await runWithRepoContext(user, () => updateReportEntry(loca, content));
      return NextResponse.json({ success: true, itemName: null, loca, path: "views/reports" });
    }

    if (!itemName || typeof itemName !== "string") {
      return NextResponse.json(
        { success: false, error: "Missing required parameter: itemName" },
        { status: 400 }
      );
    }

    const result = await runWithRepoContext(user, () => createReportEntry(content, itemName));
    return NextResponse.json({
      success: true,
      itemName: result.itemName,
      loca: result.loca,
      path: "views/reports",
    });
  } catch (error) {
    console.error("Error saving report:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
