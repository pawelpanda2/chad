"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Loader2, MessageSquare, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { AiPromptLeadsTab, type AiPromptLeadListItem } from "@/components/msg-automation/ai-prompt-leads-tab";
import {
  AiPromptAutoTab,
  type AiPromptConversationCandidate,
  type AiPromptConversationSelection,
  type AiPromptReportOption,
} from "@/components/msg-automation/ai-prompt-auto-tab";
import { AiPromptBaseTab } from "@/components/msg-automation/ai-prompt-base-tab";

const NONE = "__none__";

interface LeadAnalysisContextResponse {
  leadName: string;
  leadLoca: string | null;
  reports: Array<{ address: string; name: string | null; category: string | null; preview: string | null; body: string }>;
  recommendedReportAddress: string | null;
  conversation: {
    found: boolean;
    body: string | null;
    channel: string | null;
    basis: string;
    preview: string | null;
    error?: string;
  };
  conversationCandidates: AiPromptConversationCandidate[];
  basePrompt: string;
}

interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export type AiPromptRunStatus = "idle" | "sending" | "success" | "error" | "provider-not-configured";

interface AiPromptWorkspaceProps {
  /** Saved prompt id. Undefined/empty for an unsaved draft — save first. */
  promptId?: string;
  /** Kind-specific settings form (name/messages/model/... or OpenAI prompt id/version) — rendered in the "manage" tab, including that editor's own Save/Delete controls. */
  manageContent: ReactNode;
}

/**
 * AI Prompts editor workspace — GUI equivalent of console's
 * `askOpenAiAboutGirlFlow` real lead-analysis flow, laid out per the
 * accepted mockup (`examples/CHAD_ai_prompts_manage_leads_auto_base_mockup.html`):
 * four left tabs (manage/leads/auto/base) + a persistent right chat panel.
 * `auto`/`base` stay locked until a lead is picked in `leads`; picking a
 * lead auto-fetches report/conversation matches and jumps to `auto`. The
 * AI recommendation (amber) and the user's current selection (green) are
 * two independent states in `auto` — a manual re-selection only moves the
 * green marker, never the amber one. `base` always shows the exact final
 * prompt Send will submit, built server-side
 * (`buildLeadAnalysisCurrentCase`/`appendAdditionalUserInput` via
 * `lead-context/preview`) — never assembled here. No request to OpenAI is
 * ever sent on mount/render/lead-selection — only on explicit Send, and
 * only once a lead is selected.
 */
