/**
 * POST /api/leads/message-creator/ai
 *
 * Single AI actions endpoint for school operations (Story 84).
 * Returns PROMPT_NOT_CONFIGURED when school prompt is not wired — never fake scores.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  isMessageCreatorOperation,
  runMessageCreatorAiAction,
  runWithRepoContext,
} from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export async function POST(request: NextRequest) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      leadName?: string;
      leadLoca?: string;
      schoolId?: string;
      operation?: string;
      userInput?: string;
      force?: boolean;
    };

    if (!body.leadName || !body.leadLoca || !body.schoolId || !body.operation) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: leadName, leadLoca, schoolId, operation",
        },
        { status: 400 }
      );
    }
    if (!isMessageCreatorOperation(body.operation)) {
      return NextResponse.json({ success: false, error: "Invalid operation" }, { status: 400 });
    }

    const result = await runWithRepoContext(user, () =>
      runMessageCreatorAiAction({
        leadName: body.leadName!,
        leadLoca: body.leadLoca!,
        schoolId: body.schoolId!,
        operation: body.operation as Parameters<typeof runMessageCreatorAiAction>[0]["operation"],
        userInput: body.userInput,
        force: body.force ?? true,
      })
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[message-creator AI]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
