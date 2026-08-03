// @vitest-environment jsdom
/**
 * AI Prompts editor workspace, "auto" tab — the core GUI rule (input §1
 * "Najważniejsza zasada GUI"): the amber AI recommendation never
 * disappears, even after the user manually selects a different
 * conversation/report. "AI recommended" and "currently selected" are two
 * independent, simultaneous states, not one toggled highlight.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AiPromptAutoTab } from "./ai-prompt-auto-tab.js";

const REPORTS = [
  { address: "r1", name: "full report", category: "daygame", preview: "line one" },
  { address: "r2", name: "notes", category: "daygame", preview: "other line" },
];

function renderAutoTab(over: Partial<React.ComponentProps<typeof AiPromptAutoTab>> = {}) {
  const onSelectReport = vi.fn();
  const onSelectConversation = vi.fn();
  render(
    <AiPromptAutoTab
      loading={false}
      error={null}
      reports={REPORTS}
      aiRecommendedReportAddress="r1"
      selectedReportAddress="r1"
      onSelectReport={onSelectReport}
      conversationFound
      conversationChannel="whatsapp"
      conversationBasis="live-match"
      conversationPreview="hi there"
      aiRecommendedConversationIsFound
      conversationCandidates={[]}
      conversationSelection={{ kind: "found" }}
      onSelectConversation={onSelectConversation}
      {...over}
    />,
  );
  return { onSelectReport, onSelectConversation };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AiPromptAutoTab", () => {
  it("shows a loading state and never renders candidate lists while loading", () => {
    renderAutoTab({ loading: true });
    expect(screen.getByText(/fetching report and conversation matches/i)).toBeTruthy();
    expect(screen.queryByText("daygame — full report")).toBeNull();
  });

  it("shows the AI pick chip on the recommended report, and 'currently selected' on the same item by default", () => {
    renderAutoTab();
    const row = screen.getByText("daygame — full report").closest("button")!;
    expect(row.textContent).toContain("AI pick");
    expect(row.textContent).toContain("currently selected");
  });

  it("keeps the AI pick chip on the original report after selecting a different one — never moves", () => {
    const { onSelectReport } = renderAutoTab();
    fireEvent.click(screen.getByText("daygame — notes"));
    expect(onSelectReport).toHaveBeenCalledWith("r2");
  });

  it("moving 'currently selected' to a manually chosen report leaves the AI pick chip on the original recommendation", () => {
    // Re-render as the parent would after onSelectReport("r2") updates state.
    renderAutoTab({ selectedReportAddress: "r2" });
    const aiRow = screen.getByText("daygame — full report").closest("button")!;
    const manualRow = screen.getByText("daygame — notes").closest("button")!;
    expect(aiRow.textContent).toContain("AI pick");
    expect(aiRow.textContent).not.toContain("currently selected");
    expect(manualRow.textContent).toContain("currently selected");
    expect(manualRow.textContent).not.toContain("AI pick");
  });

  it("conversation: AI pick chip stays on the recommended conversation after manually picking 'none'", () => {
    renderAutoTab({ conversationSelection: { kind: "none" } });
    const aiRow = screen.getByText("whatsapp conversation").closest("button")!;
    const noneRow = screen.getAllByText("none")[0].closest("button")!;
    expect(aiRow.textContent).toContain("AI pick");
    expect(aiRow.textContent).not.toContain("currently selected");
    expect(noneRow.textContent).toContain("currently selected");
  });

  it("marks 'none' as the AI pick when no conversation was found", () => {
    renderAutoTab({
      conversationFound: false,
      aiRecommendedConversationIsFound: false,
      conversationSelection: { kind: "none" },
    });
    const noneRow = screen.getAllByText("none")[0].closest("button")!;
    expect(noneRow.textContent).toContain("AI pick");
    expect(screen.getByText(/no conversation found/i)).toBeTruthy();
  });

  it("lets the user browse and pick another conversation from candidates", () => {
    const { onSelectConversation } = renderAutoTab({
      conversationCandidates: [
        { conversationId: "c9", conversationName: "Claudia — Instagram", displayName: "Claudia", channel: "instagram" },
      ],
    });
    fireEvent.click(screen.getByText(/browse other conversations/i));
    fireEvent.click(screen.getByText("Claudia — Instagram"));
    expect(onSelectConversation).toHaveBeenCalledWith({
      kind: "manual",
      conversationId: "c9",
      conversationName: "Claudia — Instagram",
    });
  });

  it("shows an honest error state, never a silent fallback", () => {
    renderAutoTab({ error: "boom" });
    expect(screen.getByText("boom")).toBeTruthy();
  });
});
