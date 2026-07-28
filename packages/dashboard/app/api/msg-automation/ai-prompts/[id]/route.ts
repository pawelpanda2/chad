/**
 * GET    /api/msg-automation/ai-prompts/[id]
 * PATCH  /api/msg-automation/ai-prompts/[id] — update / publish / archive
 * DELETE /api/msg-automation/ai-prompts/[id] — remove from registry
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getAiPrompt,
  updateAiPrompt,
  publishAiPrompt,
  archiveAiPrompt,
  deleteAiPrompt,
  runWithRepoContext,
  AiPromptsOperationError,
} from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }
  const { id } = await params;

  try {
    const data = await runWithRepoContext(user, () => getAiPrompt(id));
    if (!data) {
      return NextResponse.json({ success: false, error: "Prompt not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[ai-prompts/[id] GET]", error instanceof Error ? error.message : error);
    if (error instanceof AiPromptsOperationError && error.code === "CORRUPT_REGISTRY") {
      return NextResponse.json({ success: false, error: error.message }, { status: 422 });
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const input = (body ?? {}) as Record<string, unknown>;

  try {
    if (input.action === "publish") {
      const data = await runWithRepoContext(user, () => publishAiPrompt(id));
      return NextResponse.json({ success: true, data });
    }
    if (input.action === "archive") {
      const data = await runWithRepoContext(user, () => archiveAiPrompt(id));
      return NextResponse.json({ success: true, data });
    }

    const data = await runWithRepoContext(user, () =>
      updateAiPrompt(id, {
        slug: typeof input.slug === "string" ? input.slug : undefined,
        name: typeof input.name === "string" ? input.name : undefined,
        description: typeof input.description === "string" ? input.description : undefined,
        schoolId: typeof input.schoolId === "string" ? input.schoolId : undefined,
        actionType: typeof input.actionType === "string" ? (input.actionType as never) : undefined,
        promptKind: typeof input.promptKind === "string" ? (input.promptKind as never) : undefined,
        enabled: typeof input.enabled === "boolean" ? input.enabled : undefined,
        tags: Array.isArray(input.tags) ? (input.tags as string[]) : undefined,
        provider: typeof input.provider === "string" ? (input.provider as never) : undefined,
        model: typeof input.model === "string" ? input.model : undefined,
        messages: Array.isArray(input.messages) ? (input.messages as never) : undefined,
        variables: Array.isArray(input.variables) ? (input.variables as never) : undefined,
        settings: input.settings !== undefined ? (input.settings as never) : undefined,
        providerBindings: input.providerBindings !== undefined ? (input.providerBindings as never) : undefined,
      }),
    );
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[ai-prompts/[id] PATCH]", error instanceof Error ? error.message : error);
    if (error instanceof AiPromptsOperationError) {
      const status = error.code === "NOT_FOUND" ? 404 : error.code === "CORRUPT_REGISTRY" ? 422 : 400;
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status });
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }
  const { id } = await params;

  try {
    await runWithRepoContext(user, () => deleteAiPrompt(id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ai-prompts/[id] DELETE]", error instanceof Error ? error.message : error);
    if (error instanceof AiPromptsOperationError) {
      const status = error.code === "NOT_FOUND" ? 404 : error.code === "CORRUPT_REGISTRY" ? 422 : 400;
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status });
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
