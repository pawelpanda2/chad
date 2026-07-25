/**
 * GET  /api/msg-automation/ai-prompts  — list (summaries only)
 * POST /api/msg-automation/ai-prompts  — create
 *
 * Thin adapters — all business logic (Content Provider find/create,
 * validation, versioning) lives in dba/ai-prompts.ts (Story 88).
 */

import { NextRequest, NextResponse } from "next/server";
import { listAiPrompts, createAiPrompt, runWithRepoContext, AiPromptsOperationError } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  try {
    const data = await runWithRepoContext(user, () => listAiPrompts());
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[ai-prompts GET]", error instanceof Error ? error.message : error);
    if (error instanceof AiPromptsOperationError && error.code === "CORRUPT_REGISTRY") {
      return NextResponse.json({ success: false, error: error.message }, { status: 422 });
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
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

  const input = body as Record<string, unknown>;
  if (
    typeof input?.slug !== "string" ||
    typeof input?.name !== "string" ||
    typeof input?.actionType !== "string" ||
    typeof input?.provider !== "string" ||
    !Array.isArray(input?.messages)
  ) {
    return NextResponse.json(
      { success: false, error: "Missing required fields: slug, name, actionType, provider, messages" },
      { status: 400 },
    );
  }

  try {
    const data = await runWithRepoContext(user, () =>
      createAiPrompt({
        slug: input.slug as string,
        name: input.name as string,
        description: typeof input.description === "string" ? input.description : undefined,
        schoolId: typeof input.schoolId === "string" ? input.schoolId : undefined,
        actionType: input.actionType as never,
        provider: input.provider as never,
        model: typeof input.model === "string" ? input.model : undefined,
        messages: input.messages as never,
        variables: Array.isArray(input.variables) ? (input.variables as never) : undefined,
        settings: (input.settings as never) ?? undefined,
        providerBindings: (input.providerBindings as never) ?? undefined,
      }),
    );
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[ai-prompts POST]", error instanceof Error ? error.message : error);
    if (error instanceof AiPromptsOperationError) {
      const status = error.code === "CORRUPT_REGISTRY" ? 422 : 400;
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status });
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
