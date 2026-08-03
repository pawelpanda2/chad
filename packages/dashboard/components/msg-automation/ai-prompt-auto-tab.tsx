"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { AlertCircle, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AiPromptReportOption {
  address: string;
  name: string | null;
  category: string | null;
  preview: string | null;
}

export interface AiPromptConversationCandidate {
  conversationId: string;
  conversationName: string;
  displayName: string;
  channel?: string;
}

export type AiPromptConversationSelection =
  | { kind: "found" }
  | { kind: "none" }
  | { kind: "manual"; conversationId: string; conversationName: string };

const NONE = "__none__";

function basisLabel(basis: string): string {
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

/** Amber "AI pick" chip — never disappears once a candidate is the AI recommendation, even after a manual re-selection. */
function AiPickChip() {
  return (
    <span className="shrink-0 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber-950 dark:bg-amber-500 dark:text-amber-950">
      AI pick
    </span>
  );
}

/** Green "currently selected" note — tracks the user's active choice independently of the AI pick. */
function SelectedNote() {
  return (
    <span className="mt-1 inline-flex text-xs font-semibold text-green-600 dark:text-green-400">
      currently selected
    </span>
  );
}

function CandidateRow({
  title,
  meta,
  isAiRecommended,
  isSelected,
  onClick,
}: {
  title: string;
  meta?: string;
  isAiRecommended: boolean;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      onClick={onClick}
      className={cn(
        "relative block w-full rounded-lg border px-3 py-2.5 pl-4 text-left text-sm transition-colors",
        isAiRecommended
          ? "border-amber-500/60 bg-amber-500/10 dark:bg-amber-500/15"
          : isSelected
            ? "border-primary/60 bg-muted"
            : "hover:bg-muted",
      )}
    >
      {isAiRecommended && (
        <span className="absolute inset-y-2 left-0 w-1 rounded-r bg-amber-500" aria-hidden="true" />
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium">{title}</div>
          {meta && <div className="mt-0.5 text-xs text-muted-foreground">{meta}</div>}
          {isSelected && <SelectedNote />}
        </div>
        {isAiRecommended && <AiPickChip />}
      </div>
    </button>
  );
}

interface AiPromptAutoTabProps {
  loading: boolean;
  error: string | null;

  reports: AiPromptReportOption[];
  aiRecommendedReportAddress: string | null;
  selectedReportAddress: string;
  onSelectReport: (address: string) => void;

  conversationFound: boolean;
  conversationChannel: string | null;
  conversationBasis: string;
  conversationPreview: string | null;
  conversationError?: string;
  aiRecommendedConversationIsFound: boolean;
  conversationCandidates: AiPromptConversationCandidate[];
  conversationSelection: AiPromptConversationSelection;
  onSelectConversation: (selection: AiPromptConversationSelection) => void;
}

/**
 * AI Prompts → editor workspace, "auto" tab: conversation and report
 * together (never split into separate tabs). Each candidate shows the
 * *AI recommendation* (permanent amber highlight + "AI pick" chip) and the
 * *current selection* (green "currently selected" note) as two
 * independent, simultaneous states — picking a different candidate only
 * moves the green note; the amber highlight never moves off the original
 * AI pick.
 */
export function AiPromptAutoTab({
  loading,
  error,
  reports,
  aiRecommendedReportAddress,
  selectedReportAddress,
  onSelectReport,
  conversationFound,
  conversationChannel,
  conversationBasis,
  conversationPreview,
  conversationError,
  aiRecommendedConversationIsFound,
  conversationCandidates,
  conversationSelection,
  onSelectConversation,
}: AiPromptAutoTabProps) {
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browseSearch, setBrowseSearch] = useState("");

  useEffect(() => {
    if (conversationSelection.kind === "manual") setBrowseOpen(true);
  }, [conversationSelection.kind]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-1 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Fetching report and conversation matches…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        {error}
      </div>
    );
  }

  const filteredCandidates = conversationCandidates.filter((c) =>
    c.conversationName.toLowerCase().includes(browseSearch.trim().toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">auto context</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          AI automatically picks a conversation and a report. Both can be changed manually.
        </p>
      </div>

      <section className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">conversation</div>
        <div role="radiogroup" aria-label="conversation" className="space-y-1.5">
          {conversationFound && (
            <CandidateRow
              title={`${conversationChannel ?? "beeper"} conversation`}
              meta={`basis: ${basisLabel(conversationBasis)}${conversationPreview ? ` · "${conversationPreview.split(/\r?\n/)[0]}"` : ""}`}
              isAiRecommended={aiRecommendedConversationIsFound}
              isSelected={conversationSelection.kind === "found"}
              onClick={() => onSelectConversation({ kind: "found" })}
            />
          )}
          {!conversationFound && (
            <div className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
              No conversation found ({basisLabel(conversationBasis)}
              {conversationError ? `: ${conversationError}` : ""}).
            </div>
          )}
          {conversationSelection.kind === "manual" && (
            <CandidateRow
              title={conversationSelection.conversationName}
              meta="manually selected conversation"
              isAiRecommended={false}
              isSelected
              onClick={() => onSelectConversation(conversationSelection)}
            />
          )}
          <CandidateRow
            title="none"
            meta="Do not attach any conversation."
            isAiRecommended={!aiRecommendedConversationIsFound}
            isSelected={conversationSelection.kind === "none"}
            onClick={() => onSelectConversation({ kind: "none" })}
          />
        </div>

        <button
          type="button"
          onClick={() => setBrowseOpen((v) => !v)}
          className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {browseOpen ? "Hide" : "Browse"} other conversations ({conversationCandidates.length})
        </button>
        {browseOpen && (
          <div className="space-y-1.5 rounded-lg border p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={browseSearch}
                onChange={(e) => setBrowseSearch(e.target.value)}
                placeholder="Search conversations…"
                className="h-8 pl-8 text-xs"
              />
            </div>
            <div className="max-h-40 overflow-y-auto">
              {filteredCandidates.length === 0 ? (
                <div className="px-1 py-1.5 text-xs text-muted-foreground">No matches.</div>
              ) : (
                filteredCandidates.map((c) => (
                  <button
                    key={c.conversationId}
                    type="button"
                    onClick={() =>
                      onSelectConversation({
                        kind: "manual",
                        conversationId: c.conversationId,
                        conversationName: c.conversationName,
                      })
                    }
                    className={cn(
                      "block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-muted",
                      conversationSelection.kind === "manual" &&
                        conversationSelection.conversationId === c.conversationId &&
                        "bg-primary/10 font-medium text-primary",
                    )}
                  >
                    {c.conversationName}
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          The amber AI recommendation never disappears, even after picking a different conversation.
        </div>
      </section>

      <section className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          report {reports.length > 0 && <span className="normal-case">({reports.length} found)</span>}
        </div>
        <div role="radiogroup" aria-label="report" className="space-y-1.5">
          {reports.map((r) => (
            <CandidateRow
              key={r.address}
              title={`${r.category ?? "report"} — ${r.name ?? "full report"}`}
              meta={r.preview ? r.preview.split(/\r?\n/)[0] : undefined}
              isAiRecommended={r.address === aiRecommendedReportAddress}
              isSelected={selectedReportAddress === r.address}
              onClick={() => onSelectReport(r.address)}
            />
          ))}
          <CandidateRow
            title="none"
            meta="Do not attach any report."
            isAiRecommended={aiRecommendedReportAddress === null}
            isSelected={selectedReportAddress === NONE}
            onClick={() => onSelectReport(NONE)}
          />
        </div>

        <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          The amber AI recommendation stays visible after a manual report change too.
        </div>
      </section>
    </div>
  );
}

export { NONE as AI_PROMPT_NONE_REPORT_ADDRESS };
