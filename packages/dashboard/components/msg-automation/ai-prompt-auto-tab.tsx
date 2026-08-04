"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserReportSelection } from "@/lib/effective-report";

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

interface ReportCategoryOption {
  id: string;
  displayName: string;
}

interface ReportBrowseItem {
  address: string;
  name: string;
}

function TextAction({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-sm text-primary underline underline-offset-2 hover:text-primary/80"
    >
      {label}
    </button>
  );
}

function PlainNameLink({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left text-sm font-medium text-foreground underline underline-offset-2 hover:text-primary"
    >
      {label}
    </button>
  );
}

interface AiPromptAutoTabProps {
  loading: boolean;
  error: string | null;

  autoReportAddress: string | null;
  autoReportName: string | null;
  userReport: UserReportSelection;
  userReportName: string | null;
  onSelectUserReport: (selection: UserReportSelection) => void;

  conversationFound: boolean;
  conversationChannel: string | null;
  conversationDisplayName: string | null;
  aiRecommendedConversationIsFound: boolean;
  conversationCandidates: AiPromptConversationCandidate[];
  conversationSelection: AiPromptConversationSelection;
  onSelectConversation: (selection: AiPromptConversationSelection) => void;
  onOpenConversation: () => void;
}

/**
 * Compact Auto context: two lines under Conversation and Report
 * (Auto Pick + Your Pick). Pickers open only via Change / Your Pick name.
 */
