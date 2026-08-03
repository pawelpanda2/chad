/**
 * Unit tests for OpenAI stored-prompt Responses request building
 * (prompt.id / version / message-array input + settings).
 */
import { describe, it, expect } from "vitest";
import {
  buildOpenAiStoredPromptCreateParams,
  buildLocalPromptInputMessages,
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

  it("conversation tab: a raw userMessage bypasses template substitution entirely", () => {
    const params = buildOpenAiStoredPromptCreateParams(
      managedDef(),
      { leadName: "Ada", report: "rep-body", conversation: "hi", question: "co teraz?" },
      "Cześć, jak się masz?",
    );
    expect(params.input).toHaveLength(1);
    expect(params.input[0].content).toBe("Cześć, jak się masz?");
    expect(params.input[0].content).not.toContain("current_case");
  });

  it("falls back to the template when userMessage is empty/whitespace", () => {
    const params = buildOpenAiStoredPromptCreateParams(
      managedDef(),
      { leadName: "Ada", report: "r", conversation: "c", question: "q" },
      "   ",
    );
    expect(params.input[0].content).toContain("name: Ada");
  });
});

describe("buildLocalPromptInputMessages (our_custom conversation tab)", () => {
  function customDef(over: Partial<AiPromptDefinition> = {}): AiPromptDefinition {
    return {
      id: "x",
      slug: "s",
      name: "n",
      actionType: "custom",
      promptKind: "our_custom",
      status: "draft",
      version: 1,
      messages: [{ role: "developer", content: "You are a helpful assistant." }],
      variables: [],
      provider: "openai",
      createdAt: "",
      updatedAt: "",
      ...over,
    };
  }

  it("appends the conversation-tab message as a genuine trailing user turn", () => {
    const input = buildLocalPromptInputMessages(customDef(), {}, "Hello there");
    expect(input).toHaveLength(2);
    expect(input[0]).toEqual({ role: "developer", content: "You are a helpful assistant." });
    expect(input[1]).toEqual({ role: "user", content: "Hello there" });
  });

  it("never runs {{variable}} substitution on the raw user turn", () => {
    const input = buildLocalPromptInputMessages(customDef(), {}, "literal {{leadName}} text");
    expect(input[1].content).toBe("literal {{leadName}} text");
  });

  it("omits the trailing user turn when no message is given", () => {
    const input = buildLocalPromptInputMessages(customDef(), {});
    expect(input).toHaveLength(1);
  });
});
