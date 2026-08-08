/**
 * GET /api/leads/archives/counts — `{ [leadUuid]: count }` for the current user.
 */
import { NextResponse } from "next/server";
import {
  getAllLeadsWithContacts,
  LeadArchiveError,
  listLeadArchiveCounts,
  runWithRepoContext,
} from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  try {
    const counts = await runWithRepoContext(user, async () => {
      const leads = await getAllLeadsWithContacts();
      const locaToLeadUuid: Record<string, string> = {};
      for (const lead of leads) {
        locaToLeadUuid[lead.loca] = lead.leadUuid;
      }
      return listLeadArchiveCounts({ locaToLeadUuid });
    });
    return NextResponse.json({ success: true, counts });
  } catch (error) {
    if (error instanceof LeadArchiveError && error.code === "NOT_CONFIGURED") {
      return NextResponse.json({ success: true, counts: {} });
    }
    console.error("[leads archives counts GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Could not load archive counts" }, { status: 500 });
  }
}
