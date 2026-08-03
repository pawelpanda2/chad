// @vitest-environment jsdom
/**
 * AI Prompts editor → conversation tab regression coverage:
 * - no request is ever fired on mount/render (input §11 boundary);
 * - Send is disabled until the prompt is saved (has an id) and there's a
 *   non-empty draft message, and fires exactly one POST on explicit click;
 * - success renders the returned outputText as an assistant bubble;
 * - error / provider-not-configured are shown honestly, not swallowed.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AiPromptConversationPanel } from "./ai-prompt-conversation-panel.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AiPromptConversationPanel", () => {
  it("never calls fetch on render", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<AiPromptConversationPanel promptId="p1" />);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("disables Send when there is no saved prompt id yet (unsaved draft)", () => {
    render(<AiPromptConversationPanel />);
    const sendButton = screen.getByRole("button", { name: /send/i });
    expect(sendButton.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/save the prompt first/i)).toBeTruthy();
  });

  it("sends exactly one POST to the run endpoint on explicit Send and shows outputText", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { status: "complete", outputText: "Hello back!" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AiPromptConversationPanel promptId="p1" />);
    const textarea = screen.getByPlaceholderText("Ask anything");
    fireEvent.change(textarea, { target: { value: "Hi there" } });
    const sendButton = screen.getByRole("button", { name: /send/i });
    expect(sendButton.hasAttribute("disabled")).toBe(false);
    fireEvent.click(sendButton);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/msg-automation/ai-prompts/p1/run");
    expect(JSON.parse(init.body)).toEqual({ message: "Hi there" });

    await screen.findByText("Hello back!");
    expect(screen.getByText("Hi there")).toBeTruthy();
  });

  it("shows provider-not-configured honestly, without a fake response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { status: "provider-not-configured", error: "OPENAI_API_KEY is not set" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AiPromptConversationPanel promptId="p1" />);
    fireEvent.change(screen.getByPlaceholderText("Ask anything"), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await screen.findByText(/OPENAI_API_KEY is not set/);
    expect(screen.getByText(/provider not configured/i)).toBeTruthy();
  });

  it("shows an error state on a failed request, never a silent success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ success: false, error: "boom" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AiPromptConversationPanel promptId="p1" />);
    fireEvent.change(screen.getByPlaceholderText("Ask anything"), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await screen.findByText(/boom/);
  });
});
