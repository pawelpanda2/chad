import { describe, expect, it } from "vitest";
import {
  AI_PROMPT_KIND_OPTIONS,
  aiPromptKindLabel,
  normalizeAiPromptKind,
} from "./ai-prompt-kind";

describe("ai-prompt-kind mapping", () => {
  it("exposes lowercase our-custom / openai-published labels", () => {
    expect(AI_PROMPT_KIND_OPTIONS.map((o) => o.value).sort()).toEqual([
      "openai_managed",
      "our_custom",
    ]);
    expect(aiPromptKindLabel("our_custom")).toBe("our custom");
    expect(aiPromptKindLabel("openai_managed")).toBe("openai published");
  });

  it("normalizes legacy chad_custom and missing to our_custom", () => {
    expect(normalizeAiPromptKind(undefined)).toBe("our_custom");
    expect(normalizeAiPromptKind("chad_custom")).toBe("our_custom");
    expect(normalizeAiPromptKind("openai_managed")).toBe("openai_managed");
  });
});
