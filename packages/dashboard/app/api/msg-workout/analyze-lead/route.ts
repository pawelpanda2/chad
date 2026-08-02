/**
 * POST /api/msg-workout/analyze-lead — Story 99.
 *
 * Thin adapter only (endpoint-rules §2): resolves the lead's numeric loca
 * from the current user's own lead list, then delegates the entire
 * matching/linking/proposal flow to `dba`'s analyzeMsgWorkoutsForLead.
 */
import { NextResponse } from "next/server";
import { analyzeMsgWorkoutsForLead, getAllLeadsWithContacts, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export async function POST(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const leadName = typeof body?.leadName === "string" ? body.leadName.trim() : "";
  if (!leadName) {
    return NextResponse.json({ ok: false, error: "leadName is required" }, { status: 400 });
  }

  return runWithRepoContext(user, async () => {
    try {
      const leads = await getAllLeadsWithContacts();
      const lead = leads.find((l) => l.leadName === leadName);
      if (!lead) {
        return NextResponse.json({ ok: false, error: `Lead "${leadName}" not found` }, { status: 404 });
      }

      const summary = await analyzeMsgWorkoutsForLead(lead.leadName, lead.loca);
      return NextResponse.json({ ok: true, summary });
    } catch (error) {
      console.error(`Error analyzing msg workouts for lead ${leadName}:`, error);
      return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
    }
  });
}
