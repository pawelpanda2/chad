"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
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

/** Orange chip — permanent AI recommendation label. */
function AutoPickChip() {
  return (
    <span className="shrink-0 rounded-md bg-amber-400 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber-950 dark:bg-amber-500 dark:text-amber-950">
      Auto Pick
    </span>
  );
}

/** Green chip — user's current selection. */
function YourPickChip() {
  return (
    <span className="shrink-0 rounded-md bg-green-500 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white dark:bg-green-600">
      Your Pick
    </span>
  );
}

/** Amber "AI pick" chip for report rows (legacy report UI). */
function AiPickChip() {
  return (
    <span className="shrink-0 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber-950 dark:bg-amber-500 dark:text-amber-950">
      AI pick
    </span>
  );
}

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

function PreviewLink({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  if (disabled) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left text-sm font-medium text-primary underline underline-offset-2 hover:text-primary/80"
    >
      {label}
    </button>
  );
}

function ScrollPicker({
  search,
  onSearchChange,
  searchPlaceholder,
  children,
  emptyLabel,
  hasItems,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  children: React.ReactNode;
  emptyLabel: string;
  hasItems: boolean;
}) {
  return (
    <div className="space-y-1.5 rounded-lg border p-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-8 pl-8 text-xs"
        />
      </div>
      <div className="max-h-40 overflow-y-auto">
        {!hasItems ? (
          <div className="px-1 py-1.5 text-xs text-muted-foreground">{emptyLabel}</div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

interface AiPromptAutoTabProps {
  loading: boolean;
  error: string | null;

  reports: AiPromptReportOption[];
  aiRecommendedReportAddress: string | null;
  selectedReportAddress: string;
  onSelectReport: (address: string) => void;
  onOpenReport: () => void;

  conversationFound: boolean;
  conversationChannel: string | null;
  conversationBasis: string;
  conversationPreview: string | null;
  conversationError?: string;
  /** Beeper display name for the AI-found conversation (e.g. "Claudia Delfin"). */
  conversationDisplayName: string | null;
  aiRecommendedConversationIsFound: boolean;
  conversationCandidates: AiPromptConversationCandidate[];
  conversationSelection: AiPromptConversationSelection;
  onSelectConversation: (selection: AiPromptConversationSelection) => void;
  onOpenConversation: () => void;
}

/**
 * AI Prompts → editor workspace, "auto" tab. Conversation: compact Auto Pick
 * (orange) + Your Pick (green) rows; Change reveals the browse list. Report
 * section still shows AI recommendation vs current selection independently.
 */
export function AiPromptAutoTab({
  loading,
  error,
  reports,
  aiRecommendedReportAddress,
  selectedReportAddress,
  onSelectReport,
  onOpenReport,
  conversationFound,
  conversationChannel,
  conversationDisplayName,
  aiRecommendedConversationIsFound,
  conversationCandidates,
  conversationSelection,
  onSelectConversation,
  onOpenConversation,
}: AiPromptAutoTabProps) {
  const [conversationChangeOpen, setConversationChangeOpen] = useState(false);
  const [conversationSearch, setConversationSearch] = useState("");
  const [reportSearch, setReportSearch] = useState("");

  const autoPickLabel = aiRecommendedConversationIsFound
    ? conversationDisplayName?.trim() || conversationChannel || "Conversation"
    : "none";

  const yourPickLabel = useMemo(() => {
    if (conversationSelection.kind === "none") return "none";
    if (conversationSelection.kind === "found") {
      return conversationDisplayName?.trim() || conversationChannel || "Conversation";
    }
    const match = conversationCandidates.find((c) => c.conversationId === conversationSelection.conversationId);
    return match?.displayName?.trim() || conversationSelection.conversationName;
  }, [conversationSelection, conversationDisplayName, conversationChannel, conversationCandidates]);

  const filteredCandidates = useMemo(() => {
    const q = conversationSearch.trim().toLowerCase();
    if (!q) return conversationCandidates;
    return conversationCandidates.filter(
      (c) =>
        c.displayName.toLowerCase().includes(q) ||
        c.conversationName.toLowerCase().includes(q) ||
        (c.channel ?? "").toLowerCase().includes(q),
    );
  }, [conversationCandidates, conversationSearch]);

  const filteredReports = useMemo(() => {
    const q = reportSearch.trim().toLowerCase();
    if (!q) return reports;
    return reports.filter(
      (r) =>
        (r.name ?? "").toLowerCase().includes(q) ||
        (r.category ?? "").toLowerCase().includes(q) ||
        (r.preview ?? "").toLowerCase().includes(q),
    );
  }, [reports, reportSearch]);

  const selectedReport = reports.find((r) => r.address === selectedReportAddress) ?? null;
  const reportLinkLabel =
    selectedReportAddress !== NONE && selectedReport
      ? selectedReport.name?.trim() || selectedReport.category || "Report"
      : null;

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

  function pickConversation(selection: AiPromptConversationSelection) {
    onSelectConversation(selection);
    setConversationChangeOpen(false);
    setConversationSearch("");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3">
          <section className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">conversation</div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{autoPickLabel}</span>
              <AutoPickChip />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setConversationChangeOpen((v) => !v)}
              >
                Change
              </Button>
              {yourPickLabel !== "none" ? (
                <PreviewLink label={yourPickLabel} onClick={onOpenConversation} />
              ) : (
                <span className="text-sm font-medium text-muted-foreground">none</span>
              )}
              <YourPickChip />
            </div>

            {conversationChangeOpen && (
              <ScrollPicker
                search={conversationSearch}
                onSearchChange={setConversationSearch}
                searchPlaceholder="Search conversations…"
                emptyLabel="No matches."
                hasItems
              >
                {conversationFound && (
                  <button
                    type="button"
                    onClick={() => pickConversation({ kind: "found" })}
                    className={cn(
                      "block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-muted",
                      conversationSelection.kind === "found" && "bg-primary/10 font-medium text-primary",
                    )}
                  >
                    {autoPickLabel}
                    <span className="text-muted-foreground"> · auto</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => pickConversation({ kind: "none" })}
                  className={cn(
                    "block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-muted",
                    conversationSelection.kind === "none" && "bg-primary/10 font-medium text-primary",
                  )}
                >
                  none
                </button>
                {filteredCandidates.map((c) => (
                  <button
                    key={c.conversationId}
                    type="button"
                    onClick={() =>
                      pickConversation({
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
                    {c.displayName || c.conversationName}
                    {c.channel ? (
                      <span className="text-muted-foreground"> · {c.channel}</span>
                    ) : null}
                  </button>
                ))}
              </ScrollPicker>
            )}
          </section>

          <section className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              report {reports.length > 0 && <span className="normal-case">({reports.length} found)</span>}
            </div>
            <div role="radiogroup" aria-label="report" className="space-y-1.5">
              {aiRecommendedReportAddress &&
                (() => {
                  const aiReport = reports.find((r) => r.address === aiRecommendedReportAddress);
                  if (!aiReport) return null;
                  return (
                    <CandidateRow
                      title={`${aiReport.category ?? "report"} — ${aiReport.name ?? "full report"}`}
                      meta={aiReport.preview ? aiReport.preview.split(/\r?\n/)[0] : undefined}
                      isAiRecommended
                      isSelected={selectedReportAddress === aiReport.address}
                      onClick={() => onSelectReport(aiReport.address)}
                    />
                  );
                })()}
              {selectedReport &&
                selectedReport.address !== aiRecommendedReportAddress && (
                  <CandidateRow
                    title={`${selectedReport.category ?? "report"} — ${selectedReport.name ?? "full report"}`}
                    meta={selectedReport.preview ? selectedReport.preview.split(/\r?\n/)[0] : undefined}
                    isAiRecommended={false}
                    isSelected
                    onClick={() => onSelectReport(selectedReport.address)}
                  />
                )}
              <CandidateRow
                title="none"
                meta="Do not attach any report."
                isAiRecommended={aiRecommendedReportAddress === null}
                isSelected={selectedReportAddress === NONE}
                onClick={() => onSelectReport(NONE)}
              />
            </div>

            {reportLinkLabel && <PreviewLink label={reportLinkLabel} onClick={onOpenReport} />}

            <ScrollPicker
              search={reportSearch}
              onSearchChange={setReportSearch}
              searchPlaceholder="Search reports…"
              emptyLabel={reports.length === 0 ? "No reports available." : "No matches."}
              hasItems={filteredReports.length > 0}
            >
              {filteredReports.map((r) => (
                <button
                  key={r.address}
                  type="button"
                  onClick={() => onSelectReport(r.address)}
                  className={cn(
                    "block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-muted",
                    selectedReportAddress === r.address && "bg-primary/10 font-medium text-primary",
                  )}
                >
                  {r.name ?? "full report"}
                  {r.category ? <span className="text-muted-foreground"> · {r.category}</span> : null}
                </button>
              ))}
            </ScrollPicker>
          </section>
        </div>
      </div>
    </div>
  );
}

export { NONE as AI_PROMPT_NONE_REPORT_ADDRESS };
