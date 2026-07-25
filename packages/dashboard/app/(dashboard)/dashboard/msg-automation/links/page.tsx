"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { ErrorBox } from "@/components/shared/error-box";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buildLeadDetailsHref } from "@/lib/lead-links";
import { Loader2 } from "lucide-react";

type LinkMethod = "automatic" | "manual" | "suggested";

interface LeadBeeperLink {
  id: string;
  leadName: string;
  leadLoca?: string;
  conversationId: string;
  conversationName: string;
  channel?: string;
  method: LinkMethod;
  source: "contact" | "name" | "phone" | "manual";
  contactValue?: string;
  confidence?: number;
  createdAt: string;
  updatedAt: string;
}

interface LeadCandidate {
  leadName: string;
  leadLoca: string;
  phones: string[];
}

interface ConversationCandidate {
  conversationId: string;
  conversationName: string;
  channel?: string;
  phones: string[];
}

interface PageData {
  leads: LeadCandidate[];
  conversations: ConversationCandidate[];
  links: LeadBeeperLink[];
}

interface LineGeom {
  id: string;
  d: string;
  method: LinkMethod;
  label: string;
}

function statusCopy(method: LinkMethod): { title: string; className: string } {
  if (method === "automatic") {
    return { title: "Linked by contact", className: "text-[#237a42]" };
  }
  if (method === "manual") {
    return { title: "Linked manually", className: "text-[#2453b8]" };
  }
  return { title: "Suggested by contact", className: "text-[#925f00]" };
}

function formatNumberLine(value: string | undefined, phones: string[]): string | null {
  const raw = value || phones[0];
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (/^number\s+/i.test(trimmed)) return trimmed;
  return `number ${trimmed}`;
}

function curve(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const dx = Math.max(80, Math.abs(b.x - a.x) * 0.42);
  return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
}

function strokeClass(method: LinkMethod): string {
  if (method === "automatic") return "stroke-[#1f9d55] stroke-[3] fill-none";
  if (method === "manual") return "stroke-[#2563eb] stroke-[3] fill-none [stroke-dasharray:8_6]";
  return "stroke-[#aaa] stroke-[2] fill-none [stroke-dasharray:3_5]";
}

