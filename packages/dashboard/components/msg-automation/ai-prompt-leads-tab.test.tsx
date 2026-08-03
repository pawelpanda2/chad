// @vitest-environment jsdom
/**
 * AI Prompts editor workspace, "leads" tab: the caller's own leads
 * (never chad_shared), search filter, loading/empty/error states, and a
 * clear highlight on the currently selected lead.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AiPromptLeadsTab } from "./ai-prompt-leads-tab.js";

const LEADS = [
  { leadKey: "2", leadName: "26-03-01_pn_Second", loca: "06/02", hasContacts: true },
  { leadKey: "1", leadName: "26-02-17_pi_Ira_Babenko", loca: "06/01", hasContacts: true },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AiPromptLeadsTab", () => {
  it("shows a loading state, then the lead list from the user's own repo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => LEADS }) as Response),
    );
    render(<AiPromptLeadsTab selectedLead={null} onSelectLead={() => {}} />);
    expect(screen.getByText(/loading leads/i)).toBeTruthy();
    await screen.findByText("26-02-17_pi_Ira_Babenko");
    expect(screen.getByText("26-03-01_pn_Second")).toBeTruthy();
  });

  it("shows an honest error state on a failed fetch, never a silent empty list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: "boom" }) }) as Response),
    );
    render(<AiPromptLeadsTab selectedLead={null} onSelectLead={() => {}} />);
    await screen.findByText("boom");
  });

  it("shows an empty state when the user has no leads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => [] }) as Response),
    );
    render(<AiPromptLeadsTab selectedLead={null} onSelectLead={() => {}} />);
    await screen.findByText(/no leads found/i);
  });

  it("filters by search text, client-side", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => LEADS }) as Response),
    );
    render(<AiPromptLeadsTab selectedLead={null} onSelectLead={() => {}} />);
    await screen.findByText("26-02-17_pi_Ira_Babenko");
    fireEvent.change(screen.getByPlaceholderText(/search leads/i), { target: { value: "Ira" } });
    expect(screen.getByText("26-02-17_pi_Ira_Babenko")).toBeTruthy();
    expect(screen.queryByText("26-03-01_pn_Second")).toBeNull();
  });

  it("clearly marks the currently selected lead and reports clicks to the parent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => LEADS }) as Response),
    );
    const onSelectLead = vi.fn();
    const { rerender } = render(
      <AiPromptLeadsTab selectedLead={{ leadName: "26-02-17_pi_Ira_Babenko", loca: "06/01" }} onSelectLead={onSelectLead} />,
    );
    await screen.findByText("26-02-17_pi_Ira_Babenko");
    expect(screen.getByText(/currently selected/i)).toBeTruthy();

    fireEvent.click(screen.getByText("26-03-01_pn_Second"));
    expect(onSelectLead).toHaveBeenCalledWith({ leadName: "26-03-01_pn_Second", loca: "06/02" });

    rerender(<AiPromptLeadsTab selectedLead={{ leadName: "26-03-01_pn_Second", loca: "06/02" }} onSelectLead={onSelectLead} />);
    const secondRow = screen.getByText("26-03-01_pn_Second").closest("button")!;
    expect(secondRow.textContent).toContain("currently selected");
  });
});
