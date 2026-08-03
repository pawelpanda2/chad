"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Loader2, AlertCircle, Search, FileText, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * AI Prompts → conversation tab, left "context" panel — GUI equivalent of
 * console's `askOpenAiAboutGirlFlow` lead/report/conversation selection +
 * `buildCurrentCasePromptFromData` preview. Fetches:
 * - `/api/leads-dashboard` (this user's own leads, newest first — never
 *   chad_shared) for the lead picker, once on mount;
 * - `/api/msg-automation/ai-prompts/lead-context` on lead selection (report
 *   candidates + the conversation resolved by the same saved-link/live-
 *   match/legacy-fallback algorithm Message Creator uses);
 * - `/api/msg-automation/ai-prompts/lead-context/preview` whenever the
 *   report/conversation selection or the parent's `additionalUserInput`
 *   changes, so the base/final prompt text is always built by
 *   `buildLeadAnalysisCurrentCase`/`appendAdditionalUserInput` (never
 *   re-implemented here).
 *
 * Reports only the *selection* (lead name/loca, chosen report/conversation
 * body) up to the parent via `onSelectionChange` — the parent needs that to
 * send; it never needs to re-derive the preview text itself.
 */

interface LeadListItem {
  leadName: string;
  loca: string;
}

interface ReportOption {
  address: string;
  name: string | null;
  category: string | null;
  preview: string | null;
  body: string;
}

interface ConversationOption {
  found: boolean;
  body: string | null;
  channel: string | null;
  basis: "saved-link" | "live-match" | "legacy-fallback" | "not-found";
  preview: string | null;
  error?: string;
}

interface LeadAnalysisContext {
  leadName: string;
  leadLoca: string | null;
  reports: ReportOption[];
  recommendedReportAddress: string | null;
  conversation: ConversationOption;
  basePrompt: string;
}

export interface LeadAnalysisSelection {
  leadName: string | null;
  leadLoca: string | null;
  reportBody: string | null;
  conversationBody: string | null;
}

const NONE = "__none__";

function basisLabel(basis: ConversationOption["basis"]): string {
  switch (basis) {
    case "saved-link":
      return "saved link";
    case "live-match":
      return "automatic match (phone/name)";
    case "legacy-fallback":
      return "legacy conversation lookup";
    default:
      return "not found";
  }
}

interface AiLeadContextPanelProps {
  additionalUserInput: string;
  onSelectionChange: (selection: LeadAnalysisSelection) => void;
}

