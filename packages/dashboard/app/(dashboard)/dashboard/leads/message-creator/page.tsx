"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { EditorPageShell } from "@/components/shared/editor-page-shell";
import { NavGroup } from "@/components/shared/nav-group";
import {
  BeeperConversationView,
  type ParsedWhatsAppMessage,
} from "@/components/shared/beeper-conversation-view";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
} from "lucide-react";

type Mode = "beeper" | "analysis";

interface PromptVersion {
  id: string;
  displayName: string;
  schoolId: string;
  order: number;
  enabled: boolean;
}

interface LlmModel {
  id: string;
  displayName: string;
  order: number;
  enabled: boolean;
}

interface AnalysisRun {
  schoolId: string;
  operation: string;
  itemName: string;
  loca: string;
  conversationHash: string | null;
  createdAt: string | null;
  freshness: string;
  payload: Record<string, unknown> | null;
  targetMessageId: string | null;
  promptVersionId: string | null;
  modelId: string | null;
  runNumber: number | null;
  proposalText: string | null;
  status: string | null;
}

interface Bootstrap {
  leadName: string;
  leadLoca: string;
  schools: unknown[];
  promptVersions: PromptVersion[];
  models: LlmModel[];
  approachContext: string;
  proposals: string;
  historicalYouSuggestion: string | null;
  reports: Array<{ name: string | null; preview: string | null; body: string | null }>;
  conversation: {
    found: boolean;
    body: string | null;
    channel: string | null;
    hash: string | null;
    error?: string;
    messages: ParsedWhatsAppMessage[];
  };
  allRuns: AnalysisRun[];
  messageRunCounts: Record<string, Record<string, number>>;
  /** Story 88 — the published AI Prompts registry entry "Send new" will actually run, or null. */
  resolvedPrompt: { id: string; slug: string; name: string; publishedVersion?: number } | null;
}

interface PromptOption {
  value: string;
  label: string;
  isOpen: boolean;
  promptVersionId: string | null;
  count: number;
}

const OPEN_VALUE = "__open__";
const DEFAULT_SIDE_PCT = 36;
const MAX_SHIFT_PX = 50;

/** Mirrors dba/buildMessagePromptVersionOptions — single client source for both selects. */
function buildPromptOptions(
  versions: PromptVersion[],
  countsByVersionId: Record<string, number>
): PromptOption[] {
  const rows = versions.map((v) => ({
    id: v.id,
    displayName: v.displayName,
    order: v.order,
    count: countsByVersionId[v.id] ?? 0,
  }));
  rows.sort((a, b) => {
    const aPos = a.count > 0 ? 1 : 0;
    const bPos = b.count > 0 ? 1 : 0;
    if (aPos !== bPos) return bPos - aPos;
    if (a.count !== b.count) return b.count - a.count;
    return a.order - b.order;
  });
  const sum = rows.reduce((acc, r) => acc + (r.count > 0 ? r.count : 0), 0);
  return [
    {
      value: OPEN_VALUE,
      label: `Open (${sum})`,
      isOpen: true,
      promptVersionId: null,
      count: sum,
    },
    ...rows.map((r) => ({
      value: r.id,
      label: `${r.displayName} (${r.count})`,
      isOpen: false,
      promptVersionId: r.id,
      count: r.count,
    })),
  ];
}

function analysisContextMessageIds(
  messages: ParsedWhatsAppMessage[],
  targetMessageId: string
): string[] {
  const idx = messages.findIndex((m) => m.id === targetMessageId);
  if (idx < 0) return [];
  const target = messages[idx];
  if (target.sender === "she") {
    let start = idx;
    while (start > 0 && messages[start - 1].sender === "she") start -= 1;
    return messages.slice(start, idx + 1).map((m) => m.id);
  }
  if (target.sender === "you") {
    const framed: string[] = [];
    let i = idx - 1;
    while (i >= 0 && messages[i].sender === "she") {
      framed.unshift(messages[i].id);
      i -= 1;
    }
    framed.push(target.id);
    return framed;
  }
  return [target.id];
}

