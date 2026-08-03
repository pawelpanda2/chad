// @vitest-environment jsdom
/**
 * AI Prompts conversation tab — left context panel (Story 102):
 * - lead list loads from the caller's own repo (/api/leads-dashboard), with
 *   loading/empty/error states, and a client-side search filter;
 * - selecting a lead automatically fetches report + conversation candidates
 *   and auto-selects the console's defaults (first found report, the
 *   resolved conversation if any);
 * - the base prompt is visible even with no additional input typed yet;
 * - switching a report/conversation selection to "none" is reported to the
 *   parent as a null body — never silently kept as the old selection.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AiLeadContextPanel } from "./ai-lead-context-panel.js";

const LEADS = [
  { leadKey: "2", leadName: "26-03-01_pn_Second", loca: "06/02", hasContacts: true },
  { leadKey: "1", leadName: "26-02-17_pi_Ira_Babenko", loca: "06/01", hasContacts: true },
];

const CONTEXT = {
  leadName: "26-02-17_pi_Ira_Babenko",
  leadLoca: "06/01",
  reports: [
    {
      address: "reports/01/x",
      name: "full report",
      category: "daygame",
      preview: "report preview",
      body: "report body",
    },
  ],
  recommendedReportAddress: "reports/01/x",
  conversation: {
    found: true,
    body: "conversation body",
    channel: "whatsapp",
    basis: "live-match",
    preview: "conversation preview",
  },
  basePrompt: "<current_case>\nname: 26-02-17_pi_Ira_Babenko\n</current_case>",
};

function stubFetch() {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/leads-dashboard") {
      return { ok: true, json: async () => LEADS } as Response;
    }
    if (url.startsWith("/api/msg-automation/ai-prompts/lead-context?")) {
      return { ok: true, json: async () => ({ success: true, data: CONTEXT }) } as Response;
    }
    if (url === "/api/msg-automation/ai-prompts/lead-context/preview") {
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: { basePrompt: CONTEXT.basePrompt, finalPrompt: CONTEXT.basePrompt },
        }),
      } as Response;
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AiLeadContextPanel", () => {
  it("shows a loading state, then the lead list, newest first as returned by the API", async () => {
    stubFetch();
    render(<AiLeadContextPanel additionalUserInput="" onSelectionChange={() => {}} />);
    expect(screen.getByText(/loading leads/i)).toBeTruthy();
    await screen.findByText("26-02-17_pi_Ira_Babenko");
    expect(screen.getByText("26-03-01_pn_Second")).toBeTruthy();
  });

  it("filters the lead list by search text, client-side", async () => {
    stubFetch();
    render(<AiLeadContextPanel additionalUserInput="" onSelectionChange={() => {}} />);
    await screen.findByText("26-02-17_pi_Ira_Babenko");
    fireEvent.change(screen.getByPlaceholderText(/search leads/i), { target: { value: "Ira" } });
    expect(screen.getByText("26-02-17_pi_Ira_Babenko")).toBeTruthy();
    expect(screen.queryByText("26-03-01_pn_Second")).toBeNull();
  });

  it("selecting a lead auto-fetches and auto-selects the recommended report + resolved conversation", async () => {
    stubFetch();
    const onSelectionChange = vi.fn();
    render(<AiLeadContextPanel additionalUserInput="" onSelectionChange={onSelectionChange} />);
    await screen.findByText("26-02-17_pi_Ira_Babenko");
    fireEvent.click(screen.getByText("26-02-17_pi_Ira_Babenko"));

    await screen.findByText(/Generated base prompt/i);
    await screen.findByText(/daygame/i);

    expect(
      onSelectionChange.mock.calls.some(
        ([sel]) =>
          sel.leadName === "26-02-17_pi_Ira_Babenko" &&
          sel.reportBody === "report body" &&
          sel.conversationBody === "conversation body",
      ),
    ).toBe(true);
  });

  it("switching report/conversation to 'none' reports a null body to the parent", async () => {
    stubFetch();
    const onSelectionChange = vi.fn();
    render(<AiLeadContextPanel additionalUserInput="" onSelectionChange={onSelectionChange} />);
    fireEvent.click(await screen.findByText("26-02-17_pi_Ira_Babenko"));
    await screen.findByText(/daygame/i);

    onSelectionChange.mockClear();
    fireEvent.click(screen.getAllByText("none")[0]); // report "none"
    expect(
      onSelectionChange.mock.calls.some(([sel]) => sel.reportBody === null && sel.conversationBody === "conversation body"),
    ).toBe(true);

    onSelectionChange.mockClear();
    fireEvent.click(screen.getAllByText("none")[1]); // conversation "none"
    expect(onSelectionChange.mock.calls.some(([sel]) => sel.reportBody === null && sel.conversationBody === null)).toBe(
      true,
    );
  });

  it("shows the base prompt preview even before any additional input is typed", async () => {
    stubFetch();
    render(<AiLeadContextPanel additionalUserInput="" onSelectionChange={() => {}} />);
    fireEvent.click(await screen.findByText("26-02-17_pi_Ira_Babenko"));
    // Base prompt and final prompt preview render identically when no
    // additional input is typed yet — both blocks must show the real text.
    const matches = await screen.findAllByText((_content, node) => node?.textContent === CONTEXT.basePrompt);
    expect(matches.length).toBe(2);
  });
});
