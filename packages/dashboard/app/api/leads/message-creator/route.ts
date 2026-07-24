/**
 * GET  /api/leads/message-creator?leadName=&leadLoca=
 * PUT  /api/leads/message-creator/approach  { leadLoca, text }
 * PUT  /api/leads/message-creator/proposals { leadLoca, text }
 *
 * Thin adapters — all business logic lives in dba/message-creator.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getMessageCreatorBootstrap,
  saveApproachContext,
  saveMyProposals,
  runWithRepoContext,
} from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const leadName = searchParams.get("leadName");
  const leadLoca = searchParams.get("leadLoca");
  if (!leadName || !leadLoca) {
    return NextResponse.json(
      { success: false, error: "Missing required parameters: leadName, leadLoca" },
      { status: 400 }
    );
  }

  try {
    const data = await runWithRepoContext(user, () =>
      getMessageCreatorBootstrap(leadName, leadLoca)
    );
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[message-creator GET]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      kind?: "approach" | "proposals";
      leadLoca?: string;
      text?: string;
    };
    if (!body.leadLoca || typeof body.text !== "string" || !body.kind) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: kind, leadLoca, text" },
        { status: 400 }
      );
    }

    if (body.kind === "approach") {
      const result = await runWithRepoContext(user, () =>
        saveApproachContext(body.leadLoca!, body.text!)
      );
      return NextResponse.json({ success: true, data: result });
    }
    if (body.kind === "proposals") {
      const result = await runWithRepoContext(user, () =>
        saveMyProposals(body.leadLoca!, body.text!)
      );
      return NextResponse.json({ success: true, data: result });
    }

    return NextResponse.json({ success: false, error: "Invalid kind" }, { status: 400 });
  } catch (error) {
    console.error("[message-creator PUT]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
