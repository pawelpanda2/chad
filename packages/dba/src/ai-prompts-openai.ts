/**
 * AI Prompts — provider execution adapters (Story 88).
 *
 * The domain model (`ai-prompts.ts`) never imports `openai` or any other
 * provider SDK — this file is the only place that translates
 * `AiPromptDefinition` into a concrete provider request. Execution is
 * server-side only (this module lives in `packages/dba`, never imported by
 * client components) and the API key is read exclusively from
 * `process.env.OPENAI_API_KEY` — never accepted as a parameter, never
 * echoed back in a result.
 *
 * Mirrors the one existing OpenAI integration in the repo,
 * `packages/console/src/openai/askOpenAiAboutGirl.ts`'s
 * `callOpenAiPreparedPrompt` (Responses API, `openai.responses.create`).
 */

import OpenAI from "openai";
import type { AiPromptDefinition, AiPromptMessage } from "./ai-prompts.js";

export type AiPromptExecutionStatus = "complete" | "error" | "provider-not-configured";

export interface AiPromptExecutionResult {
  status: AiPromptExecutionStatus;
  outputText?: string;
  error?: string;
}

/** Replaces `{{key}}` occurrences with `variables[key]` (missing → empty string). */
export function substituteVariables(content: string, variables: Record<string, string>): string {
  return content.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => variables[key] ?? "");
}

function buildInputMessages(
  messages: AiPromptMessage[],
  variables: Record<string, string>,
): Array<{ role: "developer" | "system" | "user"; content: string }> {
  return messages
    .filter((m) => m.content.trim())
    .map((m) => ({ role: m.role, content: substituteVariables(m.content, variables) }));
}

async function executeOpenAiPrompt(
  promptDefinition: AiPromptDefinition,
  variables: Record<string, string>,
): Promise<AiPromptExecutionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { status: "provider-not-configured", error: "OPENAI_API_KEY is not set" };
  }

  const openai = new OpenAI({ apiKey });

  try {
    if (promptDefinition.providerBindings?.openaiPromptId) {
      // Variant B — a prompt already saved/versioned on OpenAI's side.
      const userMessage = buildInputMessages(promptDefinition.messages, variables).find(
        (m) => m.role === "user",
      );
      const response = await openai.responses.create({
        prompt: {
          id: promptDefinition.providerBindings.openaiPromptId,
          version: promptDefinition.providerBindings.openaiPromptVersion,
        },
        input: userMessage?.content ?? "",
      });
      return { status: "complete", outputText: response.output_text || undefined };
    }

    // Variant A — role/messages + settings built from the locally stored prompt.
    const settings = promptDefinition.settings;
    const response = await openai.responses.create({
      model: promptDefinition.model || "gpt-4o",
      input: buildInputMessages(promptDefinition.messages, variables),
      ...(settings?.textFormat === "json_schema" && settings.outputSchema
        ? {
            text: {
              format: {
                type: "json_schema" as const,
                name: "output",
                schema: settings.outputSchema as Record<string, unknown>,
                strict: false,
              },
            },
          }
        : {}),
      ...(settings?.reasoningEffort
        ? { reasoning: { effort: settings.reasoningEffort as "low" | "medium" | "high", summary: (settings.summary as "auto" | "concise" | "detailed") ?? "auto" } }
        : {}),
    });
    return { status: "complete", outputText: response.output_text || undefined };
  } catch (error) {
    return { status: "error", error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Dispatches execution by `promptDefinition.provider`. Only `openai` is
 * fully implemented in this Story (matches input §11 — "pełne wykonanie
 * requestu wymagane jest przede wszystkim dla OpenAI"); every other
 * provider shares this same boundary and honestly reports
 * `provider-not-configured` rather than faking a response.
 */
export async function executeAiPrompt(
  promptDefinition: AiPromptDefinition,
  variables: Record<string, string> = {},
): Promise<AiPromptExecutionResult> {
  switch (promptDefinition.provider) {
    case "openai":
      return executeOpenAiPrompt(promptDefinition, variables);
    case "anthropic":
    case "gemini":
    case "openai-compatible":
      return {
        status: "provider-not-configured",
        error: `Provider "${promptDefinition.provider}" is not configured yet`,
      };
    default:
      return { status: "provider-not-configured", error: "Unknown provider" };
  }
}
