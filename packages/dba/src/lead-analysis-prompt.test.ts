import { describe, it, expect } from "vitest";
import {
  buildLeadAnalysisCurrentCase,
  appendAdditionalUserInput,
  DEFAULT_LEAD_ANALYSIS_QUESTION,
} from "./lead-analysis-prompt.js";

describe("buildLeadAnalysisCurrentCase", () => {
  it("builds the exact console format when report and conversation are found", () => {
    const out = buildLeadAnalysisCurrentCase({
      leadName: "26-02-17_pi_Ira_Babenko",
      reportBody: "report body text",
      conversationBody: "conversation body text",
    });

    expect(out).toBe(
      [
        "<current_case>",
        "",
        "name: 26-02-17_pi_Ira_Babenko",
        "",
        "report:",
        "report body text",
        "",
        "conversation:",
        "conversation body text",
        "",
        "my_question:",
        DEFAULT_LEAD_ANALYSIS_QUESTION,
        "",
        "</current_case>",
      ].join("\n")
    );
  });

  it("renders [not found] for a missing report, never undefined", () => {
    const out = buildLeadAnalysisCurrentCase({
      leadName: "Ada",
      reportBody: null,
      conversationBody: "hi",
    });
    expect(out).toContain("report:\n[not found]");
    expect(out).not.toContain("undefined");
  });

  it("renders [not found] for a missing conversation, never undefined", () => {
    const out = buildLeadAnalysisCurrentCase({
      leadName: "Ada",
      reportBody: "r",
      conversationBody: undefined,
    });
    expect(out).toContain("conversation:\n[not found]");
    expect(out).not.toContain("undefined");
  });

  it("treats whitespace-only report/conversation as not found", () => {
    const out = buildLeadAnalysisCurrentCase({
      leadName: "Ada",
      reportBody: "   ",
      conversationBody: "\n\n",
    });
    expect(out).toContain("report:\n[not found]");
    expect(out).toContain("conversation:\n[not found]");
  });

  it("uses the console default question when none is given", () => {
    const out = buildLeadAnalysisCurrentCase({ leadName: "Ada" });
    expect(out).toContain(DEFAULT_LEAD_ANALYSIS_QUESTION);
  });

  it("allows overriding the question", () => {
    const out = buildLeadAnalysisCurrentCase({ leadName: "Ada", question: "custom?" });
    expect(out).toContain("my_question:\ncustom?");
    expect(out).not.toContain(DEFAULT_LEAD_ANALYSIS_QUESTION);
  });

  it("is deterministic for the same input", () => {
    const input = { leadName: "Ada", reportBody: "r", conversationBody: "c" };
    expect(buildLeadAnalysisCurrentCase(input)).toBe(buildLeadAnalysisCurrentCase(input));
  });
});

describe("appendAdditionalUserInput", () => {
  it("returns the base prompt unchanged when additional input is empty/undefined", () => {
    const base = "<current_case>...</current_case>";
    expect(appendAdditionalUserInput(base)).toBe(base);
    expect(appendAdditionalUserInput(base, "")).toBe(base);
    expect(appendAdditionalUserInput(base, "   ")).toBe(base);
    expect(appendAdditionalUserInput(base, null)).toBe(base);
  });

  it("appends, never replaces, the base prompt", () => {
    const base = "<current_case>\nname: Ada\n</current_case>";
    const out = appendAdditionalUserInput(base, "what should I say next?");
    expect(out.startsWith(base)).toBe(true);
    expect(out).toContain("<additional_user_input>\nwhat should I say next?\n</additional_user_input>");
  });

  it("trims surrounding whitespace from the additional input", () => {
    const out = appendAdditionalUserInput("base", "  hello  ");
    expect(out).toContain("<additional_user_input>\nhello\n</additional_user_input>");
  });
});
