/**
 * GET /api/beeper-crm/contacts/[id]/export
 * Renders the contact's profile + communication history as Markdown
 * (text/plain) for the "Copy for AI" dashboard button.
 */
import { NextResponse } from "next/server";
import { exportBeeperContactForAI, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const { id } = await params;
  return runWithRepoContext(user, async () => {
    try {
      const markdown = await exportBeeperContactForAI(id);
      return new NextResponse(markdown, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    } catch (error) {
      return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
    }
  });
}
