/**
 * AI Prompts — provider execution adapters (Story 88 + console OpenAI parity).
 *
 * The domain model (`ai-prompts.ts`) never imports `openai` or any other
 * provider SDK — this file is the only place that translates
 * `AiPromptDefinition` into a concrete provider request. Execution is
 * server-side only (this module lives in `packages/dba`, never imported by
 * client components) and the API key is read exclusively from
 * `process.env.OPENAI_API_KEY` — never accepted as a parameter, never
 * echoed back in a result.
 *
 * OpenAI stored-prompt request shape mirrors
 * `packages/console/src/openai/askOpenAiAboutGirl.ts`'s
 * `callOpenAiPreparedPrompt` (Responses API).
 */

import OpenAI from "openai";
import type { AiPromptDefinition, AiPromptMessage, AiPromptSettings } from "./ai-prompts.js";

export type AiPromptExecutionStatus = "complete" | "error" | "provider-not-configured";

export interface AiPromptExecutionResult {
  status: AiPromptExecutionStatus;
  outputText?: string;
  error?: string;
}

/**
 * Default user-message template for Message Creator / console-style case analysis.
 * Neutral placeholders — not bound to console `GirlData` types.
 */
export const DEFAULT_CURRENT_CASE_USER_TEMPLATE = `<current_case>

name: {{leadName}}

report:
{{report}}

conversation:
{{conversation}}

my_question:
{{question}}

</current_case>`;

/** Default question used by the console full-analysis flow when user_input is empty. */
export const DEFAULT_FULL_ANALYSIS_QUESTION =
  "Przeanalizuj tę sytuację według materiału mentora i powiedz co teraz zrobić.";

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

/**
 * Resolves the user content string sent as Responses API `input` for a
 * stored OpenAI prompt (or as the user turn for a local prompt).
 * Empty messages → DEFAULT_CURRENT_CASE_USER_TEMPLATE (openai_managed).
 */
export function resolveAiPromptUserContent(
  promptDefinition: AiPromptDefinition,
  variables: Record<string, string>,
): string {
  const userMessage = buildInputMessages(promptDefinition.messages, variables).find(
    (m) => m.role === "user",
  );
  if (userMessage?.content.trim()) return userMessage.content;
  return substituteVariables(DEFAULT_CURRENT_CASE_USER_TEMPLATE, variables);
}

export type OpenAiStoredPromptCreateParams = {
  prompt: { id: string; version?: string };
  input: Array<{ role: "user"; content: string }>;
  reasoning: { summary: "auto" | "concise" | "detailed" };
  store: boolean;
  include: Array<"web_search_call.action.sources" | "reasoning.encrypted_content">;
};

/**
 * Builds the OpenAI Responses create payload for a **stored** prompt —
 * pure, no network, no API key. Used by execute + unit tests.
 *
 * Deliberately omits `reasoning.encrypted_content` by default (we only need
 * `output_text` in CHAD). Includes web_search sources so hosted web-search
 * tools on the OpenAI prompt keep working.
 */
export function buildOpenAiStoredPromptCreateParams(
  promptDefinition: AiPromptDefinition,
  variables: Record<string, string>,
): OpenAiStoredPromptCreateParams {
  const openaiPromptId = promptDefinition.providerBindings?.openaiPromptId?.trim();
  if (!openaiPromptId) {
    throw new Error("openaiPromptId is required for stored-prompt request");
  }
  const settings: AiPromptSettings | undefined = promptDefinition.settings;
  const summaryRaw = settings?.summary;
  const summary: "auto" | "concise" | "detailed" =
    summaryRaw === "concise" || summaryRaw === "detailed" || summaryRaw === "auto"
      ? summaryRaw
      : "auto";

  return {
    prompt: {
      id: openaiPromptId,
      version: promptDefinition.providerBindings?.openaiPromptVersion?.trim() || undefined,
    },
    input: [
      {
        role: "user",
        content: resolveAiPromptUserContent(promptDefinition, variables),
      },
    ],
    reasoning: { summary },
    store: settings?.storeLogs !== false,
    include: ["web_search_call.action.sources"],
  };
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
    if (promptDefinition.providerBindings?.openaiPromptId?.trim()) {
      const params = buildOpenAiStoredPromptCreateParams(promptDefinition, variables);
      const response = await openai.responses.create(params);
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
        ? {
            reasoning: {
              effort: settings.reasoningEffort as "low" | "medium" | "high",
              summary: (settings.summary as "auto" | "concise" | "detailed") ?? "auto",
            },
          }
        : {}),
    });
    return { status: "complete", outputText: response.output_text || undefined };
  } catch (error) {
    return { status: "error", error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Dispatches execution by `promptDefinition.provider`. Only `openai` is
 * fully implemented; every other provider shares this same boundary and
 * honestly reports `provider-not-configured` rather than faking a response.
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
