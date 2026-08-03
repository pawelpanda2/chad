/**
 * POST /api/msg-automation/ai-prompts/[id]/run
 *
 * AI Prompts → editor → **conversation** tab: executes an already-saved
 * prompt (by id) with one explicit user-typed message. Thin adapter only —
 * reads the prompt through `dba` (`getAiPrompt`, scoped to the caller's own
 * repo via `runWithRepoContext`) and executes it through the existing
 * `ai-prompts-openai.ts` boundary (`executeAiPrompt`). Never accepts a full
 * prompt definition from the client, never a `repoGuid`, never returns the
 * API key. Does not save the result anywhere (Message Creator/Msg Workout
 * are separate save paths) — conversation here is a test/run surface only.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAiPrompt, executeAiPrompt, runWithRepoContext, AiPromptsOperationError } from "dba";
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
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const input = (body ?? {}) as Record<string, unknown>;
  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (!message) {
    return NextResponse.json({ success: false, error: "message is required" }, { status: 400 });
  }

  try {
    const data = await runWithRepoContext(user, async () => {
      const prompt = await getAiPrompt(id);
      if (!prompt) {
        throw new AiPromptsOperationError("NOT_FOUND", `No prompt with id "${id}"`);
      }
      return executeAiPrompt(prompt, {}, message);
    });
    // Stable contract regardless of outcome — the conversation UI switches
    // on `data.status` (complete / error / provider-not-configured); never a
    // 500 for an honest provider-not-configured or a model-side error.
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[ai-prompts/[id]/run POST]", error instanceof Error ? error.message : error);
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
