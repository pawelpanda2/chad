/**
 * Unit tests for OpenAI stored-prompt Responses request building
 * (prompt.id / version / message-array input + settings).
 */
import { describe, it, expect } from "vitest";
import {
  buildOpenAiStoredPromptCreateParams,
  substituteVariables,
  resolveAiPromptUserContent,
} from "./ai-prompts-openai.js";
import type { AiPromptDefinition } from "./ai-prompts.js";

const CURRENT_CASE = `<current_case>

name: {{leadName}}

report:
{{report}}

conversation:
{{conversation}}

my_question:
{{question}}

</current_case>`;

function managedDef(over: Partial<AiPromptDefinition> = {}): AiPromptDefinition {
  return {
    id: "x",
    slug: "s",
    name: "n",
    actionType: "custom",
    status: "draft",
    version: 1,
    messages: [{ role: "user", content: CURRENT_CASE }],
    variables: [],
    provider: "openai",
    settings: { summary: "auto", storeLogs: true },
    providerBindings: {
      openaiPromptId: "pmpt_6a2d9932e7708197bf9a60767e94dcfb07c8292b52f64217",
      openaiPromptVersion: "1",
    },
    createdAt: "",
    updatedAt: "",
    ...over,
  };
}

describe("buildOpenAiStoredPromptCreateParams", () => {
  it("sets prompt id, version, message-array input, and supported settings", () => {
    const params = buildOpenAiStoredPromptCreateParams(managedDef(), {
      leadName: "Ada",
      report: "rep-body",
      conversation: "hi",
      question: "co teraz?",
    });

    expect(params.prompt).toEqual({
      id: "pmpt_6a2d9932e7708197bf9a60767e94dcfb07c8292b52f64217",
      version: "1",
    });
    expect(params.input).toHaveLength(1);
    expect(params.input[0].role).toBe("user");
    expect(params.input[0].content).toContain("name: Ada");
    expect(params.input[0].content).toContain("rep-body");
    expect(params.input[0].content).toContain("my_question:");
    expect(params.reasoning).toEqual({ summary: "auto" });
    expect(params.store).toBe(true);
    expect(params.include).toEqual(["web_search_call.action.sources"]);
    expect(JSON.stringify(params)).not.toMatch(/sk-|api[_-]?key/i);
  });

  it("substitutes variables in the user template", () => {
    const out = substituteVariables(CURRENT_CASE, {
      leadName: "X",
      report: "R",
      conversation: "C",
      question: "Q",
    });
    expect(out).toContain("name: X");
    expect(out).toContain("R");
    expect(out).toContain("C");
    expect(out).toContain("Q");
  });

  it("uses empty user content when messages are empty", () => {
    const content = resolveAiPromptUserContent(managedDef({ messages: [] }), {
      leadName: "L",
    });
    expect(content).toBe("");
  });
});