function payloadString(payload: Record<string, unknown> | null, keys: string[]): string | null {
  if (!payload) return null;
  for (const key of keys) {
    const v = payload[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

function payloadMistakes(
  payload: Record<string, unknown> | null
): Array<{ title: string; body: string }> {
  if (!payload) return [];
  const raw = payload.mistakes ?? payload.errors;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === "string") return { title: "Mistake", body: item };
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        return {
          title: String(o.title ?? o.name ?? "Mistake"),
          body: String(o.body ?? o.description ?? o.text ?? ""),
        };
      }
      return null;
    })
    .filter((x): x is { title: string; body: string } => Boolean(x && x.body));
}

function splitYouProposals(text: string): string[] {
  return text
    .split(/\n{2,}|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function MessageCreatorLeadPicker() {
  const router = useRouter();
  const [leads, setLeads] = useState<
    Array<{ leadKey: string; leadName: string; loca: string; hasContacts: boolean }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/leads-dashboard");
        const json = await res.json();
        if (!res.ok || json?.ok === false) {
          throw new Error(json?.error || `Failed to load leads (${res.status})`);
        }
        if (!cancelled) setLeads(Array.isArray(json) ? json : []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) => l.leadName.toLowerCase().includes(q));
  }, [leads, filter]);

  return (
    <EditorPageShell>
      <div className="flex shrink-0 items-center gap-2 border-b px-2 py-1.5 pl-14">
        <NavGroup upLevel={{ href: "/dashboard/msg-automation", label: "Msg Auto" }} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">Message Creator</h1>
          <p className="truncate text-xs text-muted-foreground">Pick a lead to open</p>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter leads…"
          className="h-9 w-full max-w-md rounded-md border bg-background px-3 text-sm"
        />
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading leads…
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No leads found.</p>
        ) : (
          <ul className="min-h-0 flex-1 divide-y overflow-y-auto rounded-md border">
            {filtered.map((lead) => (
              <li key={lead.leadKey || `${lead.leadName}:${lead.loca}`}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted"
                  onClick={() =>
                    router.push(
                      `/dashboard/leads/message-creator?leadName=${encodeURIComponent(lead.leadName)}&leadLoca=${encodeURIComponent(lead.loca)}`
                    )
                  }
                >
                  <span className="min-w-0 truncate font-medium">{lead.leadName}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {lead.hasContacts ? "Has contacts" : "Open →"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </EditorPageShell>
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
  const [loading, setLoading] = useState(Boolean(leadName && leadLoca));
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("beeper");
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [topPromptValue, setTopPromptValue] = useState("");
  const [selectedPromptVersionId, setSelectedPromptVersionId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [activeRunLoca, setActiveRunLoca] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);

  const [proposalsText, setProposalsText] = useState("");
  const [draftProposal, setDraftProposal] = useState("");
  const [proposalsOpen, setProposalsOpen] = useState(false);
  const [proposalsSaving, setProposalsSaving] = useState(false);

  const [approachOpen, setApproachOpen] = useState(false);
  const [approachText, setApproachText] = useState("");
  const [approachSaving, setApproachSaving] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);

  const shellRef = useRef<HTMLDivElement>(null);
  const [sideWidthPx, setSideWidthPx] = useState<number | null>(null);
  const defaultSideWidthRef = useRef<number | null>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const loadBootstrap = useCallback(async () => {
    if (!leadName || !leadLoca) {
      setBootstrap(null);
      setError(null);
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
      if (!selectedModelId && data.models[0]) {
        setSelectedModelId(data.models[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [leadName, leadLoca, selectedModelId]);

  useEffect(() => {
    loadBootstrap();
    // intentionally only on lead change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadName, leadLoca]);

  useEffect(() => {
    if (mode !== "analysis" || !shellRef.current) return;
    if (defaultSideWidthRef.current != null) return;
    const w = shellRef.current.getBoundingClientRect().width;
    const def = Math.round((w * DEFAULT_SIDE_PCT) / 100);
    defaultSideWidthRef.current = def;
    setSideWidthPx(def);
  }, [mode]);

  const messages = bootstrap?.conversation.messages ?? [];
  const promptVersions = bootstrap?.promptVersions ?? [];
  const messageRunCounts = bootstrap?.messageRunCounts ?? {};

  const optionsForSelected = useMemo(() => {
    if (!selectedMessageId) return [];
    return buildPromptOptions(promptVersions, messageRunCounts[selectedMessageId] ?? {});
  }, [selectedMessageId, promptVersions, messageRunCounts]);

  const analysisEnabled = Boolean(
    selectedMessageId && selectedPromptVersionId && selectedPromptVersionId !== OPEN_VALUE
  );

  const messageRuns = useMemo(() => {
    if (!bootstrap || !selectedMessageId) return [];
    const filtered = bootstrap.allRuns.filter((r) => {
      if (r.targetMessageId !== selectedMessageId) return false;
      if (selectedPromptVersionId && r.promptVersionId !== selectedPromptVersionId) return false;
      return true;
    });
    const chronological = [...filtered].sort((a, b) => {
      const ca = a.createdAt ?? "";
      const cb = b.createdAt ?? "";
      if (ca !== cb) return ca.localeCompare(cb);
      return a.itemName.localeCompare(b.itemName);
    });
    return chronological
      .map((run, index) => ({ ...run, runNumber: run.runNumber ?? index + 1 }))
      .reverse();
  }, [bootstrap, selectedMessageId, selectedPromptVersionId]);

  const allMessageRunsNewestFirst = useMemo(() => {
    if (!bootstrap || !selectedMessageId) return [];
    const filtered = bootstrap.allRuns.filter((r) => r.targetMessageId === selectedMessageId);
    const chronological = [...filtered].sort((a, b) => {
      const ca = a.createdAt ?? "";
      const cb = b.createdAt ?? "";
      if (ca !== cb) return ca.localeCompare(cb);
      return a.itemName.localeCompare(b.itemName);
    });
    return chronological
      .map((run, index) => ({ ...run, runNumber: run.runNumber ?? index + 1 }))
      .reverse();
  }, [bootstrap, selectedMessageId]);

  const displayRuns =
    selectedPromptVersionId && selectedPromptVersionId !== OPEN_VALUE
      ? messageRuns
      : allMessageRunsNewestFirst;

  const activeRun = useMemo(() => {
    if (!displayRuns.length) return null;
    if (activeRunLoca) {
      return displayRuns.find((r) => r.loca === activeRunLoca) ?? displayRuns[0];
    }
    return displayRuns[0];
  }, [displayRuns, activeRunLoca]);

  const contextFrameIds = useMemo(() => {
    if (!selectedMessageId || mode !== "analysis") return null;
    return analysisContextMessageIds(messages, selectedMessageId);
  }, [messages, selectedMessageId, mode]);

  const conversationStatus = !bootstrap
    ? ""
    : bootstrap.conversation.found
      ? `Loaded${bootstrap.conversation.channel ? ` · ${bootstrap.conversation.channel}` : ""}`
      : "No conversation found";

  function selectMessage(messageId: string) {
    setSelectedMessageId(messageId);
    setTopPromptValue(OPEN_VALUE);
    setSelectedPromptVersionId(null);
    setActiveRunLoca(null);
    setAiMessage(null);
  }

  function openAnalysisForPrompt(messageId: string, promptVersionId: string) {
    setSelectedMessageId(messageId);
    setSelectedPromptVersionId(promptVersionId);
    setTopPromptValue(promptVersionId);
    setActiveRunLoca(null);
    setAiMessage(null);
    setMode("analysis");
  }

  function handleTopPromptChange(value: string) {
    setTopPromptValue(value);
    if (!value || value === OPEN_VALUE) {
      setSelectedPromptVersionId(null);
      return;
    }
    setSelectedPromptVersionId(value);
  }

  function handleRowPromptChange(messageId: string, value: string) {
    if (!value || value === OPEN_VALUE) {
      selectMessage(messageId);
      return;
    }
    openAnalysisForPrompt(messageId, value);
  }

  function tryActivateAnalysis() {
    if (!analysisEnabled) return;
    setMode("analysis");
  }

  async function saveApproach() {
    if (!leadLoca) return;
    setApproachSaving(true);
    try {
      const res = await fetch("/api/leads/message-creator", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "approach", leadLoca, text: approachText }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Save failed");
      setApproachOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApproachSaving(false);
    }
  }

  async function saveDraftProposal() {
    if (!leadLoca || !draftProposal.trim()) return;
    setProposalsSaving(true);
    try {
      const next = proposalsText.trim()
        ? `${proposalsText.trim()}\n\n${draftProposal.trim()}`
        : draftProposal.trim();
      const res = await fetch("/api/leads/message-creator", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "proposals", leadLoca, text: next }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Save failed");
      setProposalsText(next);
      setDraftProposal("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProposalsSaving(false);
    }
  }

  async function sendNew() {
    if (!leadName || !leadLoca || !selectedMessageId || !selectedPromptVersionId || !selectedModelId) {
      setAiMessage("Select a message, prompt version, and model before Send new.");
      return;
    }
    setAiBusy(true);
    setAiMessage(null);
    try {
      const res = await fetch("/api/leads/message-creator/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadName,
          leadLoca,
          promptVersionId: selectedPromptVersionId,
          targetMessageId: selectedMessageId,
          modelId: selectedModelId,
          operation: "full-analysis",
          force: true,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "AI request failed");
      const status = json.data?.status as string | undefined;
      if (status === "PROMPT_NOT_CONFIGURED") {
        setAiMessage("Not configured");
      } else if (status && status !== "COMPLETE") {
        setAiMessage(json.data?.message || status);
      }
      await loadBootstrap();
    } catch (err) {
      setAiMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setAiBusy(false);
    }
  }

  function onResizeStart(clientX: number) {
    if (sideWidthPx == null) return;
    dragRef.current = { startX: clientX, startWidth: sideWidthPx };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragRef.current || defaultSideWidthRef.current == null) return;
      const rawDelta = dragRef.current.startX - e.clientX;
      const delta = Math.max(-MAX_SHIFT_PX, Math.min(MAX_SHIFT_PX, rawDelta));
      const base = dragRef.current.startWidth;
      // Clamp absolute width to default ± 50
      const def = defaultSideWidthRef.current;
      const next = Math.max(def - MAX_SHIFT_PX, Math.min(def + MAX_SHIFT_PX, base + delta));
      setSideWidthPx(next);
    }
    function onUp() {
      if (!dragRef.current) return;
      dragRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const youProposals = useMemo(() => splitYouProposals(proposalsText), [proposalsText]);
  const proposalGroups = useMemo(() => {
    const groups: Array<{ title: string; items: string[] }> = [
      { title: "You", items: youProposals },
    ];
    if (!bootstrap) return groups;
    const byVersion = new Map<string, string[]>();
    for (const run of bootstrap.allRuns) {
      if (!run.proposalText?.trim() || !run.promptVersionId) continue;
      const list = byVersion.get(run.promptVersionId) ?? [];
      list.push(run.proposalText.trim());
      byVersion.set(run.promptVersionId, list);
    }
    for (const v of promptVersions) {
      const items = byVersion.get(v.id);
      if (items?.length) groups.push({ title: v.displayName, items });
    }
    return groups;
  }, [bootstrap, youProposals, promptVersions]);

  if (!leadName || !leadLoca) {
    return <MessageCreatorLeadPicker />;
  }

  if (loading && !bootstrap) {
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
        <Button
          variant="outline"
          className="m-4 w-fit"
          onClick={() => router.push("/dashboard/msg-automation")}
        >
          Back
        </Button>
      </EditorPageShell>
    );
  }

  const recommended =
    payloadString(activeRun?.payload ?? null, [
      "recommendedDirections",
      "recommended_directions",
      "directions",
      "availableAnswers",
    ]) ?? null;
  const proposalScore =
    payloadString(activeRun?.payload ?? null, ["proposalScore", "proposal_score", "recommendation"]) ??
    null;
  const previousScore =
    payloadString(activeRun?.payload ?? null, [
      "previousMessagesScore",
      "previous_messages_score",
    ]) ?? null;
  const mistakes = payloadMistakes(activeRun?.payload ?? null);

  const canSendNew = Boolean(
    selectedMessageId && selectedPromptVersionId && selectedPromptVersionId !== OPEN_VALUE && selectedModelId
  );

  return (
    <EditorPageShell>
      <div className="flex shrink-0 items-center gap-2 border-b px-2 py-1.5 pl-14">
        <NavGroup
          upLevel={{
            onClick: () =>
              router.push(
                `/dashboard/leads/details?leadName=${encodeURIComponent(leadName)}&leadLoca=${encodeURIComponent(leadLoca)}`
              ),
            label: "Back to lead",
          }}
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{leadName}</h1>
          <p className="truncate text-xs text-muted-foreground">{conversationStatus}</p>
        </div>
        <Button variant="outline" size="sm" className="h-8" onClick={() => setApproachOpen(true)}>
          Approach
        </Button>
        <Button variant="outline" size="sm" className="h-8" onClick={() => setReportsOpen(true)}>
          Reports
        </Button>
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

      <div className="flex shrink-0 items-center gap-2 border-b bg-background px-3 py-2">
        <button
          type="button"
          className={cn(
            "rounded-lg border px-3.5 py-2 text-[13px]",
            mode === "beeper"
              ? "border-[#111] bg-[#111] font-semibold text-white"
              : "border-border bg-white text-muted-foreground"
          )}
          onClick={() => setMode("beeper")}
        >
          Beeper
        </button>
        <button
          type="button"
          disabled={!analysisEnabled}
          aria-disabled={!analysisEnabled}
          className={cn(
            "rounded-lg border px-3.5 py-2 text-[13px]",
            mode === "analysis"
              ? "border-[#111] bg-[#111] font-semibold text-white"
              : "border-border bg-white text-muted-foreground",
            !analysisEnabled && "pointer-events-none opacity-35"
          )}
          onClick={tryActivateAnalysis}
        >
          Analysis
        </button>
        {selectedMessageId && (
          <select
            className="h-[34px] min-w-[190px] rounded-lg border bg-white px-2.5 text-[13px]"
            value={topPromptValue || OPEN_VALUE}
            onChange={(e) => handleTopPromptChange(e.target.value)}
            aria-label="Select prompt version"
          >
            {optionsForSelected.length === 0 ? (
              <option value="">Select prompt version...</option>
            ) : (
              optionsForSelected.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))
            )}
          </select>
        )}
      </div>

      {error && (
        <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}

      <div
        ref={shellRef}
        className={cn(
          "grid min-h-0 flex-1 grid-cols-1",
          mode === "analysis" &&
            "md:[grid-template-columns:minmax(0,1fr)_var(--mc-side,36%)]"
        )}
        style={
          mode === "analysis" && sideWidthPx != null
            ? ({ ["--mc-side" as string]: `${sideWidthPx}px` } as CSSProperties)
            : undefined
        }
      >
        <div className="flex min-h-0 min-w-0 flex-col">
          {mode === "beeper" ? (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto bg-[#fafafa]">
                <BeeperConversationView
                  messages={messages}
                  content={bootstrap?.conversation.body}
                  showActions
                  selectedMessageId={selectedMessageId}
                  onSelectMessage={selectMessage}
                  renderMessageAction={(msg) => {
                    const opts = buildPromptOptions(
                      promptVersions,
                      messageRunCounts[msg.id] ?? {}
                    );
                    const openOpt = opts[0];
                    if (!openOpt || openOpt.count <= 0) {
                      return null;
                    }
                    return (
                      <select
                        className="h-8 w-full max-w-[180px] rounded-lg border bg-white px-2 text-xs"
                        value=""
                        aria-label={`Analyses for message`}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation();
                          const v = e.target.value;
                          e.target.value = "";
                          handleRowPromptChange(msg.id, v);
                        }}
                      >
                        {opts.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    );
                  }}
                />
              </div>
              <div className="shrink-0 border-t bg-white">
                <button
                  type="button"
                  className="flex w-full items-center justify-between border-b px-3.5 py-2 text-xs text-muted-foreground"
                  onClick={() => setProposalsOpen((o) => !o)}
                >
                  <span>Message proposals</span>
                  {proposalsOpen ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronUp className="h-3.5 w-3.5" />
                  )}
                </button>
                {proposalsOpen && (
                  <div className="max-h-48 space-y-3 overflow-y-auto border-b bg-[#fafafa] px-3.5 py-2.5">
                    {proposalGroups.map((g) =>
                      g.items.length === 0 && g.title !== "You" ? null : (
                        <div key={g.title}>
                          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                            {g.title}
                          </div>
                          {g.items.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No proposals yet</p>
                          ) : (
                            g.items.map((text, i) => (
                              <div
                                key={`${g.title}-${i}`}
                                className="mb-1.5 grid grid-cols-[auto_1fr] items-center gap-2.5 rounded-lg border bg-white px-2.5 py-2 text-xs"
                              >
                                <Button
                                  size="sm"
                                  className="h-7 bg-[#111] px-2 text-[11px] font-semibold text-white hover:bg-[#111]/90"
                                  disabled
                                  title="Not configured"
                                >
                                  Send
                                </Button>
                                <span>{text}</span>
                              </div>
                            ))
                          )}
                        </div>
                      )
                    )}
                  </div>
                )}
                <div className="grid grid-cols-[1fr_auto] gap-2 px-3.5 py-2.5">
                  <Textarea
                    value={draftProposal}
                    onChange={(e) => setDraftProposal(e.target.value)}
                    placeholder="Write or paste your own message proposal..."
                    className="min-h-[58px] resize-none text-[13px]"
                  />
                  <Button
                    className="h-auto bg-[#111] px-4 text-[13px] font-semibold leading-tight text-white hover:bg-[#111]/90"
                    disabled={proposalsSaving || !draftProposal.trim()}
                    onClick={saveDraftProposal}
                  >
                    Save
                    <br />
                    msg
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {!selectedPromptVersionId ? (
                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                  Select a prompt version before opening Analysis.
                </div>
              ) : !activeRun ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
                  <p>No saved analysis for this message and prompt version yet.</p>
                  <p className="text-xs">Use Send new in the right panel to create a run.</p>
                  {aiMessage && <p className="text-destructive">{aiMessage}</p>}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="rounded-[11px] border bg-white p-3.5 shadow-sm md:col-span-2">
                    <h3 className="mb-1.5 text-sm font-semibold">Recommended directions</h3>
                    <p className="text-[13px] leading-snug text-muted-foreground">
                      {recommended ?? "No data in this run."}
                    </p>
                  </div>
                  <div className="rounded-[11px] border bg-white p-3.5 shadow-sm">
                    <h3 className="mb-1.5 text-sm font-semibold">Mistakes</h3>
                    {mistakes.length === 0 ? (
                      <p className="text-[13px] text-muted-foreground">No data in this run.</p>
                    ) : (
                      <div className="grid gap-1.5">
                        {mistakes.map((m, i) => (
                          <div
                            key={i}
                            className="rounded-lg border bg-[#fafafa] px-2.5 py-2 text-xs"
                          >
                            <strong className="mb-0.5 block">{m.title}</strong>
                            {m.body}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="rounded-[11px] border bg-white p-3.5 shadow-sm">
                    <h3 className="mb-1.5 text-sm font-semibold">Proposal score</h3>
                    <p className="text-[13px] text-muted-foreground">
                      {proposalScore ?? "No data in this run."}
                    </p>
                  </div>
                  <div className="rounded-[11px] border bg-white p-3.5 shadow-sm md:col-span-2">
                    <h3 className="mb-1.5 text-sm font-semibold">Previous messages score</h3>
                    <p className="text-[13px] text-muted-foreground">
                      {previousScore ?? "No data in this run."}
                    </p>
                  </div>
                  {activeRun.status === "not-configured" && (
                    <div className="rounded-[11px] border border-amber-500/40 bg-amber-50 p-3.5 text-sm text-amber-900 md:col-span-2">
                      Not configured — mentor prompts are not wired yet. No scores were invented.
                    </div>
                  )}
                  {aiMessage && (
                    <p className="text-sm text-destructive md:col-span-2">{aiMessage}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {mode === "analysis" && (
          <aside className="relative flex min-h-[50vh] min-w-0 flex-col border-t bg-white md:grid md:min-h-0 md:grid-rows-2 md:border-l md:border-t-0">
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize analysis panel"
              title="Drag up to 50px left or right"
              className="absolute -left-1 top-0 z-20 hidden h-full w-2 cursor-col-resize md:block"
              onMouseDown={(e) => {
                e.preventDefault();
                onResizeStart(e.clientX);
              }}
            >
              <span className="absolute left-[3px] top-0 h-full w-0.5 bg-border hover:bg-[#111]" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto border-b bg-[#fafafa] md:flex-none">
              <BeeperConversationView
                messages={messages}
                compact
                contextFrameIds={contextFrameIds}
              />
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 md:flex-none">
              <select
                className="mb-1 h-[34px] w-full rounded-lg border bg-white px-2 text-xs"
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                aria-label="Select model"
              >
                <option value="">Select model...</option>
                {(bootstrap?.models ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </select>
              <Button
                className="mb-1 h-10 w-full bg-[#111] text-xs font-semibold text-white hover:bg-[#111]/90"
                disabled={!canSendNew || aiBusy}
                onClick={sendNew}
                title={
                  canSendNew
                    ? "Send new analysis"
                    : "Select a message, prompt version, and model first"
                }
              >
                {aiBusy ? "Sending…" : "Send new"}
              </Button>
              {bootstrap?.resolvedPrompt ? (
                <p className="mb-1 truncate text-[11px] text-muted-foreground" title={bootstrap.resolvedPrompt.name}>
                  Prompt: {bootstrap.resolvedPrompt.name}
                  {bootstrap.resolvedPrompt.publishedVersion ? ` (v${bootstrap.resolvedPrompt.publishedVersion})` : ""}
                </p>
              ) : (
                <p className="mb-1 text-[11px] text-muted-foreground">
                  Prompt not configured —{" "}
                  <Link href="/dashboard/msg-automation/ai-prompts/new" className="underline hover:text-foreground">
                    create one
                  </Link>
                </p>
              )}
              {displayRuns.map((run) => {
                const versionLabel =
                  promptVersions.find((v) => v.id === run.promptVersionId)?.displayName ??
                  run.promptVersionId ??
                  run.schoolId;
                const label = `${String(run.runNumber ?? 0).padStart(2, "0")} ${versionLabel}`;
                const active = activeRun?.loca === run.loca;
                return (
                  <button
                    key={run.loca}
                    type="button"
                    className={cn(
                      "mb-1.5 w-full rounded-lg border px-2.5 py-2 text-left text-xs",
                      active ? "bg-[#eef0f3]" : "bg-white hover:bg-[#eef0f3]"
                    )}
                    onClick={() => setActiveRunLoca(run.loca)}
                    title={run.modelId ? `Model: ${run.modelId}` : undefined}
                  >
                    {label}
                  </button>
                );
              })}
              {displayRuns.length === 0 && (
                <p className="text-xs text-muted-foreground">No runs yet for this message.</p>
              )}
            </div>
          </aside>
        )}
      </div>

      <Dialog open={approachOpen} onOpenChange={setApproachOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approach context</DialogTitle>
          </DialogHeader>
          <Textarea
            value={approachText}
            onChange={(e) => setApproachText(e.target.value)}
            className="min-h-[140px]"
            placeholder="A few sentences of approach context…"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproachOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveApproach} disabled={approachSaving}>
              {approachSaving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reportsOpen} onOpenChange={setReportsOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>My Reports</DialogTitle>
          </DialogHeader>
          {(bootstrap?.reports?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No reports found</p>
          ) : (
            <ul className="space-y-3">
              {bootstrap!.reports.map((r, i) => (
                <li key={i} className="rounded-lg border p-3 text-sm">
                  <div className="font-medium">{r.name ?? "Report"}</div>
                  <pre className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                    {r.preview ?? r.body ?? ""}
                  </pre>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </EditorPageShell>
  );
}