export function AiLeadContextPanel({ additionalUserInput, onSelectionChange }: AiLeadContextPanelProps) {
  const [leads, setLeads] = useState<LeadListItem[] | null>(null);
  const [leadsError, setLeadsError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [selectedLead, setSelectedLead] = useState<LeadListItem | null>(null);
  const [context, setContext] = useState<LeadAnalysisContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);

  const [selectedReportAddress, setSelectedReportAddress] = useState<string>(NONE);
  const [selectedConversationChoice, setSelectedConversationChoice] = useState<"found" | "none">("none");

  const [basePrompt, setBasePrompt] = useState("");
  const [finalPrompt, setFinalPrompt] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  // Fetch this user's own leads once on mount (never on every keystroke —
  // the search box below filters the already-fetched list client-side).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/leads-dashboard");
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || `Failed to load leads (${res.status})`);
        if (cancelled) return;
        const items: LeadListItem[] = Array.isArray(json)
          ? json.map((l: { leadName: string; loca: string }) => ({ leadName: l.leadName, loca: l.loca }))
          : [];
        setLeads(items);
      } catch (err) {
        if (!cancelled) setLeadsError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Lead selection → automatically find report + conversation (input §1.3).
  const contextRequestId = useRef(0);
  useEffect(() => {
    if (!selectedLead) {
      setContext(null);
      return;
    }
    const requestId = ++contextRequestId.current;
    setContextLoading(true);
    setContextError(null);
    (async () => {
      try {
        const params = new URLSearchParams({ leadName: selectedLead.leadName, leadLoca: selectedLead.loca });
        const res = await fetch(`/api/msg-automation/ai-prompts/lead-context?${params.toString()}`);
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || `Failed to load context (${res.status})`);
        if (requestId !== contextRequestId.current) return; // stale response guard
        const data = json.data as LeadAnalysisContext;
        setContext(data);
        setSelectedReportAddress(data.recommendedReportAddress ?? NONE);
        setSelectedConversationChoice(data.conversation.found ? "found" : "none");
      } catch (err) {
        if (requestId !== contextRequestId.current) return;
        setContextError(err instanceof Error ? err.message : String(err));
      } finally {
        if (requestId === contextRequestId.current) setContextLoading(false);
      }
    })();
  }, [selectedLead]);

  const currentReportBody =
    selectedReportAddress === NONE
      ? null
      : (context?.reports.find((r) => r.address === selectedReportAddress)?.body ?? null);
  const currentConversationBody =
    selectedConversationChoice === "none" ? null : (context?.conversation.body ?? null);

  // Report leadName/loca + the selected bodies up to the parent — it's what
  // Send actually needs; the parent never re-derives prompt text itself.
  useEffect(() => {
    onSelectionChange({
      leadName: selectedLead?.leadName ?? null,
      leadLoca: selectedLead?.loca ?? null,
      reportBody: currentReportBody,
      conversationBody: currentConversationBody,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLead, currentReportBody, currentConversationBody]);

  // Base/final prompt preview — always server-built, never assembled here.
  // Report/conversation selection changes recompute immediately; the
  // additional-input textarea (owned by the parent, right panel) is
  // debounced since it changes on every keystroke.
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
              reportBody: currentReportBody,
              conversationBody: currentConversationBody,
              additionalUserInput,
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
      additionalUserInput ? 250 : 0,
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLead, context, currentReportBody, currentConversationBody, additionalUserInput]);

  const filteredLeads = (leads ?? []).filter((l) =>
    l.leadName.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto border-b p-3 lg:w-1/2 lg:border-b-0 lg:border-r">
      {/* Lead picker */}
      <section className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lead</div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leads…"
            className="h-8 pl-8 text-sm"
          />
        </div>
        {leadsError ? (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {leadsError}
          </div>
        ) : leads === null ? (
          <div className="flex items-center gap-2 px-1 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading leads…
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="px-1 py-2 text-xs text-muted-foreground">
            {leads.length === 0 ? "No leads found." : "No leads match your search."}
          </div>
        ) : (
          <div className="max-h-40 overflow-y-auto rounded-md border">
            {filteredLeads.map((lead) => (
              <button
                key={lead.loca}
                type="button"
                onClick={() => setSelectedLead(lead)}
                className={cn(
                  "block w-full truncate px-2.5 py-1.5 text-left text-xs hover:bg-muted",
                  selectedLead?.loca === lead.loca && "bg-primary/10 font-medium text-primary",
                )}
              >
                {lead.leadName}
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedLead && (
        <>
          {/* Report */}
          <section className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              Report
              {context && <span className="normal-case">({context.reports.length} found)</span>}
            </div>
            {contextLoading && !context ? (
              <div className="flex items-center gap-2 px-1 py-1 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Searching…
              </div>
            ) : contextError ? (
              <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {contextError}
              </div>
            ) : context ? (
              <div className="space-y-1" role="radiogroup" aria-label="Report">
                {context.reports.map((r) => (
                  <button
                    key={r.address}
                    type="button"
                    role="radio"
                    aria-checked={selectedReportAddress === r.address}
                    onClick={() => setSelectedReportAddress(r.address)}
                    className={cn(
                      "block w-full rounded-md border px-2.5 py-1.5 text-left text-xs",
                      selectedReportAddress === r.address ? "border-primary bg-primary/10" : "hover:bg-muted",
                    )}
                  >
                    <div className="font-medium">{r.category ?? "report"} — {r.name ?? "full report"}</div>
                    {r.preview && (
                      <div className="mt-0.5 truncate text-muted-foreground">{r.preview.split(/\r?\n/)[0]}</div>
                    )}
                  </button>
                ))}
                <button
                  type="button"
                  role="radio"
                  aria-checked={selectedReportAddress === NONE}
                  onClick={() => setSelectedReportAddress(NONE)}
                  className={cn(
                    "block w-full rounded-md border px-2.5 py-1.5 text-left text-xs text-muted-foreground",
                    selectedReportAddress === NONE ? "border-primary bg-primary/10" : "hover:bg-muted",
                  )}
                >
                  none
                </button>
              </div>
            ) : null}
          </section>

          {/* Conversation source */}
          <section className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <MessageSquare className="h-3.5 w-3.5" />
              Source conversation
            </div>
            {contextLoading && !context ? (
              <div className="flex items-center gap-2 px-1 py-1 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Searching…
              </div>
            ) : context ? (
              <div className="space-y-1" role="radiogroup" aria-label="Source conversation">
                {context.conversation.found && (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selectedConversationChoice === "found"}
                    onClick={() => setSelectedConversationChoice("found")}
                    className={cn(
                      "block w-full rounded-md border px-2.5 py-1.5 text-left text-xs",
                      selectedConversationChoice === "found" ? "border-primary bg-primary/10" : "hover:bg-muted",
                    )}
                  >
                    <div className="font-medium">
                      {context.leadName} — {context.conversation.channel ?? "beeper"}
                    </div>
                    <div className="text-muted-foreground">basis: {basisLabel(context.conversation.basis)}</div>
                    {context.conversation.preview && (
                      <div className="mt-0.5 truncate text-muted-foreground">
                        {context.conversation.preview.split(/\r?\n/)[0]}
                      </div>
                    )}
                  </button>
                )}
                {!context.conversation.found && (
                  <div className="rounded-md border border-dashed px-2.5 py-1.5 text-xs text-muted-foreground">
                    No conversation found ({basisLabel(context.conversation.basis)}).
                  </div>
                )}
                <button
                  type="button"
                  role="radio"
                  aria-checked={selectedConversationChoice === "none"}
                  onClick={() => setSelectedConversationChoice("none")}
                  className={cn(
                    "block w-full rounded-md border px-2.5 py-1.5 text-left text-xs text-muted-foreground",
                    selectedConversationChoice === "none" ? "border-primary bg-primary/10" : "hover:bg-muted",
                  )}
                >
                  none
                </button>
              </div>
            ) : null}
          </section>

          {/* Generated base prompt — always visible, even before any additional input */}
          <section className="space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Generated base prompt
            </div>
            <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-2.5 font-mono text-[11px] leading-snug">
              {basePrompt || "…"}
            </pre>
          </section>

          {/* Final prompt preview — base + additional_user_input, updates live */}
          <section className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Final prompt preview
              {previewLoading && <Loader2 className="h-3 w-3 animate-spin" />}
            </div>
            <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-2.5 font-mono text-[11px] leading-snug">
              {finalPrompt || basePrompt || "…"}
            </pre>
          </section>
        </>
      )}
    </div>
  );
}
