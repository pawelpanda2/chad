// @vitest-environment jsdom
/**
 * Compact Auto tab: Conversation / Report two-line summaries; pickers
 * open only via Change / Your Pick.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AiPromptAutoTab } from "./ai-prompt-auto-tab.js";

function renderAutoTab(over: Partial<React.ComponentProps<typeof AiPromptAutoTab>> = {}) {
  const onSelectUserReport = vi.fn();
  const onSelectConversation = vi.fn();
  const onOpenConversation = vi.fn();
  render(
    <AiPromptAutoTab
      loading={false}
      error={null}
      autoReportAddress="r1"
      autoReportName="25-10-03; Warszawa; Złote tarasy"
      userReport={{ status: "unset" }}
      userReportName={null}
      onSelectUserReport={onSelectUserReport}
      conversationFound
      conversationChannel="whatsapp"
      conversationDisplayName="Claudia Delfin"
      aiRecommendedConversationIsFound
      conversationCandidates={[]}
      conversationSelection={{ kind: "found" }}
      onSelectConversation={onSelectConversation}
      onOpenConversation={onOpenConversation}
      {...over}
    />,
  );
  return { onSelectUserReport, onSelectConversation, onOpenConversation };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AiPromptAutoTab", () => {
  it("shows compact Auto Pick / Your Pick lines without an open picker by default", () => {
    renderAutoTab();
    expect(screen.getByText("Conversation")).toBeTruthy();
    expect(screen.getByText("Report")).toBeTruthy();
    expect(screen.getAllByText("Claudia Delfin").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("25-10-03; Warszawa; Złote tarasy")).toBeTruthy();
    expect(screen.getAllByText("(Auto Pick)").length).toBe(2);
    expect(screen.getAllByText("(Your Pick)").length).toBe(2);
    expect(screen.queryByPlaceholderText(/search reports/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/search conversations/i)).toBeNull();
  });

  it("shows None as Your Pick when user has not chosen a report", () => {
    renderAutoTab({ userReport: { status: "unset" } });
    expect(screen.getByRole("button", { name: "None" })).toBeTruthy();
  });

  it("Change opens the report picker with search + category", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/reports/categories")) {
          return {
            ok: true,
            json: async () => ({
              success: true,
              categories: [{ id: "cat1", displayName: "daygame; full report" }],
            }),
          } as Response;
        }
        if (url.startsWith("/api/reports?")) {
          return {
            ok: true,
            json: async () => ({
              success: true,
              reports: [{ address: "a1", name: "picked report" }],
            }),
          } as Response;
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );
    const { onSelectUserReport } = renderAutoTab();
    fireEvent.click(screen.getAllByRole("button", { name: "(Change)" })[1]!);
    await screen.findByPlaceholderText(/search reports/i);
    await waitFor(() => expect(screen.getByText("picked report")).toBeTruthy());
    fireEvent.click(screen.getByText("picked report"));
    expect(onSelectUserReport).toHaveBeenCalledWith({ status: "report", address: "a1" });
  });

  it("conversation Change opens the conversation list", () => {
    const { onSelectConversation } = renderAutoTab({
      conversationCandidates: [
        { conversationId: "c9", conversationName: "Other", displayName: "Other Person", channel: "wa" },
      ],
    });
    fireEvent.click(screen.getAllByRole("button", { name: "(Change)" })[0]!);
    expect(screen.getByPlaceholderText(/search conversations/i)).toBeTruthy();
    fireEvent.click(screen.getByText("Other Person"));
    expect(onSelectConversation).toHaveBeenCalledWith({
      kind: "manual",
      conversationId: "c9",
      conversationName: "Other",
    });
  });

  it("shows an honest error state", () => {
    renderAutoTab({ error: "boom" });
    expect(screen.getByText("boom")).toBeTruthy();
  });
});