export function AiPromptWorkspace({ promptId, manageContent }: AiPromptWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<"manage" | "leads" | "auto" | "base">("manage");

  const [selectedLead, setSelectedLead] = useState<AiPromptLeadListItem | null>(null);
  const [context, setContext] = useState<LeadAnalysisContextResponse | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);

  const [aiRecommendedReportAddress, setAiRecommendedReportAddress] = useState<string | null>(null);
  const [aiRecommendedConversationIsFound, setAiRecommendedConversationIsFound] = useState(false);
  const [selectedReportAddress, setSelectedReportAddress] = useState<string>(NONE);
  const [conversationSelection, setConversationSelection] = useState<AiPromptConversationSelection>({ kind: "none" });

  const [manualConversationBody, setManualConversationBody] = useState<string | null>(null);
  const [manualConversationLoading, setManualConversationLoading] = useState(false);

  const [basePrompt, setBasePrompt] = useState("");
  const [finalPrompt, setFinalPrompt] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [status, setStatus] = useState<AiPromptRunStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const leadUnlocked = Boolean(selectedLead);

  async function handleSelectLead(lead: AiPromptLeadListItem) {
    setSelectedLead(lead);
    setContext(null);
    setContextLoading(true);
    setContextError(null);
    try {
      const params = new URLSearchParams({ leadName: lead.leadName, leadLoca: lead.loca });
      const res = await fetch(`/api/msg-automation/ai-prompts/lead-context?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Failed to load context (${res.status})`);
      const data = json.data as LeadAnalysisContextResponse;
      setContext(data);
      setAiRecommendedReportAddress(data.recommendedReportAddress);
      setAiRecommendedConversationIsFound(data.conversation.found);
      setSelectedReportAddress(data.recommendedReportAddress ?? NONE);
      setConversationSelection(data.conversation.found ? { kind: "found" } : { kind: "none" });
      setManualConversationBody(null);
      setActiveTab("auto");
    } catch (err) {
      setContextError(err instanceof Error ? err.message : String(err));
    } finally {
      setContextLoading(false);
    }
  }

  async function handleSelectConversation(selection: AiPromptConversationSelection) {
    setConversationSelection(selection);
    if (selection.kind !== "manual") return;
    setManualConversationBody(null);
    setManualConversationLoading(true);
    try {
      const params = new URLSearchParams({ conversationId: selection.conversationId });
      const res = await fetch(`/api/msg-automation/ai-prompts/lead-context/conversation?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load conversation");
      setManualConversationBody(json.data.body ?? null);
    } catch {
      setManualConversationBody(null);
    } finally {
      setManualConversationLoading(false);
    }
  }

  const reportBody =
    selectedReportAddress === NONE
      ? null
      : (context?.reports.find((r) => r.address === selectedReportAddress)?.body ?? null);
  const conversationBody =
    conversationSelection.kind === "none"
      ? null
      : conversationSelection.kind === "manual"
        ? manualConversationBody
        : (context?.conversation.body ?? null);

  // Base/final prompt preview — always server-built (buildLeadAnalysisCurrentCase /
  // appendAdditionalUserInput via lead-context/preview), never assembled here.
  const previewRequestId = useRef(0);
  useEffect(() => {
    if (!selectedLead || !context) {
      setBasePrompt("");
      setFinalPrompt("");
      return;
    }
    const requestId = ++previewRequestId.current;
    const timer = setTimeout(
      async () => {
        setPreviewLoading(true);
        try {
          const res = await fetch("/api/msg-automation/ai-prompts/lead-context/preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              leadName: selectedLead.leadName,
              reportBody,
              conversationBody,
              additionalUserInput: draft,
            }),
          });
          const json = await res.json();
          if (!res.ok || !json.success) throw new Error(json.error || "Preview failed");
          if (requestId !== previewRequestId.current) return;
          setBasePrompt(json.data.basePrompt);
          setFinalPrompt(json.data.finalPrompt);
        } catch {
          // Preview is best-effort display only; a failure here doesn't
          // block Send (the run route rebuilds the same text server-side).
        } finally {
          if (requestId === previewRequestId.current) setPreviewLoading(false);
        }
      },
      draft ? 250 : 0,
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLead, context, reportBody, conversationBody, draft]);

  const canSend = Boolean(promptId) && Boolean(selectedLead) && status !== "sending";

  async function handleSend() {
    if (!promptId || !selectedLead) return;

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
          leadName: selectedLead.leadName,
          leadLoca: selectedLead.loca,
          reportBody,
          conversationBody,
          additionalUserInput,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Request failed (${res.status})`);
      }
      const data = json.data as { status: "complete" | "error" | "provider-not-configured"; outputText?: string; error?: string };
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

  const reportOptions: AiPromptReportOption[] =
    context?.reports.map((r) => ({ address: r.address, name: r.name, category: r.category, preview: r.preview })) ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background lg:flex-row">
      <div className="flex min-h-0 flex-col border-b lg:w-[42%] lg:shrink-0 lg:border-b-0 lg:border-r">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as typeof activeTab)}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <TabsList className="mx-3 mt-2 w-fit shrink-0">
            <TabsTrigger value="manage">manage</TabsTrigger>
            <TabsTrigger value="leads">leads</TabsTrigger>
            <TabsTrigger value="auto" disabled={!leadUnlocked}>
              auto
            </TabsTrigger>
            <TabsTrigger value="base" disabled={!leadUnlocked}>
              base
            </TabsTrigger>
          </TabsList>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <TabsContent value="manage" className="mt-0">
              {manageContent}
            </TabsContent>
            <TabsContent value="leads" className="mt-0">
              <AiPromptLeadsTab selectedLead={selectedLead} onSelectLead={(lead) => void handleSelectLead(lead)} />
            </TabsContent>
            <TabsContent value="auto" className="mt-0">
              {leadUnlocked ? (
                <AiPromptAutoTab
                  loading={contextLoading}
                  error={contextError}
                  reports={reportOptions}
                  aiRecommendedReportAddress={aiRecommendedReportAddress}
                  selectedReportAddress={selectedReportAddress}
                  onSelectReport={setSelectedReportAddress}
                  conversationFound={context?.conversation.found ?? false}
                  conversationChannel={context?.conversation.channel ?? null}
                  conversationBasis={context?.conversation.basis ?? "not-found"}
                  conversationPreview={context?.conversation.preview ?? null}
                  conversationError={context?.conversation.error}
                  aiRecommendedConversationIsFound={aiRecommendedConversationIsFound}
                  conversationCandidates={context?.conversationCandidates ?? []}
                  conversationSelection={conversationSelection}
                  onSelectConversation={(sel) => void handleSelectConversation(sel)}
                />
              ) : (
                <LockedBox />
              )}
              {manualConversationLoading && (
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading conversation…
                </div>
              )}
            </TabsContent>
            <TabsContent value="base" className="mt-0">
              {leadUnlocked ? (
                <AiPromptBaseTab finalPrompt={finalPrompt || basePrompt} loading={previewLoading} />
              ) : (
                <LockedBox />
              )}
            </TabsContent>
          </div>
        </Tabs>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div className="text-lg font-semibold text-foreground">Your conversation will appear here</div>
              {!promptId ? (
                <div className="text-sm">Save the prompt first to send a message.</div>
              ) : !selectedLead ? (
                <div className="text-sm">Select a lead in the leads tab to get started.</div>
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
                : !selectedLead
                  ? "Select a lead first…"
                  : "Additional input (optional) — appended to the base prompt"
            }
            disabled={!promptId || !selectedLead || status === "sending"}
            className="min-h-[60px] resize-none border-0 p-0 shadow-none focus-visible:ring-0"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (canSend) void handleSend();
              }
            }}
          />
          <div className="mt-1.5 text-xs text-muted-foreground">
            This text never replaces the base prompt — it&apos;s only appended to the full request shown in the{" "}
            <strong>base</strong> tab.
          </div>
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

function LockedBox() {
  return (
    <div className="rounded-lg border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
      Select a lead in the <strong>leads</strong> tab.
    </div>
  );
}
