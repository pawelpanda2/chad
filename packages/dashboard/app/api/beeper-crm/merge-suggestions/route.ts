/**
 * GET /api/beeper-crm/merge-suggestions
 * Fuzzy-matched pairs of direct-DM contacts that might be the same person.
 */
import { NextResponse } from "next/server";
import { getBeeperMergeSuggestions, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  return runWithRepoContext(user, async () => {
    try {
      const suggestions = await getBeeperMergeSuggestions();
      return NextResponse.json(suggestions);
    } catch (error) {
      console.error("Error computing beeper merge suggestions:", error);
      return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
    }
  });
}
