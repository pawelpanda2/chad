/**
 * POST /api/msg-automation/ai-prompts/[id]/test
 *
 * Explicit draft/preview execution — does NOT publish and does NOT write an
 * analysis run. Thin adapter → dba.executeAiPrompt. OPENAI_API_KEY stays
 * server-side only.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getAiPrompt,
  executeAiPrompt,
  runWithRepoContext,
  AiPromptsOperationError,
} from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const input = (body ?? {}) as { variables?: Record<string, string> };
  const variables =
    input.variables && typeof input.variables === "object" && !Array.isArray(input.variables)
      ? Object.fromEntries(
          Object.entries(input.variables).map(([k, v]) => [k, typeof v === "string" ? v : String(v ?? "")]),
        )
      : {};

  try {
    const result = await runWithRepoContext(user, async () => {
      const prompt = await getAiPrompt(id);
      if (!prompt) {
        throw new AiPromptsOperationError("NOT_FOUND", `No prompt with id "${id}"`);
      }
      return executeAiPrompt(prompt, variables);
    });

    return NextResponse.json({
      success: result.status === "complete",
      status: result.status,
      outputText: result.outputText ?? null,
      error: result.error ?? null,
    });
  } catch (error) {
    console.error("[ai-prompts/[id]/test POST]", error instanceof Error ? error.message : error);
    if (error instanceof AiPromptsOperationError) {
      const status =
        error.code === "NOT_FOUND" ? 404 : error.code === "CORRUPT_REGISTRY" ? 422 : 400;
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status });
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
