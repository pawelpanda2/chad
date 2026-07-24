"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { EditorPageShell } from "@/components/shared/editor-page-shell";
import { NavGroup } from "@/components/shared/nav-group";
import { BeeperConversationView } from "@/components/shared/beeper-conversation-view";
import { TextEditorWithToolbar } from "@/components/shared/text-editor-with-toolbar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
  RefreshCw,
} from "lucide-react";

type Operation =
  | "health"
  | "capital"
  | "next-message"
  | "improve"
  | "full-analysis";

type Freshness = "current" | "outdated" | "not-analyzed" | "no-data";

interface School {
  id: string;
  tabLabel: string;
  fullName: string;
  order: number;
  enabled: boolean;
}

interface AnalysisRun {
  schoolId: string;
  operation: Operation;
  itemName: string;
  loca: string;
  conversationHash: string | null;
  createdAt: string | null;
  freshness: Freshness;
  payload: Record<string, unknown> | null;
}

interface ReportSummary {
  name: string | null;
  category: string | null;
  address: string | null;
  found: boolean;
  preview: string | null;
  body: string | null;
}

interface Bootstrap {
  leadName: string;
  leadLoca: string;
  schools: School[];
  approachContext: string;
  proposals: string;
  historicalYouSuggestion: string | null;
  reports: ReportSummary[];
  conversation: {
    found: boolean;
    body: string | null;
    channel: string | null;
    hash: string | null;
    error?: string;
  };
  analysis: AnalysisRun[];
  relatedWorkouts: Array<{ logicalName: string; loca: string }>;
}

type Level1 = "you" | string; // school id
type YouTab = "proposals" | "reports";
type SchoolTab = "health" | "capital" | "next-message" | "improve";

function freshnessLabel(f: Freshness): string {
  switch (f) {
    case "current":
      return "Current";
    case "outdated":
      return "Outdated";
    case "no-data":
      return "No data";
    default:
      return "Not analyzed yet";
  }
}

function AnalysisStatusBadge({ freshness }: { freshness: Freshness }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-md border px-2 py-0.5 text-xs font-medium",
        freshness === "current" && "border-green-600/40 text-green-700 dark:text-green-400",
        freshness === "outdated" && "border-amber-600/40 text-amber-700 dark:text-amber-400",
        (freshness === "not-analyzed" || freshness === "no-data") &&
          "border-muted-foreground/30 text-muted-foreground"
      )}
    >
      {freshnessLabel(freshness)}
    </span>
  );
}

export default function MessageCreatorPage() {
  return (
    <Suspense fallback={null}>
      <MessageCreatorPageContent />
    </Suspense>
  );
}

function MessageCreatorPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const leadName = searchParams.get("leadName") ?? "";
  const leadLoca = searchParams.get("leadLoca") ?? "";

  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [level1, setLevel1] = useState<Level1>("you");
  const [youTab, setYouTab] = useState<YouTab>("proposals");
  const [schoolTab, setSchoolTab] = useState<SchoolTab>("health");

  const [approachOpen, setApproachOpen] = useState(true);
  const [approachText, setApproachText] = useState("");
  const [approachSaving, setApproachSaving] = useState(false);
  const [approachSaved, setApproachSaved] = useState(false);

  const [proposalsText, setProposalsText] = useState("");
  const [proposalsSaving, setProposalsSaving] = useState(false);
  const [proposalsSaved, setProposalsSaved] = useState(false);

  const [improveInput, setImproveInput] = useState("");
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [fullAnalysisOpen, setFullAnalysisOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);

  const loadBootstrap = useCallback(async () => {
    if (!leadName || !leadLoca) {
      setError("Missing leadName or leadLoca");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/leads/message-creator?leadName=${encodeURIComponent(leadName)}&leadLoca=${encodeURIComponent(leadLoca)}`
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Failed to load (${res.status})`);
      }
      const data = json.data as Bootstrap;
      setBootstrap(data);
      setApproachText(data.approachContext ?? "");
      setProposalsText(data.proposals ?? "");
      if (!data.proposals?.trim() && data.historicalYouSuggestion) {
        // Soft import suggestion only — user must Save to persist
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [leadName, leadLoca]);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  const selectedSchool = useMemo(() => {
    if (level1 === "you" || !bootstrap) return null;
    return bootstrap.schools.find((s) => s.id === level1) ?? null;
  }, [level1, bootstrap]);

  const runFor = useCallback(
    (schoolId: string, operation: Operation): AnalysisRun | undefined =>
      bootstrap?.analysis.find((a) => a.schoolId === schoolId && a.operation === operation),
    [bootstrap]
  );

  const conversationStatus = !bootstrap
    ? ""
    : bootstrap.conversation.found
      ? `Loaded${bootstrap.conversation.channel ? ` · ${bootstrap.conversation.channel}` : ""}`
      : "No conversation found";

  async function saveApproach() {
    if (!leadLoca) return;
    setApproachSaving(true);
    setApproachSaved(false);
    try {
      const res = await fetch("/api/leads/message-creator", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "approach", leadLoca, text: approachText }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Save failed");
      setApproachSaved(true);
      setTimeout(() => setApproachSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApproachSaving(false);
    }
  }

  async function saveProposals() {
    if (!leadLoca) return;
    setProposalsSaving(true);
    setProposalsSaved(false);
    try {
      const res = await fetch("/api/leads/message-creator", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "proposals", leadLoca, text: proposalsText }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Save failed");
      setProposalsSaved(true);
      setTimeout(() => setProposalsSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProposalsSaving(false);
    }
  }

  async function runAi(operation: Operation, userInput?: string) {
    if (!selectedSchool || !leadName || !leadLoca) return;
    setAiBusy(true);
    setAiMessage(null);
    try {
      const res = await fetch("/api/leads/message-creator/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadName,
          leadLoca,
          schoolId: selectedSchool.id,
          operation,
          userInput,
          force: true,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "AI request failed");
      const status = json.data?.status as string;
      if (status === "PROMPT_NOT_CONFIGURED") {
        setAiMessage("Not configured");
      } else if (status === "NO_CONVERSATION") {
        setAiMessage("No conversation found");
      } else {
        setAiMessage(json.data?.message || status);
      }
      await loadBootstrap();
    } catch (err) {
      setAiMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setAiBusy(false);
    }
  }

  function handleBack() {
    if (leadName && leadLoca) {
      router.push(
        `/dashboard/leads/details?leadName=${encodeURIComponent(leadName)}&leadLoca=${encodeURIComponent(leadLoca)}`
      );
    } else {
      router.push("/dashboard/leads");
    }
  }

  if (loading) {
    return (
      <EditorPageShell>
        <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading Message Creator…
        </div>
      </EditorPageShell>
    );
  }

  if (error && !bootstrap) {
    return (
      <EditorPageShell>
        <div className="flex items-center gap-2 p-4 text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
        <Button variant="outline" className="m-4 w-fit" onClick={handleBack}>
          Back
        </Button>
      </EditorPageShell>
    );
  }

  return (
    <EditorPageShell>
      <div className="flex shrink-0 items-center gap-2 border-b px-2 py-1.5 pl-14">
        <NavGroup upLevel={{ onClick: handleBack, label: "Back to lead" }} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{leadName || "Message Creator"}</h1>
          <p className="truncate text-xs text-muted-foreground">
            Message Creator · {conversationStatus}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0"
          onClick={() => loadBootstrap()}
          disabled={loading}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </div>

      {error && (
        <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,1.15fr)] md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:grid-rows-1">
        {/* Conversation pane */}
        <section className="flex min-h-0 flex-col border-b md:border-b-0 md:border-r">
          <div className="shrink-0 border-b px-3 py-2 text-xs font-medium text-muted-foreground">
            Conversation
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <BeeperConversationView
              content={bootstrap?.conversation.body ?? null}
              emptyLabel="No conversation found"
              emptyHint="Creator loads the Beeper conversation for this lead automatically."
            />
          </div>
        </section>

        {/* Creator pane */}
        <section className="flex min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-3">
            {/* Approach context */}
            <div className="rounded-lg border">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium"
                onClick={() => setApproachOpen((o) => !o)}
              >
                {approachOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                Approach context
              </button>
              {approachOpen && (
                <div className="space-y-2 border-t px-3 py-2">
                  <Textarea
                    value={approachText}
                    onChange={(e) => {
                      setApproachText(e.target.value);
                      setApproachSaved(false);
                    }}
                    placeholder="3–5 sentences describing the approach…"
                    className="min-h-[88px] text-sm"
                  />
                  <div className="flex items-center gap-2">
                    <Button size="sm" className="h-8" onClick={saveApproach} disabled={approachSaving}>
                      {approachSaving ? "Saving…" : "Save"}
                    </Button>
                    {approachSaved && <span className="text-sm text-green-600">Saved</span>}
                  </div>
                </div>
              )}
            </div>

            {/* Level 1 */}
            <Tabs
              value={level1}
              onValueChange={(v) => setLevel1(v)}
            >
              <TabsList className="h-auto flex-wrap gap-1">
                <TabsTrigger value="you" className="text-xs">
                  You
                </TabsTrigger>
                {(bootstrap?.schools ?? []).map((s) => (
                  <TabsTrigger key={s.id} value={s.id} className="text-xs">
                    {s.tabLabel}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {level1 === "you" ? (
              <div className="space-y-3">
                <p className="text-sm font-medium">You</p>
                <Tabs value={youTab} onValueChange={(v) => setYouTab(v as YouTab)}>
                  <TabsList className="h-auto flex-wrap gap-1">
                    <TabsTrigger value="proposals" className="text-xs">
                      My Proposals
                    </TabsTrigger>
                    <TabsTrigger value="reports" className="text-xs">
                      My Reports
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                {youTab === "proposals" && (
                  <div className="space-y-2">
                    {!proposalsText.trim() && (
                      <p className="text-sm text-muted-foreground">No proposals yet</p>
                    )}
                    {bootstrap?.historicalYouSuggestion && !proposalsText.trim() && (
                      <div className="rounded-md border border-dashed p-2 text-xs">
                        <p className="mb-1 text-muted-foreground">
                          Found historical //you text (not saved until you confirm):
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7"
                          onClick={() =>
                            setProposalsText(bootstrap.historicalYouSuggestion ?? "")
                          }
                        >
                          Use imported text
                        </Button>
                      </div>
                    )}
                    <div className="h-[280px]">
                      <TextEditorWithToolbar
                        value={proposalsText}
                        onChange={(v) => {
                          setProposalsText(v);
                          setProposalsSaved(false);
                        }}
                        onSave={saveProposals}
                        saving={proposalsSaving}
                        saved={proposalsSaved}
                        showPreview
                        defaultTab="editor"
                        placeholder="Write your message proposals…"
                        className="h-full"
                      />
                    </div>
                  </div>
                )}

                {youTab === "reports" && (
                  <div className="space-y-2">
                    {(bootstrap?.reports?.length ?? 0) === 0 ? (
                      <p className="text-sm text-muted-foreground">No reports found</p>
                    ) : (
                      bootstrap!.reports.map((r, i) => {
                        const key = r.address ?? `${r.name}-${i}`;
                        const open = expandedReport === key;
                        return (
                          <div key={key} className="rounded-md border">
                            <button
                              type="button"
                              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm"
                              onClick={() => setExpandedReport(open ? null : key)}
                            >
                              <span className="min-w-0 truncate font-medium">
                                {r.name || "Report"}
                                {r.category ? (
                                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                                    {r.category}
                                  </span>
                                ) : null}
                              </span>
                              {open ? (
                                <ChevronDown className="h-4 w-4 shrink-0" />
                              ) : (
                                <ChevronRight className="h-4 w-4 shrink-0" />
                              )}
                            </button>
                            {open && (
                              <pre className="max-h-64 overflow-auto border-t bg-muted/20 p-3 text-xs whitespace-pre-wrap">
                                {r.body || r.preview || "(empty)"}
                              </pre>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            ) : selectedSchool ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{selectedSchool.fullName}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={aiBusy}
                    onClick={() => {
                      setFullAnalysisOpen(true);
                      void runAi("full-analysis");
                    }}
                  >
                    Analyze Full Conversation
                  </Button>
                </div>

                <Tabs
                  value={schoolTab}
                  onValueChange={(v) => setSchoolTab(v as SchoolTab)}
                >
                  <TabsList className="h-auto flex-wrap gap-1">
                    <TabsTrigger value="health" className="text-xs">
                      Conversation Health
                    </TabsTrigger>
                    <TabsTrigger value="capital" className="text-xs">
                      Capital
                    </TabsTrigger>
                    <TabsTrigger value="next-message" className="text-xs">
                      Next Message
                    </TabsTrigger>
                    <TabsTrigger value="improve" className="text-xs">
                      Improve
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                {aiMessage && (
                  <div className="rounded-md border border-amber-600/30 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    {aiMessage}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-2 h-7"
                      disabled={aiBusy}
                      onClick={() =>
                        void runAi(
                          schoolTab === "improve" ? "improve" : schoolTab,
                          schoolTab === "improve" ? improveInput : undefined
                        )
                      }
                    >
                      Try Again
                    </Button>
                  </div>
                )}

                <SchoolPanel
                  school={selectedSchool}
                  tab={schoolTab}
                  run={runFor(selectedSchool.id, schoolTab)}
                  fullRun={runFor(selectedSchool.id, "full-analysis")}
                  fullAnalysisOpen={fullAnalysisOpen}
                  improveInput={improveInput}
                  onImproveInputChange={setImproveInput}
                  aiBusy={aiBusy}
                  onAnalyze={(op) => void runAi(op, op === "improve" ? improveInput : undefined)}
                />
              </div>
            ) : null}

            {(bootstrap?.relatedWorkouts?.length ?? 0) > 0 && (
              <div className="border-t pt-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Related workouts</p>
                <ul className="space-y-1 text-sm">
                  {bootstrap!.relatedWorkouts
                    .filter((w) => w.logicalName !== "my proposals")
                    .slice(0, 12)
                    .map((w) => (
                      <li key={w.loca}>
                        <Link
                          className="text-primary hover:underline"
                          href={`/dashboard/leads/msg-workout?leadName=${encodeURIComponent(leadName)}&leadLoca=${encodeURIComponent(leadLoca)}&workoutName=${encodeURIComponent(w.logicalName)}&workoutLoca=${encodeURIComponent(w.loca)}`}
                        >
                          {w.logicalName}
                        </Link>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      </div>
    </EditorPageShell>
  );
}

function SchoolPanel({
  school,
  tab,
  run,
  fullRun,
  fullAnalysisOpen,
  improveInput,
  onImproveInputChange,
  aiBusy,
  onAnalyze,
}: {
  school: School;
  tab: SchoolTab;
  run?: AnalysisRun;
  fullRun?: AnalysisRun;
  fullAnalysisOpen: boolean;
  improveInput: string;
  onImproveInputChange: (v: string) => void;
  aiBusy: boolean;
  onAnalyze: (op: Operation) => void;
}) {
  const freshness: Freshness = run?.freshness ?? "not-analyzed";
  const configured =
    run?.payload &&
    typeof run.payload === "object" &&
    (run.payload as { reason?: string }).reason === "PROMPT_NOT_CONFIGURED"
      ? false
      : run != null && freshness !== "not-analyzed";

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <AnalysisStatusBadge
          freshness={
            run?.payload &&
            (run.payload as { reason?: string }).reason === "PROMPT_NOT_CONFIGURED"
              ? "no-data"
              : freshness
          }
        />
        <span className="text-xs text-muted-foreground">{school.tabLabel}</span>
        <Button
          size="sm"
          className="ml-auto h-8"
          disabled={aiBusy}
          onClick={() => onAnalyze(tab)}
        >
          {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Analyze"}
        </Button>
      </div>

      {tab === "health" && (
        <p className="text-sm text-muted-foreground">
          {configured && typeof run?.payload?.score === "number"
            ? `Score: ${run.payload.score}/10`
            : run?.payload && (run.payload as { reason?: string }).reason === "PROMPT_NOT_CONFIGURED"
              ? "Not configured"
              : freshnessLabel(freshness)}
        </p>
      )}

      {tab === "capital" && (
        <p className="text-sm text-muted-foreground">
          {configured && run?.payload?.value != null
            ? `Capital: ${String(run.payload.value)}${
                run.payload.delta != null ? ` (Δ ${String(run.payload.delta)})` : ""
              }`
            : run?.payload && (run.payload as { reason?: string }).reason === "PROMPT_NOT_CONFIGURED"
              ? "Not configured"
              : freshnessLabel(freshness)}
        </p>
      )}

      {tab === "next-message" && (
        <div className="space-y-2">
          {typeof run?.payload?.message === "string" ? (
            <>
              <p className="text-xs text-muted-foreground">From {school.fullName}</p>
              <pre className="whitespace-pre-wrap rounded-md bg-muted/30 p-2 text-sm">
                {run.payload.message as string}
              </pre>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() =>
                  void navigator.clipboard.writeText(String(run.payload?.message ?? ""))
                }
              >
                <Copy className="mr-1 h-3.5 w-3.5" />
                Copy
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {run?.payload && (run.payload as { reason?: string }).reason === "PROMPT_NOT_CONFIGURED"
                ? "Not configured"
                : freshnessLabel(freshness)}
            </p>
          )}
        </div>
      )}

      {tab === "improve" && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Your draft</label>
          <Textarea
            value={improveInput}
            onChange={(e) => onImproveInputChange(e.target.value)}
            placeholder="Paste or write your message draft…"
            className="min-h-[100px] text-sm"
          />
          <div className="rounded-md border bg-muted/20 p-2 text-sm text-muted-foreground">
            <p className="mb-1 text-xs font-medium">AI result</p>
            {run?.payload && (run.payload as { reason?: string }).reason === "PROMPT_NOT_CONFIGURED" ? (
              <p>Not configured</p>
            ) : run?.payload ? (
              <pre className="whitespace-pre-wrap text-xs">
                {JSON.stringify(run.payload, null, 2)}
              </pre>
            ) : (
              <p>{freshnessLabel(freshness)}</p>
            )}
          </div>
        </div>
      )}

      {fullAnalysisOpen && (
        <div className="rounded-md border border-dashed p-2 text-sm">
          <p className="mb-1 font-medium">Full conversation analysis</p>
          {fullRun?.payload &&
          (fullRun.payload as { reason?: string }).reason === "PROMPT_NOT_CONFIGURED" ? (
            <p className="text-muted-foreground">Not configured</p>
          ) : fullRun?.payload ? (
            <pre className="whitespace-pre-wrap text-xs">
              {JSON.stringify(fullRun.payload, null, 2)}
            </pre>
          ) : (
            <p className="text-muted-foreground">
              {freshnessLabel(fullRun?.freshness ?? "not-analyzed")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
