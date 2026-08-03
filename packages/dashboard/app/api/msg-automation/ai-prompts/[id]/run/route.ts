/**
 * POST /api/msg-automation/ai-prompts/[id]/run
 *
 * AI Prompts → editor → **conversation** tab: executes an already-saved
 * prompt (by id) against a lead analysis request — GUI equivalent of
 * console's `askOpenAiAboutGirlFlow` → `callOpenAiPreparedPrompt`. Never a
 * plain freestanding chat message: `leadName` is required, and the
 * `<current_case>` sent to OpenAI is always assembled server-side from
 * `reportBody`/`conversationBody` (the caller's selection — "none" is
 * `null`/omitted) via `buildLeadAnalysisCurrentCase`, then
 * `appendAdditionalUserInput` appends (never replaces) the optional
 * free-text `additionalUserInput`. This is the *only* place that text is
 * assembled for the real request — the client's "final prompt preview" is
 * a separate, side-effect-free call to `lead-context/preview` that uses the
 * exact same two functions, so preview and actual request can never drift.
 *
 * Otherwise unchanged: reads the prompt through `dba` (`getAiPrompt`,
 * scoped to the caller's own repo via `runWithRepoContext`) and executes it
 * through the existing `ai-prompts-openai.ts` boundary (`executeAiPrompt`).
 * Never accepts a full prompt definition from the client, never a
 * `repoGuid`, never returns the API key. Does not save the result anywhere
 * (Message Creator/Msg Workout are separate save paths) — conversation here
 * is a test/run surface only.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getAiPrompt,
  executeAiPrompt,
  runWithRepoContext,
  AiPromptsOperationError,
  buildLeadAnalysisCurrentCase,
  appendAdditionalUserInput,
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
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const input = (body ?? {}) as Record<string, unknown>;
  const leadName = typeof input.leadName === "string" ? input.leadName.trim() : "";
  if (!leadName) {
    return NextResponse.json({ success: false, error: "leadName is required" }, { status: 400 });
  }
  const reportBody = typeof input.reportBody === "string" ? input.reportBody : null;
  const conversationBody = typeof input.conversationBody === "string" ? input.conversationBody : null;
  const additionalUserInput = typeof input.additionalUserInput === "string" ? input.additionalUserInput : "";

  const basePrompt = buildLeadAnalysisCurrentCase({ leadName, reportBody, conversationBody });
  const message = appendAdditionalUserInput(basePrompt, additionalUserInput);

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
