"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Loader2, MessageSquare, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { AiLeadContextPanel, type LeadAnalysisSelection } from "@/components/msg-automation/ai-lead-context-panel";

export type AiPromptRunStatus =
  | "idle"
  | "sending"
  | "success"
  | "error"
  | "provider-not-configured";

interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface AiPromptConversationPanelProps {
  /** Saved prompt id. Undefined/empty for an unsaved draft — save first. */
  promptId?: string;
}

const EMPTY_SELECTION: LeadAnalysisSelection = {
  leadName: null,
  leadLoca: null,
  reportBody: null,
  conversationBody: null,
};

/**
 * AI Prompts editor → conversation tab: GUI equivalent of console's
 * `askOpenAiAboutGirlFlow` real lead-analysis flow (input §1), not a plain
 * context-free chat. Two panels: left ({@link AiLeadContextPanel}) prepares
 * the lead/report/source-conversation selection and always shows the exact
 * `<current_case>` base prompt (and, once typed, the final prompt with the
 * additional input appended) that Send will use; right is the actual
 * conversation with the configured AI provider — history, additional-input
 * textarea, Send. No request is ever sent to OpenAI on mount/render/lead
 * selection — only on explicit Send, and only once a lead is selected (a
 * lone typed message, with no lead/report/conversation, can never be sent).
 * v1 sends exactly one message per request (no server-side conversation
 * memory) — each Send is independent; the message list below is purely
 * local history, not a real multi-turn conversation.
 */
export function AiPromptConversationPanel({ promptId }: AiPromptConversationPanelProps) {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<AiPromptRunStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<LeadAnalysisSelection>(EMPTY_SELECTION);

  const canSend = Boolean(promptId) && Boolean(selection.leadName) && status !== "sending";

  async function handleSend() {
    if (!promptId || !selection.leadName) return;

    const additionalUserInput = draft;
    const userLabel = draft.trim() || "(sent base prompt — no additional input)";
    const userMsg: ConversationMessage = { id: crypto.randomUUID(), role: "user", content: userLabel };
    setMessages((prev) => [...prev, userMsg]);
    setDraft("");
    setStatus("sending");
    setError(null);

    try {
      const res = await fetch(`/api/msg-automation/ai-prompts/${encodeURIComponent(promptId)}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadName: selection.leadName,
          leadLoca: selection.leadLoca ?? undefined,
          reportBody: selection.reportBody,
          conversationBody: selection.conversationBody,
          additionalUserInput,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Request failed (${res.status})`);
      }
      const data = json.data as {
        status: "complete" | "error" | "provider-not-configured";
        outputText?: string;
        error?: string;
      };
      if (data.status === "complete") {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant", content: data.outputText || "(empty response)" },
        ]);
        setStatus("success");
      } else if (data.status === "provider-not-configured") {
        setStatus("provider-not-configured");
        setError(data.error || "Provider not configured");
      } else {
        setStatus("error");
        setError(data.error || "Request failed");
      }
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background lg:flex-row">
      <AiLeadContextPanel additionalUserInput={draft} onSelectionChange={setSelection} />

      <div className="flex min-h-0 flex-1 flex-col lg:w-1/2">
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div className="text-lg font-semibold text-foreground">Your conversation will appear here</div>
              {!promptId ? (
                <div className="text-sm">Save the prompt first to send a message.</div>
              ) : !selection.leadName ? (
                <div className="text-sm">Select a lead on the left to get started.</div>
              ) : null}
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[80%] whitespace-pre-wrap rounded-2xl border px-3 py-2.5 text-sm leading-snug shadow-sm",
                    m.role === "user"
                      ? "rounded-br-[5px] border-primary bg-primary text-primary-foreground"
                      : "rounded-bl-[5px] bg-muted/40"
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))
          )}

          {status === "sending" && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl rounded-bl-[5px] bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Waiting for a response…
              </div>
            </div>
          )}

          {(status === "error" || status === "provider-not-configured") && error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {status === "provider-not-configured" ? "Provider not configured: " : "Error: "}
                {error}
              </span>
            </div>
          )}
        </div>

        <div className="mx-auto mb-6 w-[min(670px,calc(100%-3rem))] rounded-3xl border p-4 shadow-sm">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              !promptId
                ? "Save the prompt first…"
                : !selection.leadName
                  ? "Select a lead first…"
                  : "Additional input (optional) — appended to the base prompt on the left"
            }
            disabled={!promptId || !selection.leadName || status === "sending"}
            className="min-h-[60px] resize-none border-0 p-0 shadow-none focus-visible:ring-0"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (canSend) void handleSend();
              }
            }}
          />
          <div className="mt-2 flex justify-end">
            <Button type="button" size="sm" className="gap-1.5" disabled={!canSend} onClick={() => void handleSend()}>
              {status === "sending" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
