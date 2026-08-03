// @vitest-environment jsdom
/**
 * AI Prompts editor → conversation tab regression coverage (Story 102 — real
 * lead-analysis flow, GUI equivalent of console's askOpenAiAboutGirlFlow):
 * - preparation requests (own leads list, lead context) are expected on
 *   mount/lead-selection — but the OpenAI **run** endpoint is never called
 *   except on explicit Send (input §2.4/§2.10 boundary);
 * - Send is disabled until the prompt is saved (has an id) AND a lead is
 *   selected — a bare typed message with no lead can never be sent;
 * - selecting a lead fetches its context (report/conversation candidates)
 *   and Send becomes enabled without requiring any typed text (empty input
 *   sends the base prompt alone);
 * - the run request carries leadName/reportBody/conversationBody/
 *   additionalUserInput — never a bare freeform "message";
 * - success renders the returned outputText as an assistant bubble; error /
 *   provider-not-configured are shown honestly, not swallowed.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AiPromptConversationPanel } from "./ai-prompt-conversation-panel.js";

const LEADS = [{ leadKey: "1", leadName: "26-02-17_pi_Ira_Babenko", loca: "06/01", hasContacts: true }];

const CONTEXT = {
  leadName: "26-02-17_pi_Ira_Babenko",
  leadLoca: "06/01",
  reports: [
    {
      address: "reports/01/26-02-17_pi_Ira_Babenko",
      name: "full report",
      category: "daygame",
      preview: "report preview",
      body: "report body",
    },
  ],
  recommendedReportAddress: "reports/01/26-02-17_pi_Ira_Babenko",
  conversation: {
    found: true,
    body: "conversation body",
    channel: "whatsapp",
    basis: "live-match",
    preview: "conversation preview",
  },
  basePrompt: "<current_case>...</current_case>",
};

/** Routes fetch calls by URL/method so a test only has to declare the responses it cares about. */
function stubFetch(overrides: {
  run?: unknown;
  runOk?: boolean;
} = {}) {
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
        json: async () => ({
          success: true,
          data: { basePrompt: CONTEXT.basePrompt, finalPrompt: CONTEXT.basePrompt },
        }),
      } as Response;
    }
    if (url.endsWith("/run") && init?.method === "POST") {
      return {
        ok: overrides.runOk !== false,
        status: overrides.runOk === false ? 500 : 200,
        json: async () => overrides.run,
      } as Response;
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function selectLead() {
  await screen.findByText("26-02-17_pi_Ira_Babenko");
  fireEvent.click(screen.getByText("26-02-17_pi_Ira_Babenko"));
  await screen.findByText(/Generated base prompt/i);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AiPromptConversationPanel", () => {
  it("never calls the run endpoint on render", () => {
    const fetchMock = stubFetch();
    render(<AiPromptConversationPanel promptId="p1" />);
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).not.toMatch(/\/run$/);
    }
  });

  it("disables Send when there is no saved prompt id yet (unsaved draft)", () => {
    stubFetch();
    render(<AiPromptConversationPanel />);
    const sendButton = screen.getByRole("button", { name: /send/i });
    expect(sendButton.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/save the prompt first/i)).toBeTruthy();
  });

  it("disables Send until a lead is selected, even with saved prompt and typed text", async () => {
    stubFetch();
    render(<AiPromptConversationPanel promptId="p1" />);
    await screen.findByText("26-02-17_pi_Ira_Babenko");
    const textarea = screen.getByPlaceholderText(/select a lead first/i);
    fireEvent.change(textarea, { target: { value: "Hi there" } });
    expect(screen.getByRole("button", { name: /send/i }).hasAttribute("disabled")).toBe(true);
  });

  it("selecting a lead enables Send even with empty additional input (base prompt only)", async () => {
    stubFetch();
    render(<AiPromptConversationPanel promptId="p1" />);
    await selectLead();
    expect(screen.getByRole("button", { name: /send/i }).hasAttribute("disabled")).toBe(false);
  });

  it("sends leadName/reportBody/conversationBody/additionalUserInput — never a bare message", async () => {
    const fetchMock = stubFetch({ run: { success: true, data: { status: "complete", outputText: "Hello back!" } } });
    render(<AiPromptConversationPanel promptId="p1" />);
    await selectLead();

    fireEvent.change(screen.getByPlaceholderText(/additional input/i), { target: { value: "Hi there" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await screen.findByText("Hello back!");

    const runCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/run"));
    expect(runCall).toBeTruthy();
    const [url, init] = runCall!;
    expect(url).toBe("/api/msg-automation/ai-prompts/p1/run");
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody).toEqual({
      leadName: "26-02-17_pi_Ira_Babenko",
      leadLoca: "06/01",
      reportBody: "report body",
      conversationBody: "conversation body",
      additionalUserInput: "Hi there",
    });
  });

  it("shows provider-not-configured honestly, without a fake response", async () => {
    stubFetch({
      run: { success: true, data: { status: "provider-not-configured", error: "OPENAI_API_KEY is not set" } },
    });
    render(<AiPromptConversationPanel promptId="p1" />);
    await selectLead();
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await screen.findByText(/OPENAI_API_KEY is not set/);
    expect(screen.getByText(/provider not configured/i)).toBeTruthy();
  });

  it("shows an error state on a failed request, never a silent success", async () => {
    stubFetch({ run: { success: false, error: "boom" }, runOk: false });
    render(<AiPromptConversationPanel promptId="p1" />);
    await selectLead();
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => screen.findByText(/boom/));
  });
});