export default function MsgAutoLinksPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leads, setLeads] = useState<LeadCandidate[]>([]);
  const [conversations, setConversations] = useState<ConversationCandidate[]>([]);
  const [links, setLinks] = useState<LeadBeeperLink[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState("[]");
  const [leadSearch, setLeadSearch] = useState("");
  const [convSearch, setConvSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [matching, setMatching] = useState(false);
  const [lines, setLines] = useState<LineGeom[]>([]);
  const [dragPath, setDragPath] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const leftListRef = useRef<HTMLDivElement>(null);
  const rightListRef = useRef<HTMLDivElement>(null);
  const leadHandleRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const convHandleRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const dragRef = useRef<{
    side: "left" | "right";
    leadName?: string;
    conversationId?: string;
    start: { x: number; y: number };
  } | null>(null);

  const dirty = useMemo(
    () => JSON.stringify(links) !== savedSnapshot,
    [links, savedSnapshot]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/msg-automation/links");
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Failed to load (${res.status})`);
      }
      const data = json.data as PageData;
      setLeads(data.leads ?? []);
      setConversations(data.conversations ?? []);
      setLinks(data.links ?? []);
      setSavedSnapshot(JSON.stringify(data.links ?? []));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const linkByLead = useMemo(() => {
    const map = new Map<string, LeadBeeperLink>();
    for (const link of links) map.set(link.leadName, link);
    return map;
  }, [links]);

  const linkByConv = useMemo(() => {
    const map = new Map<string, LeadBeeperLink>();
    for (const link of links) map.set(link.conversationId, link);
    return map;
  }, [links]);

  const filteredLeads = useMemo(() => {
    const q = leadSearch.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) => l.leadName.toLowerCase().includes(q));
  }, [leads, leadSearch]);

  const filteredConvs = useMemo(() => {
    const q = convSearch.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.conversationName.toLowerCase().includes(q));
  }, [conversations, convSearch]);

  const recomputeLines = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      setLines([]);
      return;
    }
    const cr = canvas.getBoundingClientRect();
    const next: LineGeom[] = [];
    for (const link of links) {
      const leftEl = leadHandleRefs.current.get(link.leadName);
      const rightEl = convHandleRefs.current.get(link.conversationId);
      if (!leftEl || !rightEl) continue;
      const lr = leftEl.getBoundingClientRect();
      const rr = rightEl.getBoundingClientRect();
      const a = {
        x: lr.left + lr.width / 2 - cr.left,
        y: lr.top + lr.height / 2 - cr.top,
      };
      const b = {
        x: rr.left + rr.width / 2 - cr.left,
        y: rr.top + rr.height / 2 - cr.top,
      };
      const phone = formatNumberLine(link.contactValue, []) ?? "";
      const title = statusCopy(link.method).title;
      next.push({
        id: link.id,
        d: curve(a, b),
        method: link.method,
        label: phone ? `${title} · ${phone.replace(/^number\s+/i, "")}` : title,
      });
    }
    setLines(next);
  }, [links]);

  useLayoutEffect(() => {
    recomputeLines();
  }, [recomputeLines, filteredLeads, filteredConvs, loading]);

  useEffect(() => {
    const onResize = () => recomputeLines();
    window.addEventListener("resize", onResize);
    const left = leftListRef.current;
    const right = rightListRef.current;
    left?.addEventListener("scroll", onResize);
    right?.addEventListener("scroll", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      left?.removeEventListener("scroll", onResize);
      right?.removeEventListener("scroll", onResize);
    };
  }, [recomputeLines]);

  const addManualLink = (leadName: string, conversationId: string) => {
    if (links.some((l) => l.leadName === leadName && l.conversationId === conversationId)) {
      return;
    }
    const lead = leads.find((l) => l.leadName === leadName);
    const conv = conversations.find((c) => c.conversationId === conversationId);
    if (!lead || !conv) return;
    const now = new Date().toISOString();
    setLinks((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        leadName,
        leadLoca: lead.leadLoca,
        conversationId,
        conversationName: conv.conversationName,
        channel: conv.channel,
        method: "manual",
        source: "manual",
        contactValue: lead.phones[0] || conv.phones[0],
        createdAt: now,
        updatedAt: now,
      },
    ]);
    setSavedFlash(false);
  };

  const onHandleDown = (
    e: ReactMouseEvent<HTMLButtonElement>,
    side: "left" | "right",
    ids: { leadName?: string; conversationId?: string }
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const canvas = canvasRef.current;
    const handle = e.currentTarget;
    if (!canvas) return;
    const cr = canvas.getBoundingClientRect();
    const hr = handle.getBoundingClientRect();
    dragRef.current = {
      side,
      ...ids,
      start: {
        x: hr.left + hr.width / 2 - cr.left,
        y: hr.top + hr.height / 2 - cr.top,
      },
    };
    handle.classList.add("bg-neutral-900");
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      const canvas = canvasRef.current;
      if (!drag || !canvas) return;
      const cr = canvas.getBoundingClientRect();
      const end = { x: e.clientX - cr.left, y: e.clientY - cr.top };
      setDragPath(curve(drag.start, end));
    };
    const onUp = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const handle = target?.closest?.("[data-link-handle]") as HTMLElement | null;
      const targetSide = handle?.dataset.side as "left" | "right" | undefined;
      if (handle && targetSide && targetSide !== drag.side) {
        const leadName =
          drag.side === "left" ? drag.leadName : handle.dataset.leadName;
        const conversationId =
          drag.side === "right" ? drag.conversationId : handle.dataset.conversationId;
        if (leadName && conversationId) {
          addManualLink(leadName, conversationId);
        }
      }
      document.querySelectorAll("[data-link-handle]").forEach((el) => {
        el.classList.remove("bg-neutral-900");
      });
      dragRef.current = null;
      setDragPath(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, conversations, links]);

  const handleAutoMatch = async () => {
    setMatching(true);
    setError(null);
    try {
      const res = await fetch("/api/msg-automation/links/auto-match", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Auto-match failed (${res.status})`);
      }
      const data = json.data as PageData;
      setLeads(data.leads ?? []);
      setConversations(data.conversations ?? []);
      setLinks(data.links ?? []);
      setSavedFlash(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setMatching(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/msg-automation/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ links }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Save failed (${res.status})`);
      }
      const saved = (json.data as LeadBeeperLink[]) ?? [];
      setLinks(saved);
      setSavedSnapshot(JSON.stringify(saved));
      setSavedFlash(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardPageShell
      upLevel={{ onClick: () => router.push("/dashboard/msg-automation") }}
      title="Links"
      toolbar={
        <span className="text-xs font-normal text-muted-foreground">
          Connect CHAD leads with Beeper conversations
        </span>
      }
      scroll={false}
      padded={false}
      contentClassName="gap-0 min-h-0 flex flex-col !overflow-hidden p-0"
    >
      {error && (
        <div className="px-3 pt-2">
          <ErrorBox message={error} />
        </div>
      )}

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div
            className={cn(
              "min-h-0 flex-1 grid bg-neutral-50",
              "grid-cols-1 md:grid-cols-[minmax(220px,300px)_minmax(0,1fr)_minmax(220px,300px)]"
            )}
          >
            {/* CHAD Leads */}
            <aside className="min-h-0 flex flex-col border-b md:border-b-0 md:border-r bg-white">
              <div className="h-[58px] border-b px-3 py-2.5">
                <strong className="block text-sm">CHAD Leads</strong>
                <span className="block text-xs text-muted-foreground">
                  Click a name to open lead details
                </span>
              </div>
              <input
                className="mx-3 mt-2.5 mb-1.5 h-9 rounded-lg border px-2.5 text-sm"
                placeholder="Search leads..."
                value={leadSearch}
                onChange={(e) => setLeadSearch(e.target.value)}
              />
              <div ref={leftListRef} className="min-h-0 flex-1 overflow-auto px-3 pb-3">
                {filteredLeads.map((lead) => {
                  const link = linkByLead.get(lead.leadName);
                  const status = link ? statusCopy(link.method) : null;
                  const numberLine = link
                    ? formatNumberLine(link.contactValue, lead.phones)
                    : formatNumberLine(undefined, lead.phones);
                  return (
                    <div
                      key={lead.leadName}
                      className="relative my-2 rounded-[10px] border bg-white px-3 py-2.5"
                      data-testid="links-lead-node"
                    >
                      <Link
                        href={buildLeadDetailsHref({
                          leadName: lead.leadName,
                          leadLoca: lead.leadLoca,
                          returnTo: "/dashboard/msg-automation/links",
                        })}
                        className="inline-block text-sm font-bold text-neutral-900 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {lead.leadName}
                      </Link>
                      {status && (
                        <div className="mt-1.5 flex flex-col gap-0.5">
                          <strong className={cn("text-[11px]", status.className)}>
                            {status.title}
                          </strong>
                          {numberLine && (
                            <span className="text-[11px] text-muted-foreground">{numberLine}</span>
                          )}
                        </div>
                      )}
                      <button
                        type="button"
                        data-link-handle
                        data-side="left"
                        data-lead-name={lead.leadName}
                        title="Drag to connect"
                        aria-label={`Connect lead ${lead.leadName}`}
                        className="absolute top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 rounded-full border-[3px] border-neutral-900 bg-white shadow-[0_0_0_3px_#fff] cursor-crosshair md:block"
                        style={{ right: -22 }}
                        ref={(el) => {
                          if (el) leadHandleRefs.current.set(lead.leadName, el);
                          else leadHandleRefs.current.delete(lead.leadName);
                        }}
                        onMouseDown={(e) =>
                          onHandleDown(e, "left", { leadName: lead.leadName })
                        }
                      />
                    </div>
                  );
                })}
              </div>
              <div className="border-t bg-neutral-50 px-3 py-2.5 text-[11px] text-muted-foreground">
                Drag from a dot to a dot on the opposite side to create a connection.
              </div>
            </aside>

            {/* Canvas */}
            <div
              ref={canvasRef}
              className="relative min-h-[280px] md:min-h-0 overflow-hidden bg-[radial-gradient(#ddd_1px,transparent_1px)] [background-size:20px_20px]"
              data-testid="links-canvas"
            >
              <svg className="absolute inset-0 h-full w-full pointer-events-none">
                {lines.map((line) => (
                  <g key={line.id}>
                    <path d={line.d} className={strokeClass(line.method)} />
                  </g>
                ))}
                {dragPath && (
                  <path
                    d={dragPath}
                    className="stroke-neutral-900 stroke-[2.5] fill-none [stroke-dasharray:6_5]"
                  />
                )}
              </svg>
              {links.length === 0 && !dragPath && (
                <div className="absolute left-1/2 top-1/2 z-[2] max-w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-white px-4 py-3.5 text-center shadow-sm">
                  <strong className="block text-sm">Visual connection map</strong>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Use the black dots on both sides to drag and create a link.
                  </span>
                </div>
              )}
              <div className="absolute bottom-3 left-3 z-[2] rounded-[10px] border bg-white p-2 text-[11px]">
                <div className="my-1 flex items-center gap-2">
                  <span className="inline-block w-7 border-t-[3px] border-dashed border-[#2563eb]" />
                  Manual link
                </div>
                <div className="my-1 flex items-center gap-2">
                  <span className="inline-block w-7 border-t-[3px] border-dotted border-[#aaa]" />
                  Suggested link
                </div>
              </div>
            </div>

            {/* Beeper Conversations */}
            <aside className="min-h-0 flex flex-col border-t md:border-t-0 md:border-l bg-white">
              <div className="h-[58px] border-b px-3 py-2.5">
                <strong className="block text-sm">Beeper Conversations</strong>
                <span className="block text-xs text-muted-foreground">
                  Click a name to open conversation details
                </span>
              </div>
              <input
                className="mx-3 mt-2.5 mb-1.5 h-9 rounded-lg border px-2.5 text-sm"
                placeholder="Search conversations..."
                value={convSearch}
                onChange={(e) => setConvSearch(e.target.value)}
              />
              <div ref={rightListRef} className="min-h-0 flex-1 overflow-auto px-3 pb-3">
                {filteredConvs.map((conv) => {
                  const link = linkByConv.get(conv.conversationId);
                  const status = link ? statusCopy(link.method) : null;
                  const numberLine = link
                    ? formatNumberLine(link.contactValue, conv.phones)
                    : formatNumberLine(undefined, conv.phones);
                  return (
                    <div
                      key={conv.conversationId}
                      className="relative my-2 rounded-[10px] border bg-white px-3 py-2.5"
                      data-testid="links-conv-node"
                    >
                      <Link
                        href={`/dashboard/beeper/${encodeURIComponent(conv.conversationId)}`}
                        className="inline-block text-sm font-bold text-neutral-900 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {conv.conversationName}
                      </Link>
                      {status && (
                        <div className="mt-1.5 flex flex-col gap-0.5">
                          <strong className={cn("text-[11px]", status.className)}>
                            {status.title}
                          </strong>
                          {numberLine && (
                            <span className="text-[11px] text-muted-foreground">{numberLine}</span>
                          )}
                        </div>
                      )}
                      <button
                        type="button"
                        data-link-handle
                        data-side="right"
                        data-conversation-id={conv.conversationId}
                        title="Drag to connect"
                        aria-label={`Connect conversation ${conv.conversationName}`}
                        className="absolute top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 rounded-full border-[3px] border-neutral-900 bg-white shadow-[0_0_0_3px_#fff] cursor-crosshair md:block"
                        style={{ left: -22 }}
                        ref={(el) => {
                          if (el) convHandleRefs.current.set(conv.conversationId, el);
                          else convHandleRefs.current.delete(conv.conversationId);
                        }}
                        onMouseDown={(e) =>
                          onHandleDown(e, "right", {
                            conversationId: conv.conversationId,
                          })
                        }
                      />
                    </div>
                  );
                })}
              </div>
              <div className="border-t bg-neutral-50 px-3 py-2.5 text-[11px] text-muted-foreground">
                The same contact signal is shown on both sides for fast visual verification.
              </div>
            </aside>
          </div>

          <div className="flex h-[58px] shrink-0 items-center gap-3 border-t bg-white px-3.5">
            <Button
              type="button"
              variant="outline"
              className="h-8"
              disabled={matching || loading}
              onClick={handleAutoMatch}
            >
              {matching ? "Matching…" : "Auto-match all"}
            </Button>
            <Button
              type="button"
              className="h-8 bg-neutral-900 text-white hover:bg-neutral-800"
              disabled={!dirty || saving || loading}
              onClick={handleSave}
            >
              {saving ? "Saving…" : savedFlash && !dirty ? "Saved" : "Save"}
            </Button>
            {savedFlash && !dirty && (
              <span className="text-xs text-green-700">Saved</span>
            )}
          </div>
        </>
      )}
    </DashboardPageShell>
  );
}
