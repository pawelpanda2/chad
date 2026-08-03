/**
 * Lead analysis `<current_case>` prompt building — GUI equivalent of
 * `packages/console/src/openai/askOpenAiAboutGirl.ts`'s
 * `buildCurrentCasePromptFromData`. Pure, deterministic, no I/O — the only
 * place this text is assembled, so the AI Prompts conversation tab's "base
 * prompt preview" and the actual request sent to OpenAI are always built by
 * the exact same code (never re-implemented in React).
 */

export const DEFAULT_LEAD_ANALYSIS_QUESTION =
  "Przeanalizuj tę sytuację według materiału mentora i powiedz co teraz zrobić.";

export interface LeadAnalysisCurrentCaseInput {
  leadName: string;
  reportBody?: string | null;
  conversationBody?: string | null;
  question?: string;
}

/**
 * Builds the `<current_case>` block. Format matches console's
 * `buildCurrentCasePromptFromData` byte-for-byte: opening/closing tags,
 * `name:`, `report:`, `conversation:`, `my_question:`, blank-line spacing.
 * Missing report/conversation render as `[not found]` — never `undefined`.
 */
export function buildLeadAnalysisCurrentCase(input: LeadAnalysisCurrentCaseInput): string {
  const question = input.question?.trim() || DEFAULT_LEAD_ANALYSIS_QUESTION;
  const report = input.reportBody?.trim() ? input.reportBody : "[not found]";
  const conversation = input.conversationBody?.trim() ? input.conversationBody : "[not found]";

  return [
    "<current_case>",
    "",
    `name: ${input.leadName}`,
    "",
    "report:",
    report,
    "",
    "conversation:",
    conversation,
    "",
    "my_question:",
    question,
    "",
    "</current_case>",
  ].join("\n");
}

/**
 * Appends the AI Prompts conversation tab's "additional input" text-box
 * content to a base prompt. Never replaces the base prompt — only appended
 * inside a wrapping tag. Empty/whitespace-only input is a no-op, so an
 * untouched textarea sends exactly the base prompt.
 */
export function appendAdditionalUserInput(basePrompt: string, additionalUserInput?: string | null): string {
  const trimmed = additionalUserInput?.trim();
  if (!trimmed) return basePrompt;
  return `${basePrompt}\n\n<additional_user_input>\n${trimmed}\n</additional_user_input>`;
}
