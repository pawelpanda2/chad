// @vitest-environment jsdom
/**
 * AI Prompts workspace — Manage/Lead/Auto/Base + effectiveReport = user ?? auto.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AiPromptWorkspace } from "./ai-prompt-workspace.js";

const LEADS = [{ leadKey: "1", leadName: "26-02-17_pi_Ira_Babenko", loca: "06/01", hasContacts: true }];

const CONTEXT = {
  leadName: "26-02-17_pi_Ira_Babenko",
  leadLoca: "06/01",
  reports: [
    { address: "reports/01/x", name: "25-10-03; Warszawa; Złote tarasy", category: "daygame", preview: "report preview", body: "report body" },
  ],
  recommendedReportAddress: "reports/01/x",
  conversation: {
    found: true,
    body: "conversation body",
    channel: "whatsapp",
    basis: "live-match",
    preview: "conversation preview",
    displayName: "Claudia Delfin",
    conversationId: "conv-1",
  },
  conversationCandidates: [],
  basePrompt: "<current_case>...</current_case>",
};

function stubFetch(over: { run?: unknown; runOk?: boolean } = {}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/leads-dashboard") {
      return { ok: true, json: async () => LEADS } as Response;
    }
    if (url.startsWith("/api/msg-automation/ai-prompts/lead-context?")) {
      return { ok: true, json: async () => ({ success: true, data: CONTEXT }) } as Response;
    }
    if (url === "/api/msg-automation/ai-prompts/lead-context/preview") {
      return {
        ok: true,
        json: async () => ({ success: true, data: { basePrompt: CONTEXT.basePrompt, finalPrompt: CONTEXT.basePrompt } }),
      } as Response;
    }
    if (url.includes("/api/reports/categories")) {
      return { ok: true, json: async () => ({ success: true, categories: [] }) } as Response;
    }
    if (url.startsWith("/api/reports?")) {
      return { ok: true, json: async () => ({ success: true, reports: [] }) } as Response;
    }
    if (url.endsWith("/run") && init?.method === "POST") {
      return {
        ok: over.runOk !== false,
        status: over.runOk === false ? 500 : 200,
        json: async () => over.run,
      } as Response;
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function pickLead() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("tab", { name: "Lead" }));
  await user.click(await screen.findByText("26-02-17_pi_Ira_Babenko"));
  await screen.findAllByText("Claudia Delfin");
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AiPromptWorkspace", () => {
  it("renders tabs in Manage/Lead/Auto/Base order", () => {
    stubFetch();
    render(<AiPromptWorkspace promptId="p1" manageContent={<div>settings</div>} />);
    const left = within(screen.getByLabelText("AI Prompt view"));
    const tabs = left.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["Manage", "Lead", "Auto", "Base"]);
  });

  it("locks auto and base until a lead is selected", () => {
    stubFetch();
    render(<AiPromptWorkspace promptId="p1" manageContent={<div>settings</div>} />);
    expect(screen.getByRole("tab", { name: "Auto" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("tab", { name: "Base" }).hasAttribute("disabled")).toBe(true);
  });

  it("never calls the run endpoint on render", () => {
    const fetchMock = stubFetch();
    render(<AiPromptWorkspace promptId="p1" manageContent={<div>settings</div>} />);
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).not.toMatch(/\/run$/);
    }
  });

  it("selecting a lead shows compact Auto Pick lines and None as Your Pick for report", async () => {
    stubFetch();
    render(<AiPromptWorkspace promptId="p1" manageContent={<div>settings</div>} />);
    await pickLead();
    expect(screen.getByText("25-10-03; Warszawa; Złote tarasy")).toBeTruthy();
    expect(screen.getAllByText("Claudia Delfin").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "None" })).toBeTruthy();
  });

  it("Send uses Auto Pick report body when Your Pick is unset", async () => {
    const fetchMock = stubFetch({ run: { success: true, data: { status: "complete", outputText: "Hello back!" } } });
    render(<AiPromptWorkspace promptId="p1" manageContent={<div>settings</div>} />);
    await pickLead();

    fireEvent.change(screen.getByPlaceholderText(/additional input/i), { target: { value: "extra text" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await screen.findByText("Hello back!");
    const runCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/run"));
    expect(runCall).toBeTruthy();
    expect(JSON.parse((runCall![1] as RequestInit).body as string)).toEqual({
      leadName: "26-02-17_pi_Ira_Babenko",
      leadLoca: "06/01",
      reportBody: "report body",
      conversationBody: "conversation body",
      additionalUserInput: "extra text",
    });
  });

  it("base tab shows the exact final prompt text from the preview endpoint", async () => {
    stubFetch();
    render(<AiPromptWorkspace promptId="p1" manageContent={<div>settings</div>} />);
    await pickLead();
    await userEvent.setup().click(screen.getByRole("tab", { name: "Base" }));
    await screen.findByText((_c, node) => node?.textContent === CONTEXT.basePrompt);
  });

  it("disables Send until a lead is selected", async () => {
    stubFetch();
    render(<AiPromptWorkspace promptId="p1" manageContent={<div>settings</div>} />);
    expect(screen.getByRole("button", { name: /send/i }).hasAttribute("disabled")).toBe(true);
  });

  it("shows provider-not-configured honestly", async () => {
    stubFetch({ run: { success: true, data: { status: "provider-not-configured", error: "OPENAI_API_KEY is not set" } } });
    render(<AiPromptWorkspace promptId="p1" manageContent={<div>settings</div>} />);
    await pickLead();
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByText(/OPENAI_API_KEY is not set/);
  });
});
