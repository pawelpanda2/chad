/**
 * POST /api/leads/message-creator/ai
 *
 * Story 84 school operations + Story 85 message-level Send new.
 * Thin adapter — logic in dba/message-creator.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  isMessageCreatorOperation,
  runMessageCreatorAiAction,
  runWithRepoContext,
  type MessageCreatorOperation,
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
      promptVersionId?: string;
      operation?: string;
      userInput?: string;
      force?: boolean;
      targetMessageId?: string;
      modelId?: string;
    };

    if (!body.leadName || !body.leadLoca) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: leadName, leadLoca" },
        { status: 400 }
      );
    }

    if (!body.promptVersionId && !body.schoolId) {
      return NextResponse.json(
        { success: false, error: "Missing promptVersionId or schoolId" },
        { status: 400 }
      );
    }

    const operation: MessageCreatorOperation =
      body.operation && isMessageCreatorOperation(body.operation)
        ? body.operation
        : "full-analysis";

    if (body.operation && !isMessageCreatorOperation(body.operation)) {
      return NextResponse.json({ success: false, error: "Invalid operation" }, { status: 400 });
    }

    const result = await runWithRepoContext(user, () =>
      runMessageCreatorAiAction({
        leadName: body.leadName!,
        leadLoca: body.leadLoca!,
        schoolId: body.schoolId,
        promptVersionId: body.promptVersionId,
        operation,
        userInput: body.userInput,
        force: body.force ?? true,
        targetMessageId: body.targetMessageId,
        modelId: body.modelId,
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
