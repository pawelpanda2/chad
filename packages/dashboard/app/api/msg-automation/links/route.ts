/**
 * GET  /api/msg-automation/links — page data (leads, conversations, links)
 * POST /api/msg-automation/links — Save working links
 *
 * Thin adapters — business logic in dba/lead-beeper-links.ts (Story 90).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getLeadBeeperLinksPageData,
  saveLeadBeeperLinks,
  runWithRepoContext,
  LeadBeeperLinksError,
  type LeadBeeperLink,
} from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  try {
    const data = await runWithRepoContext(user, () => getLeadBeeperLinksPageData());
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[links GET]", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const input = body as { links?: unknown };
  if (!Array.isArray(input?.links)) {
    return NextResponse.json(
      { success: false, error: "Missing required field: links (array)" },
      { status: 400 }
    );
  }

  try {
    const data = await runWithRepoContext(user, () =>
      saveLeadBeeperLinks({ links: input.links as LeadBeeperLink[] })
    );
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[links POST]", error instanceof Error ? error.message : error);
    if (error instanceof LeadBeeperLinksError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