export function AiPromptAutoTab({
  loading,
  error,
  autoReportAddress,
  autoReportName,
  userReport,
  userReportName,
  onSelectUserReport,
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
  const [reportChangeOpen, setReportChangeOpen] = useState(false);
  const [reportSearch, setReportSearch] = useState("");
  const [categories, setCategories] = useState<ReportCategoryOption[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [browseReports, setBrowseReports] = useState<ReportBrowseItem[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);

  const autoPickConversation = aiRecommendedConversationIsFound
    ? conversationDisplayName?.trim() || conversationChannel || "Conversation"
    : "None";

  const yourPickConversation = useMemo(() => {
    if (conversationSelection.kind === "none") return "None";
    if (conversationSelection.kind === "found") {
      return conversationDisplayName?.trim() || conversationChannel || "Conversation";
    }
    const match = conversationCandidates.find((c) => c.conversationId === conversationSelection.conversationId);
    return match?.displayName?.trim() || conversationSelection.conversationName;
  }, [conversationSelection, conversationDisplayName, conversationChannel, conversationCandidates]);

  const autoPickReport = autoReportAddress ? autoReportName?.trim() || "Report" : "None";
  const yourPickReport =
    userReport.status === "report" ? userReportName?.trim() || "Report" : "None";

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

  const filteredBrowseReports = useMemo(() => {
    const q = reportSearch.trim().toLowerCase();
    if (!q) return browseReports;
    return browseReports.filter((r) => r.name.toLowerCase().includes(q));
  }, [browseReports, reportSearch]);

  useEffect(() => {
    if (!reportChangeOpen) return;
    let cancelled = false;
    (async () => {
      setBrowseLoading(true);
      setBrowseError(null);
      try {
        const res = await fetch("/api/reports/categories");
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.success) throw new Error(json.error || "Failed to load categories");
        const cats: ReportCategoryOption[] = Array.isArray(json.categories)
          ? json.categories.map((c: { id: string; displayName: string }) => ({
              id: c.id,
              displayName: c.displayName,
            }))
          : [];
        setCategories(cats);
        setCategoryId((prev) => (prev && cats.some((c) => c.id === prev) ? prev : cats[0]?.id ?? ""));
      } catch (err) {
        if (!cancelled) setBrowseError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setBrowseLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportChangeOpen]);

  useEffect(() => {
    if (!reportChangeOpen || !categoryId) {
      if (reportChangeOpen && !categoryId) setBrowseReports([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setBrowseLoading(true);
      setBrowseError(null);
      try {
        const params = new URLSearchParams({ category: categoryId });
        const res = await fetch(`/api/reports?${params.toString()}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.success) throw new Error(json.error || "Failed to load reports");
        setBrowseReports(
          Array.isArray(json.reports)
            ? json.reports.map((r: { address: string; name: string }) => ({
                address: r.address,
                name: r.name,
              }))
            : [],
        );
      } catch (err) {
        if (!cancelled) {
          setBrowseError(err instanceof Error ? err.message : String(err));
          setBrowseReports([]);
        }
      } finally {
        if (!cancelled) setBrowseLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportChangeOpen, categoryId]);

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

  function pickReport(selection: UserReportSelection) {
    onSelectUserReport(selection);
    setReportChangeOpen(false);
    setReportSearch("");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-3">
          <section className="space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Conversation
            </div>
            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-sm">
              <span className="font-medium">{autoPickConversation}</span>
              <span className="text-muted-foreground">(Auto Pick)</span>
              <TextAction
                label="(Change)"
                onClick={() => setConversationChangeOpen((v) => !v)}
              />
            </div>
            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-sm">
              {yourPickConversation !== "None" ? (
                <PlainNameLink label={yourPickConversation} onClick={onOpenConversation} />
              ) : (
                <span className="font-medium text-muted-foreground">None</span>
              )}
              <span className="text-muted-foreground">(Your Pick)</span>
            </div>

            {conversationChangeOpen && (
              <div className="space-y-1.5 rounded-lg border p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={conversationSearch}
                    onChange={(e) => setConversationSearch(e.target.value)}
                    placeholder="Search conversations…"
                    className="h-8 pl-8 text-xs"
                  />
                </div>
                <div className="max-h-40 overflow-y-auto">
                  {conversationFound && (
                    <button
                      type="button"
                      onClick={() => pickConversation({ kind: "found" })}
                      className={cn(
                        "block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-muted",
                        conversationSelection.kind === "found" && "bg-primary/10 font-medium text-primary",
                      )}
                    >
                      {autoPickConversation}
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
                    None
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
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Report</div>
            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-sm">
              <span className="font-medium">{autoPickReport}</span>
              <span className="text-muted-foreground">(Auto Pick)</span>
              <TextAction label="(Change)" onClick={() => setReportChangeOpen((v) => !v)} />
            </div>
            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-sm">
              {yourPickReport !== "None" ? (
                <PlainNameLink label={yourPickReport} onClick={() => setReportChangeOpen(true)} />
              ) : (
                <TextAction label="None" onClick={() => setReportChangeOpen(true)} />
              )}
              <span className="text-muted-foreground">(Your Pick)</span>
            </div>

            {reportChangeOpen && (
              <div className="space-y-1.5 rounded-lg border p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={reportSearch}
                    onChange={(e) => setReportSearch(e.target.value)}
                    placeholder="Search reports..."
                    className="h-8 pl-8 text-xs"
                  />
                </div>
                <Select
                  value={categoryId || undefined}
                  onValueChange={(v) => {
                    setCategoryId(v);
                    setReportSearch("");
                  }}
                  disabled={categories.length === 0 || browseLoading}
                >
                  <SelectTrigger size="sm" className="h-8 w-full text-xs">
                    <SelectValue placeholder="Report type" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">
                        {c.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {browseError && (
                  <div className="px-1 text-xs text-destructive">{browseError}</div>
                )}
                <div className="max-h-40 overflow-y-auto">
                  {browseLoading ? (
                    <div className="flex items-center gap-2 px-1 py-1.5 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading…
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => pickReport({ status: "none" })}
                        className={cn(
                          "block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-muted",
                          userReport.status === "none" && "bg-primary/10 font-medium text-primary",
                        )}
                      >
                        None
                      </button>
                      {autoReportAddress && (
                        <button
                          type="button"
                          onClick={() => pickReport({ status: "unset" })}
                          className={cn(
                            "block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-muted",
                            userReport.status === "unset" && "bg-primary/10 font-medium text-primary",
                          )}
                        >
                          {autoPickReport}
                          <span className="text-muted-foreground"> · use Auto Pick</span>
                        </button>
                      )}
                      {filteredBrowseReports.map((r) => (
                        <button
                          key={r.address}
                          type="button"
                          onClick={() => pickReport({ status: "report", address: r.address })}
                          className={cn(
                            "block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-muted",
                            userReport.status === "report" &&
                              userReport.address === r.address &&
                              "bg-primary/10 font-medium text-primary",
                          )}
                        >
                          {r.name}
                        </button>
                      ))}
                      {!browseLoading && filteredBrowseReports.length === 0 && (
                        <div className="px-1 py-1.5 text-xs text-muted-foreground">No reports.</div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/** @deprecated kept for callers that still import the constant */
export const AI_PROMPT_NONE_REPORT_ADDRESS = "__none__";
