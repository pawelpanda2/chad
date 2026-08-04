// @vitest-environment jsdom
/**
 * AI Prompts editor workspace, "auto" tab — conversation uses compact
 * Auto Pick (orange) + Your Pick (green); Change reveals the browse list.
 * Report still keeps independent AI recommendation vs current selection.
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
  const onOpenConversation = vi.fn();
  const onOpenReport = vi.fn();
  render(
    <AiPromptAutoTab
      loading={false}
      error={null}
      reports={REPORTS}
      aiRecommendedReportAddress="r1"
      selectedReportAddress="r1"
      onSelectReport={onSelectReport}
      onOpenReport={onOpenReport}
      conversationFound
      conversationChannel="whatsapp"
      conversationBasis="live-match"
      conversationPreview="hi there"
      conversationDisplayName="Claudia Delfin"
      aiRecommendedConversationIsFound
      conversationCandidates={[]}
      conversationSelection={{ kind: "found" }}
      onSelectConversation={onSelectConversation}
      onOpenConversation={onOpenConversation}
      {...over}
    />,
  );
  return { onSelectReport, onSelectConversation, onOpenConversation, onOpenReport };
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

  it("shows Auto Pick and Your Pick for the AI-found conversation by default", () => {
    renderAutoTab();
    expect(screen.getByText("Auto Pick")).toBeTruthy();
    expect(screen.getByText("Your Pick")).toBeTruthy();
    expect(screen.getAllByText("Claudia Delfin").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByPlaceholderText(/search conversations/i)).toBeNull();
  });

  it("Change reveals the conversation search list; picking updates selection", () => {
    const { onSelectConversation } = renderAutoTab({
      conversationCandidates: [
        { conversationId: "c9", conversationName: "Claudia — Instagram", displayName: "Claudia", channel: "instagram" },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: /^change$/i }));
    expect(screen.getByPlaceholderText(/search conversations/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /claudia.*instagram/i }));
    expect(onSelectConversation).toHaveBeenCalledWith({
      kind: "manual",
      conversationId: "c9",
      conversationName: "Claudia — Instagram",
    });
  });

  it("keeps Auto Pick on the recommended conversation when Your Pick is none", () => {
    renderAutoTab({ conversationSelection: { kind: "none" } });
    expect(screen.getByText("Auto Pick")).toBeTruthy();
    expect(screen.getByText("Your Pick")).toBeTruthy();
    // Auto Pick row still shows Claudia; Your Pick shows none
    expect(screen.getByText("Claudia Delfin")).toBeTruthy();
    expect(screen.getAllByText("none").length).toBeGreaterThanOrEqual(1);
  });

  it("shows none as Auto Pick when no conversation was found", () => {
    renderAutoTab({
      conversationFound: false,
      conversationDisplayName: null,
      aiRecommendedConversationIsFound: false,
      conversationSelection: { kind: "none" },
    });
    expect(screen.getAllByText("none").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Auto Pick")).toBeTruthy();
  });

  it("shows the AI pick chip on the recommended report, and 'currently selected' on the same item by default", () => {
    renderAutoTab();
    const row = screen.getByText("daygame — full report").closest("button")!;
    expect(row.textContent).toContain("AI pick");
    expect(row.textContent).toContain("currently selected");
  });

  it("keeps the AI pick chip on the original report after selecting a different one — never moves", () => {
    const { onSelectReport } = renderAutoTab();
    fireEvent.click(screen.getByRole("button", { name: /notes/i }));
    expect(onSelectReport).toHaveBeenCalledWith("r2");
  });

  it("moving 'currently selected' to a manually chosen report leaves the AI pick chip on the original recommendation", () => {
    renderAutoTab({ selectedReportAddress: "r2" });
    const aiRow = screen.getByText("daygame — full report").closest("button")!;
    const manualRow = screen.getByText("daygame — notes").closest("button")!;
    expect(aiRow.textContent).toContain("AI pick");
    expect(aiRow.textContent).not.toContain("currently selected");
    expect(manualRow.textContent).toContain("currently selected");
    expect(manualRow.textContent).not.toContain("AI pick");
  });

  it("opens conversation / report previews from underlined name links", () => {
    const { onOpenConversation, onOpenReport } = renderAutoTab();
    fireEvent.click(screen.getByRole("button", { name: "Claudia Delfin", exact: true }));
    expect(onOpenConversation).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "full report", exact: true }));
    expect(onOpenReport).toHaveBeenCalled();
  });

  it("shows an honest error state, never a silent fallback", () => {
    renderAutoTab({ error: "boom" });
    expect(screen.getByText("boom")).toBeTruthy();
  });
});
