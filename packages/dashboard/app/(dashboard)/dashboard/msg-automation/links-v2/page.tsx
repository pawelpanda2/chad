"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type RefObject } from "react";
import Link from "next/link";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorBox } from "@/components/shared/error-box";
import { BeeperPlatformIcon } from "@/components/beeper/beeper-platform-icon";
import { BeeperGroupFilter } from "@/components/beeper/beeper-group-filter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getLeadDetailsHref } from "@/lib/lead-links";
import { Loader2, RefreshCw, X } from "lucide-react";
import { startColumnResize, type ResizeSide } from "./_lib/resize";

// ── Data shapes (thin GUI-layer types — server types live in `dba`) ────────

interface BeeperLinkEntry {
  chatId: string;
  type: string;
}
interface GoogleContactsLinkEntry {
  resourceName: string;
  displayName: string;
  phone: string;
}
interface LinksV2LeadRow {
  leadKey: string;
  leadName: string;
  loca: string;
  draft: boolean;
  links: { beeper: BeeperLinkEntry[]; googleContacts: GoogleContactsLinkEntry[] };
}
interface BeeperContactRow {
  _id: string;
  displayName: string;
  platformNetwork: string | null;
  lastMessage: { text: string; timestamp: string | null; network: string } | null;
  groupId: string | null;
}
interface GoogleContactRow {
  resourceName: string;
  displayName: string | null;
  phones: string[];
  photoUrl: string | null;
}
interface BeeperMessageRow {
  _id: string;
  isSelf: boolean;
  text: string;
  timestamp: string | null;
}
interface SyncReport {
  leadsScanned: number;
  newBeeperLinks: number;
  newGoogleContactsLinks: number;
  draftLeadsCreated: string[];
  googleContactsConnected: boolean;
  googleContactsError?: string;
  errors: { leadName: string; error: string }[];
}

type MainTab = "leads" | "conv" | "google";

type DragPayload =
  | { kind: "beeper-contact"; chatId: string; network: string }
  | { kind: "beeper-linked"; chatId: string }
  | { kind: "lead"; loca: string; leadName: string }
  | { kind: "google-contact"; resourceName: string; displayName: string; phone: string }
  | { kind: "google-linked"; resourceName: string };

interface ConfirmState {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => Promise<void> | void;
}

type ConvViewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; messages: BeeperMessageRow[] };

const SIDE_MIN = 200;
const CENTER_MIN = 100;
const CONV_MIN = 200;
const ROW_CLASS = "flex min-w-0 items-center gap-2 rounded-md px-2 py-1 min-h-[30px] hover:bg-accent";
const INNER_TAB_CLASS =
  "border-b-2 border-transparent px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground";
const INNER_TAB_ON_CLASS = "border-foreground text-foreground";

function setDragPayload(e: DragEvent, payload: DragPayload) {
  e.dataTransfer.setData("text/plain", JSON.stringify(payload));
  e.dataTransfer.effectAllowed = "move";
}
function readDragPayload(e: DragEvent): DragPayload | null {
  try {
    const raw = e.dataTransfer.getData("text/plain");
    if (!raw) return null;
    return JSON.parse(raw) as DragPayload;
  } catch {
    return null;
  }
}
function matches(query: string, text: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || text.toLowerCase().includes(q);
}
/** `undefined` filter = all groups; `"__none__"` = contacts with no group; otherwise exact group id (BeeperGroupFilter convention). */
function matchesGroup(filter: string | undefined, groupId: string | null): boolean {
  if (!filter) return true;
  if (filter === "__none__") return groupId === null;
  return groupId === filter;
}
async function fetchJson(url: string): Promise<{ ok: boolean; json: unknown }> {
  const res = await fetch(url);
  const json = await res.json().catch(() => null);
  return { ok: res.ok, json };
}
async function postJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
  if (!res.ok || !json?.success) throw new Error(json?.error || `Request failed: ${url}`);
}

// ── Small shared row/panel pieces ───────────────────────────────────────────

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search"
      className="h-7 w-full text-xs"
    />
  );
}

/**
 * Search (wide) + group filter (compact) in a single row — shared by the
 * Leads tab's right panel and the Conv tab's left panel (both list the same
 * Beeper conversations against the same `beeperGroupFilter` state), instead
 * of two copies that previously stacked the group filter above the search
 * field as two separate rows.
 */
function SearchAndGroupRow({
  searchValue,
  onSearchChange,
  groupValue,
  onGroupChange,
}: {
  searchValue: string;
  onSearchChange: (v: string) => void;
  groupValue: string | undefined;
  onGroupChange: (v: string | undefined) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="min-w-0 flex-1">
        <SearchInput value={searchValue} onChange={onSearchChange} />
      </div>
      <BeeperGroupFilter value={groupValue} onChange={onGroupChange} className="h-7 shrink-0 px-1.5 text-xs" />
    </div>
  );
}

function Resizer({
  containerRef,
  side,
  min,
  centerMin,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  side: ResizeSide;
  min: number;
  centerMin: number;
}) {
  return (
    <div className="relative min-w-[14px] cursor-col-resize bg-border/40 hover:bg-border">
      <div
        className="absolute inset-y-0 -left-2 -right-2 cursor-col-resize"
        onMouseDown={(e) => {
          e.preventDefault();
          if (containerRef.current) startColumnResize(containerRef.current, side, e.clientX, { min, centerMin });
        }}
      />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-[4px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground/40" />
    </div>
  );
}

function LeadRow({
  lead,
  selected,
  count,
  draggable,
  onDragStart,
  onClick,
}: {
  lead: LinksV2LeadRow;
  selected?: boolean;
  count?: number;
  draggable?: boolean;
  onDragStart?: (e: DragEvent) => void;
  onClick?: () => void;
}) {
  return (
    <div
      className={cn(ROW_CLASS, onClick && "cursor-pointer", draggable && "cursor-grab active:cursor-grabbing", selected && "bg-accent")}
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onClick}
      data-lead-loca={lead.loca}
    >
      <div className="min-w-0 flex-1 truncate text-xs font-medium">
        {/*
          Only the name is a link — the row itself keeps its own
          click-to-select and drag-to-assign behavior. `stopPropagation`
          keeps a name click from also firing the row's onClick (selection);
          `draggable={false}` keeps the browser's native "drag this link"
          gesture from hijacking a drag that started on the name text,
          so the row's own draggable ancestor still initiates the intended
          lead-drag from there.
        */}
        <Link
          href={getLeadDetailsHref(lead.leadName, lead.loca)}
          target="_blank"
          rel="noopener noreferrer"
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          className="hover:underline"
        >
          {lead.leadName}
        </Link>
        {lead.draft && (
          <span className="ml-1.5 rounded bg-amber-500/20 px-1 py-0.5 text-[9px] font-semibold uppercase text-amber-500">
            Draft
          </span>
        )}
      </div>
      {typeof count === "number" && <span className="shrink-0 text-[11px] text-muted-foreground">{count}</span>}
    </div>
  );
}

function BeeperRow({
  chatId,
  name,
  network,
  preview,
  assignedLeadName,
  selected,
  draggable,
  onDragStart,
  onClick,
  onDrop,
  showUnlink,
  onUnlinkClick,
  pending,
}: {
  chatId: string;
  name: string;
  network: string | null;
  preview?: string | null;
  assignedLeadName?: string | null;
  selected?: boolean;
  draggable?: boolean;
  onDragStart?: (e: DragEvent) => void;
  onClick?: () => void;
  onDrop?: (e: DragEvent) => void;
  showUnlink?: boolean;
  onUnlinkClick?: () => void;
  /** Optimistic entry still waiting on the link/unlink POST — shows a spinner, not yet draggable (nothing to unlink/re-link until it's confirmed). */
  pending?: boolean;
}) {
  return (
    <div
      className={cn(
        ROW_CLASS,
        onClick && "cursor-pointer",
        draggable && !pending && "cursor-grab active:cursor-grabbing",
        selected && "bg-accent",
        pending && "opacity-70"
      )}
      draggable={draggable && !pending}
      onDragStart={onDragStart}
      onClick={onClick}
      onDragOver={onDrop ? (e) => e.preventDefault() : undefined}
      onDrop={onDrop}
      data-chat-id={chatId}
      data-pending={pending || undefined}
    >
      <BeeperPlatformIcon network={network} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">
          {/* Same link-carve-out as LeadRow's name — see its comment. */}
          <Link
            href={`/dashboard/beeper?contact=${encodeURIComponent(chatId)}`}
            target="_blank"
            rel="noopener noreferrer"
            draggable={false}
            onClick={(e) => e.stopPropagation()}
            className="hover:underline"
          >
            {name}
          </Link>
        </div>
        {assignedLeadName ? (
          <div className="truncate text-[10px] text-muted-foreground">{assignedLeadName}</div>
        ) : preview ? (
          <div className="truncate text-[10px] text-muted-foreground">{preview}</div>
        ) : null}
      </div>
      {pending && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" aria-label="Linking…" />}
      {showUnlink && !pending && (
        <button
          type="button"
          aria-label="Unlink lead from this conversation"
          onClick={(e) => {
            e.stopPropagation();
            onUnlinkClick?.();
          }}
          className="shrink-0 text-red-500 hover:text-red-400"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Fixed 24px (h-6/w-6) — the only size used across the Google tab's linked-contact rows. */
function GoogleAvatar({ photoUrl, name }: { photoUrl: string | null | undefined; name: string }) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt=""
        referrerPolicy="no-referrer"
        className="h-6 w-6 shrink-0 rounded-full object-cover bg-muted"
      />
    );
  }
  return (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
      {(name || "?").slice(0, 1).toUpperCase()}
    </div>
  );
}

function GoogleRow({
  contact,
  draggable,
  onDragStart,
}: {
  contact: GoogleContactRow;
  draggable?: boolean;
  onDragStart?: (e: DragEvent) => void;
}) {
  return (
    <div
      className={cn(ROW_CLASS, draggable && "cursor-grab active:cursor-grabbing")}
      draggable={draggable}
      onDragStart={onDragStart}
    >
      <GoogleAvatar photoUrl={contact.photoUrl} name={contact.displayName || "?"} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{contact.displayName || "(no name)"}</div>
        {contact.phones[0] && <div className="truncate text-[10px] text-muted-foreground">{contact.phones[0]}</div>}
      </div>
    </div>
  );
}

function ConvView({ state }: { state: ConvViewState }) {
  if (state.status === "idle") return null;
  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading…
      </div>
    );
  }
  if (state.status === "error") return <div className="text-xs text-red-500">{state.error}</div>;
  if (state.messages.length === 0) return <div className="text-xs text-muted-foreground">No messages.</div>;
  return (
    <div className="space-y-1.5">
      {state.messages.map((m) => (
        <div
          key={m._id}
          className={cn(
            "max-w-[75%] whitespace-pre-wrap break-words rounded-xl px-2.5 py-1.5 text-xs",
            m.isSelf ? "ml-auto bg-foreground text-background" : "bg-muted"
          )}
        >
          {m.text || <span className="italic opacity-60">(no text)</span>}
        </div>
      ))}
    </div>
  );
}

function RemoveDropZone({ onDrop }: { onDrop: (e: DragEvent) => void }) {
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDrop(e);
      }}
      className="mb-2 inline-flex h-5 items-center rounded border border-red-800/60 bg-red-950/30 px-2 text-[9px] font-bold tracking-wide text-red-400 dark:bg-red-950/50"
    >
      REMOVE
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function LinksV2Page() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [leads, setLeads] = useState<LinksV2LeadRow[] | null>(null);
  const [beeperContacts, setBeeperContacts] = useState<BeeperContactRow[] | null>(null);
  const [googleContacts, setGoogleContacts] = useState<GoogleContactRow[] | null>(null);

  const [activeTab, setActiveTab] = useState<MainTab>("leads");

  const [syncing, setSyncing] = useState(false);
  const [report, setReport] = useState<SyncReport | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  // Optimistic pending state for Beeper conversation <-> Lead linking: the
  // conversation must show up in the target list the instant it's dropped,
  // with a spinner, instead of only after the link POST + a full leads
  // refetch both resolve (previously nothing appeared until that whole
  // round trip finished — the actual few-second "lag"). `status: "error"`
  // is set only transiently right before the entry is dropped, so a
  // consumer could show a brief failure indicator if ever needed; today the
  // entry is just removed (rollback) and the failure surfaces through the
  // existing `actionError` banner, per the current CHAD error-reporting
  // convention (see `runAction` below).
  interface PendingBeeperLink {
    chatId: string;
    leadLoca: string;
    leadName: string;
    network: string;
    status: "pending" | "error";
  }
  const [pendingBeeperLinks, setPendingBeeperLinks] = useState<PendingBeeperLink[]>([]);
  const pendingChatIds = useMemo(
    () => new Set(pendingBeeperLinks.filter((p) => p.status === "pending").map((p) => p.chatId)),
    [pendingBeeperLinks]
  );

  // Shared Beeper contact-group filter (Leads tab's right panel and Conv tab's
  // left panel both list the same Beeper conversations) — defaults to the
  // user's default group from Beeper → Groups (same convention as the Beeper
  // page's own group filter: undefined = all groups, "__none__" = no group).
  const [beeperGroupFilter, setBeeperGroupFilter] = useState<string | undefined>(undefined);
  const appliedDefaultGroupRef = useRef(false);
  useEffect(() => {
    if (appliedDefaultGroupRef.current) return;
    appliedDefaultGroupRef.current = true;
    fetch("/api/beeper-crm/groups/default")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { _id?: string } | null) => {
        if (data?._id) setBeeperGroupFilter(data._id);
      })
      .catch(() => {});
  }, []);

  // Leads tab
  const [leadsSelectedLoca, setLeadsSelectedLoca] = useState<string | null>(null);
  // Links (pinned left) and Conv (pinned right) are two independent
  // toggle panels, not a mutually-exclusive tab pair: Links only exists
  // once a lead is selected on the left, Conv only exists once a
  // conversation is selected (either from the linked list or the right
  // panel) — both can be open at once. Each starts open the moment its
  // selection appears (matching the prior single-click behavior for Conv),
  // and its own label toggles it shut/open afterward.
  const [leadsLinksOpen, setLeadsLinksOpen] = useState(false);
  const [leadsConvOpen, setLeadsConvOpen] = useState(false);
  const [leadsSelectedChatId, setLeadsSelectedChatId] = useState<string | null>(null);
  const [leadsSearchLeft, setLeadsSearchLeft] = useState("");
  const [leadsSearchRight, setLeadsSearchRight] = useState("");
  const [convState, setConvState] = useState<ConvViewState>({ status: "idle" });
  const leadsGridRef = useRef<HTMLDivElement>(null);

  // Conv tab
  const [convSearchLeft, setConvSearchLeft] = useState("");
  const [convSearchRight, setConvSearchRight] = useState("");
  const convGridRef = useRef<HTMLDivElement>(null);

  // Google tab
  const [googleSelectedLoca, setGoogleSelectedLoca] = useState<string | null>(null);
  const [googleSearchLeft, setGoogleSearchLeft] = useState("");
  const [googleSearchRight, setGoogleSearchRight] = useState("");
  const googleGridRef = useRef<HTMLDivElement>(null);

  // ── Data loading ──
  const loadLeads = useCallback(async () => {
    const { ok, json } = await fetchJson("/api/msg-automation/links-v2");
    const j = json as { success?: boolean; error?: string; leads?: LinksV2LeadRow[] } | null;
    if (!ok || !j?.success) {
      setLoadError(j?.error || "Failed to load leads");
      return;
    }
    setLeads(Array.isArray(j.leads) ? j.leads : []);
  }, []);

  const loadBeeper = useCallback(async () => {
    const { ok, json } = await fetchJson("/api/beeper-crm/contacts");
    setBeeperContacts(ok && Array.isArray(json) ? (json as BeeperContactRow[]) : []);
  }, []);

  const loadGoogle = useCallback(async () => {
    const { json } = await fetchJson("/api/google-contacts/list");
    const j = json as { contacts?: GoogleContactRow[] } | null;
    setGoogleContacts(Array.isArray(j?.contacts) ? j.contacts : []);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadLeads(), loadBeeper(), loadGoogle()]).finally(() => setLoading(false));
  }, [loadLeads, loadBeeper, loadGoogle]);

  async function handleSynchronize() {
    setSyncing(true);
    setSyncError(null);
    setReport(null);
    try {
      const res = await fetch("/api/msg-automation/links-v2/synchronize", { method: "POST" });
      const json = (await res.json()) as { success?: boolean; error?: string; report?: SyncReport };
      if (!res.ok || !json.success) {
        setSyncError(json.error || "Synchronize failed");
        return;
      }
      setReport(json.report ?? null);
      await loadLeads();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  }

  // ── Derived data ──
  const leadsByLoca = useMemo(() => new Map((leads ?? []).map((l) => [l.loca, l])), [leads]);
  const beeperChatIdToLead = useMemo(() => {
    const map = new Map<string, { loca: string; leadName: string }>();
    for (const lead of leads ?? []) {
      for (const entry of lead.links.beeper) {
        map.set(entry.chatId, { loca: lead.loca, leadName: lead.leadName });
      }
    }
    return map;
  }, [leads]);
  const beeperContactsById = useMemo(
    () => new Map((beeperContacts ?? []).map((c) => [c._id, c])),
    [beeperContacts]
  );
  const googleContactsByResource = useMemo(
    () => new Map((googleContacts ?? []).map((c) => [c.resourceName, c])),
    [googleContacts]
  );

  const selectedLead = leadsSelectedLoca ? leadsByLoca.get(leadsSelectedLoca) ?? null : null;
  // Persisted links for the selected lead, plus any still-pending optimistic
  // entries for that same lead (deduped against a persisted entry that just
  // landed via `loadLeads()`, in case that resolves before the pending
  // entry is cleared).
  const linkedBeeperForSelected = useMemo(() => {
    const persisted = selectedLead?.links.beeper ?? [];
    const persistedIds = new Set(persisted.map((e) => e.chatId));
    const pendingForLead = pendingBeeperLinks.filter(
      (p) => p.leadLoca === leadsSelectedLoca && p.status === "pending" && !persistedIds.has(p.chatId)
    );
    return [
      ...persisted.map((e) => ({ chatId: e.chatId, type: e.type, pending: false })),
      ...pendingForLead.map((p) => ({ chatId: p.chatId, type: p.network, pending: true })),
    ];
  }, [selectedLead, pendingBeeperLinks, leadsSelectedLoca]);
  // Same idea for the Conv tab's "assigned lead" display: a pending link
  // must show its target lead + spinner immediately too, not only after
  // the backend confirms it.
  const effectiveOwnerByChatId = useMemo(() => {
    const map = new Map<string, { loca: string; leadName: string; pending: boolean }>();
    for (const [chatId, owner] of beeperChatIdToLead) map.set(chatId, { ...owner, pending: false });
    for (const p of pendingBeeperLinks) {
      if (p.status === "pending") map.set(p.chatId, { loca: p.leadLoca, leadName: p.leadName, pending: true });
    }
    return map;
  }, [beeperChatIdToLead, pendingBeeperLinks]);
  const googleSelectedLead = googleSelectedLoca ? leadsByLoca.get(googleSelectedLoca) ?? null : null;
  const linkedGoogleForSelected = googleSelectedLead?.links.googleContacts ?? [];

  const filteredLeadsLeft = useMemo(
    () => (leads ?? []).filter((l) => matches(leadsSearchLeft, l.leadName)),
    [leads, leadsSearchLeft]
  );
  const filteredBeeperRight = useMemo(
    () =>
      (beeperContacts ?? []).filter(
        (c) => matches(leadsSearchRight, c.displayName) && matchesGroup(beeperGroupFilter, c.groupId)
      ),
    [beeperContacts, leadsSearchRight, beeperGroupFilter]
  );
  const filteredBeeperConvLeft = useMemo(
    () =>
      (beeperContacts ?? []).filter(
        (c) => matches(convSearchLeft, c.displayName) && matchesGroup(beeperGroupFilter, c.groupId)
      ),
    [beeperContacts, convSearchLeft, beeperGroupFilter]
  );
  const filteredLeadsConvRight = useMemo(
    () => (leads ?? []).filter((l) => matches(convSearchRight, l.leadName)),
    [leads, convSearchRight]
  );
  const filteredLeadsGoogleLeft = useMemo(
    () => (leads ?? []).filter((l) => matches(googleSearchLeft, l.leadName)),
    [leads, googleSearchLeft]
  );
  const filteredGoogleRight = useMemo(
    () => (googleContacts ?? []).filter((c) => matches(googleSearchRight, c.displayName || "")),
    [googleContacts, googleSearchRight]
  );

  // ── Leads-tab conversation selection / reset on lead change ──
  useEffect(() => {
    // A newly selected lead immediately opens its own Links panel (no
    // extra click needed, same as picking a conversation already does for
    // Conv) and closes any previously open Conv panel — a different lead
    // means a different conversation context.
    setLeadsLinksOpen(true);
    setLeadsConvOpen(false);
    setLeadsSelectedChatId(null);
    setConvState({ status: "idle" });
  }, [leadsSelectedLoca]);

  useEffect(() => {
    if (!leadsSelectedChatId) return;
    let cancelled = false;
    setConvState({ status: "loading" });
    fetch(`/api/beeper-crm/contacts/${encodeURIComponent(leadsSelectedChatId)}`)
      .then((res) => res.json())
      .then((json: { messages?: BeeperMessageRow[]; error?: string }) => {
        if (cancelled) return;
        if (!Array.isArray(json.messages)) {
          setConvState({ status: "error", error: json.error || "Failed to load conversation" });
          return;
        }
        setConvState({ status: "ready", messages: json.messages });
      })
      .catch((err) => {
        if (!cancelled) setConvState({ status: "error", error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [leadsSelectedChatId]);

  function selectLeadsConversation(chatId: string) {
    setLeadsSelectedChatId(chatId);
    setLeadsConvOpen(true);
  }

  // ── Mutations ──
  function confirm(state: ConfirmState) {
    setActionError(null);
    setConfirmState(state);
  }
  async function runAction(action: () => Promise<void>) {
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  async function assignBeeperToLead(targetLoca: string, chatId: string, network: string) {
    // Already linking this exact conversation somewhere — block a second,
    // overlapping link attempt until the first one resolves.
    if (pendingChatIds.has(chatId)) return;
    const owner = beeperChatIdToLead.get(chatId);
    const targetLead = leadsByLoca.get(targetLoca);
    const contactName = beeperContactsById.get(chatId)?.displayName ?? chatId;
    const targetLeadName = targetLead?.leadName ?? targetLoca;

    async function doLink(unlinkFirst?: { loca: string }) {
      // Optimistic entry appears instantly (before either network call),
      // with a spinner, and is removed in `finally` regardless of outcome
      // — on success `loadLeads()` has already brought in the real,
      // persisted entry by then; on failure the entry just disappears
      // (rollback) and `runAction`'s catch surfaces the error via the
      // existing `actionError` banner.
      setPendingBeeperLinks((prev) => [
        ...prev,
        { chatId, leadLoca: targetLoca, leadName: targetLeadName, network, status: "pending" },
      ]);
      try {
        if (unlinkFirst) {
          await postJson("/api/msg-automation/links-v2/beeper-unlink", { leadLoca: unlinkFirst.loca, chatId });
        }
        await postJson("/api/msg-automation/links-v2/beeper-link", { leadLoca: targetLoca, chatId, network });
        await loadLeads();
      } finally {
        setPendingBeeperLinks((prev) => prev.filter((p) => p.chatId !== chatId));
      }
    }

    if (owner && owner.loca !== targetLoca) {
      confirm({
        title: "Replace linked lead?",
        description: `"${contactName}" is already linked to ${owner.leadName}. Replace with ${targetLeadName}?`,
        confirmLabel: "Replace",
        destructive: true,
        onConfirm: () => runAction(() => doLink({ loca: owner.loca })),
      });
      return;
    }
    await runAction(() => doLink());
  }

  function handleAssignBeeperDrop(e: DragEvent) {
    e.preventDefault();
    const payload = readDragPayload(e);
    if (!payload || payload.kind !== "beeper-contact" || !leadsSelectedLoca) return;
    void assignBeeperToLead(leadsSelectedLoca, payload.chatId, payload.network);
  }

  function handleRemoveBeeperDrop(e: DragEvent) {
    const payload = readDragPayload(e);
    if (!payload || payload.kind !== "beeper-linked" || !leadsSelectedLoca) return;
    const leadName = leadsByLoca.get(leadsSelectedLoca)?.leadName ?? "";
    const name = beeperContactsById.get(payload.chatId)?.displayName ?? payload.chatId;
    confirm({
      title: "Remove link?",
      description: `Remove "${name}" from ${leadName}?`,
      confirmLabel: "Remove",
      destructive: true,
      onConfirm: () =>
        runAction(async () => {
          await postJson("/api/msg-automation/links-v2/beeper-unlink", {
            leadLoca: leadsSelectedLoca,
            chatId: payload.chatId,
          });
          await loadLeads();
        }),
    });
  }

  function handleConvRowDrop(e: DragEvent, contact: BeeperContactRow) {
    e.preventDefault();
    const payload = readDragPayload(e);
    if (!payload || payload.kind !== "lead") return;
    void assignBeeperToLead(payload.loca, contact._id, contact.platformNetwork ?? "unknown");
  }

  function handleConvUnlinkClick(chatId: string) {
    const owner = beeperChatIdToLead.get(chatId);
    if (!owner) return;
    const name = beeperContactsById.get(chatId)?.displayName ?? chatId;
    confirm({
      title: "Unlink lead from this conversation?",
      description: `${owner.leadName} ↔ ${name}`,
      confirmLabel: "Yes",
      cancelLabel: "No",
      destructive: true,
      onConfirm: () =>
        runAction(async () => {
          await postJson("/api/msg-automation/links-v2/beeper-unlink", { leadLoca: owner.loca, chatId });
          await loadLeads();
        }),
    });
  }

  function handleGoogleAssignDrop(e: DragEvent) {
    e.preventDefault();
    const payload = readDragPayload(e);
    if (!payload || payload.kind !== "google-contact" || !googleSelectedLoca) return;
    void runAction(async () => {
      await postJson("/api/msg-automation/links-v2/google-link", {
        leadLoca: googleSelectedLoca,
        resourceName: payload.resourceName,
        displayName: payload.displayName,
        phone: payload.phone,
      });
      await loadLeads();
    });
  }

  function handleGoogleRemoveDrop(e: DragEvent) {
    const payload = readDragPayload(e);
    if (!payload || payload.kind !== "google-linked" || !googleSelectedLoca) return;
    const leadName = leadsByLoca.get(googleSelectedLoca)?.leadName ?? "";
    const full = googleContactsByResource.get(payload.resourceName);
    const name = full?.displayName || payload.resourceName;
    confirm({
      title: "Remove link?",
      description: `Remove "${name}" from ${leadName}?`,
      confirmLabel: "Remove",
      destructive: true,
      onConfirm: () =>
        runAction(async () => {
          await postJson("/api/msg-automation/links-v2/google-unlink", {
            leadLoca: googleSelectedLoca,
            resourceName: payload.resourceName,
          });
          await loadLeads();
        }),
    });
  }

  // ── Render ──

  const mainTabsBar = (
    <div className="flex shrink-0 gap-0.5 border-b px-2">
      {(["leads", "conv", "google"] as const).map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => setActiveTab(tab)}
          className={cn(
            "border-b-2 border-transparent px-3 py-1.5 text-xs font-medium capitalize text-muted-foreground hover:text-foreground",
            activeTab === tab && INNER_TAB_ON_CLASS
          )}
        >
          {tab === "leads" ? "Leads" : tab === "conv" ? "Conv" : "Google"}
        </button>
      ))}
    </div>
  );

  const leadsMode = (
    <div
      ref={leadsGridRef}
      data-testid="leads-grid"
      className="grid h-full min-h-0 w-full"
      style={{ gridTemplateColumns: "300px 14px minmax(100px,1fr) 14px 360px" }}
    >
      <div className="flex min-h-0 min-w-0 flex-col border-r bg-muted/5">
        <div className="shrink-0 p-1.5">
          <SearchInput value={leadsSearchLeft} onChange={setLeadsSearchLeft} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1 pb-1">
          {filteredLeadsLeft.map((lead) => (
            <LeadRow
              key={lead.loca}
              lead={lead}
              selected={lead.loca === leadsSelectedLoca}
              count={lead.links.beeper.length}
              onClick={() => setLeadsSelectedLoca(lead.loca)}
            />
          ))}
        </div>
      </div>
      <Resizer containerRef={leadsGridRef} side="left" min={SIDE_MIN} centerMin={CENTER_MIN} />
      {/*
        Links (pinned left) and Conv (pinned right) are independent panels,
        not a mutually-exclusive tab pair — each only exists once its own
        selection exists (a lead for Links, a conversation for Conv), each
        can be open or closed on its own, and both can show at once, split
        evenly across the center column.
      */}
      <div className="flex min-h-0 min-w-0 flex-1">
        {leadsSelectedLoca && (
          <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", leadsSelectedChatId && "border-r")}>
            <button
              type="button"
              onClick={() => setLeadsLinksOpen((v) => !v)}
              className={cn(INNER_TAB_CLASS, "shrink-0 self-start", leadsLinksOpen && INNER_TAB_ON_CLASS)}
            >
              Links
            </button>
            {leadsLinksOpen && (
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2">
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleAssignBeeperDrop}
                  className="min-h-full"
                  data-testid="links-assign-drop-zone"
                >
                  <RemoveDropZone onDrop={handleRemoveBeeperDrop} />
                  <div className="space-y-0.5">
                    {linkedBeeperForSelected.map((entry) => {
                      const contact = beeperContactsById.get(entry.chatId);
                      return (
                        <BeeperRow
                          key={entry.chatId}
                          chatId={entry.chatId}
                          name={contact?.displayName || entry.chatId}
                          network={contact?.platformNetwork ?? entry.type}
                          selected={entry.chatId === leadsSelectedChatId}
                          draggable
                          onDragStart={(e) => setDragPayload(e, { kind: "beeper-linked", chatId: entry.chatId })}
                          onClick={() => selectLeadsConversation(entry.chatId)}
                          pending={entry.pending}
                        />
                      );
                    })}
                    {selectedLead && linkedBeeperForSelected.length === 0 && (
                      <div className="px-1 py-2 text-[11px] text-muted-foreground">—</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {leadsSelectedChatId && (
          <div className="ml-auto flex min-h-0 min-w-0 flex-1 flex-col">
            <button
              type="button"
              onClick={() => setLeadsConvOpen((v) => !v)}
              className={cn(INNER_TAB_CLASS, "shrink-0 self-end", leadsConvOpen && INNER_TAB_ON_CLASS)}
            >
              Conv
            </button>
            {leadsConvOpen && (
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2">
                <ConvView state={convState} />
              </div>
            )}
          </div>
        )}
      </div>
      <Resizer containerRef={leadsGridRef} side="right" min={SIDE_MIN} centerMin={CENTER_MIN} />
      <div className="flex min-h-0 min-w-0 flex-col border-l bg-muted/5">
        <div className="shrink-0 p-1.5">
          <SearchAndGroupRow
            searchValue={leadsSearchRight}
            onSearchChange={setLeadsSearchRight}
            groupValue={beeperGroupFilter}
            onGroupChange={setBeeperGroupFilter}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1 pb-1">
          {filteredBeeperRight.map((c) => (
            <BeeperRow
              key={c._id}
              chatId={c._id}
              name={c.displayName}
              network={c.platformNetwork}
              preview={c.lastMessage?.text}
              selected={c._id === leadsSelectedChatId}
              draggable
              onDragStart={(e) =>
                setDragPayload(e, { kind: "beeper-contact", chatId: c._id, network: c.platformNetwork ?? "unknown" })
              }
              onClick={() => selectLeadsConversation(c._id)}
            />
          ))}
        </div>
      </div>
    </div>
  );

  const convMode = (
    <div
      ref={convGridRef}
      className="grid h-full min-h-0 w-full"
      style={{ gridTemplateColumns: "minmax(200px,1fr) 14px minmax(200px,1fr)" }}
    >
      <div className="flex min-h-0 min-w-0 flex-col border-r bg-muted/5">
        <div className="shrink-0 p-1.5">
          <SearchAndGroupRow
            searchValue={convSearchLeft}
            onSearchChange={setConvSearchLeft}
            groupValue={beeperGroupFilter}
            onGroupChange={setBeeperGroupFilter}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1 pb-1">
          {filteredBeeperConvLeft.map((c) => {
            const owner = effectiveOwnerByChatId.get(c._id);
            return (
              <BeeperRow
                key={c._id}
                chatId={c._id}
                name={c.displayName}
                network={c.platformNetwork}
                assignedLeadName={owner?.leadName}
                showUnlink={Boolean(owner) && !owner?.pending}
                onUnlinkClick={() => handleConvUnlinkClick(c._id)}
                onDrop={(e) => handleConvRowDrop(e, c)}
                pending={owner?.pending}
              />
            );
          })}
        </div>
      </div>
      <Resizer containerRef={convGridRef} side="single" min={CONV_MIN} centerMin={CONV_MIN} />
      <div className="flex min-h-0 min-w-0 flex-col border-l bg-muted/5">
        <div className="shrink-0 p-1.5">
          <SearchInput value={convSearchRight} onChange={setConvSearchRight} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1 pb-1">
          {filteredLeadsConvRight.map((lead) => (
            <LeadRow
              key={lead.loca}
              lead={lead}
              draggable
              onDragStart={(e) => setDragPayload(e, { kind: "lead", loca: lead.loca, leadName: lead.leadName })}
            />
          ))}
        </div>
      </div>
    </div>
  );

  const googleMode = (
    <div
      ref={googleGridRef}
      className="grid h-full min-h-0 w-full"
      style={{ gridTemplateColumns: "300px 14px minmax(100px,1fr) 14px 300px" }}
    >
      <div className="flex min-h-0 min-w-0 flex-col border-r bg-muted/5">
        <div className="shrink-0 p-1.5">
          <SearchInput value={googleSearchLeft} onChange={setGoogleSearchLeft} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1 pb-1">
          {filteredLeadsGoogleLeft.map((lead) => (
            <LeadRow
              key={lead.loca}
              lead={lead}
              selected={lead.loca === googleSelectedLoca}
              count={lead.links.googleContacts.length}
              onClick={() => setGoogleSelectedLoca(lead.loca)}
            />
          ))}
        </div>
      </div>
      <Resizer containerRef={googleGridRef} side="left" min={SIDE_MIN} centerMin={CENTER_MIN} />
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleGoogleAssignDrop}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2"
      >
        <RemoveDropZone onDrop={handleGoogleRemoveDrop} />
        <div className="space-y-0.5">
          {linkedGoogleForSelected.map((entry) => {
            const full = googleContactsByResource.get(entry.resourceName);
            return (
              <div
                key={entry.resourceName}
                className={cn(ROW_CLASS, "cursor-grab active:cursor-grabbing")}
                draggable
                onDragStart={(e) => setDragPayload(e, { kind: "google-linked", resourceName: entry.resourceName })}
              >
                <GoogleAvatar photoUrl={full?.photoUrl} name={full?.displayName || entry.displayName} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{full?.displayName || entry.displayName}</div>
                  <div className="truncate text-[10px] text-muted-foreground">{full?.phones[0] || entry.phone}</div>
                </div>
              </div>
            );
          })}
          {googleSelectedLead && linkedGoogleForSelected.length === 0 && (
            <div className="px-1 py-2 text-[11px] text-muted-foreground">—</div>
          )}
        </div>
      </div>
      <Resizer containerRef={googleGridRef} side="right" min={SIDE_MIN} centerMin={CENTER_MIN} />
      <div className="flex min-h-0 min-w-0 flex-col border-l bg-muted/5">
        <div className="shrink-0 p-1.5">
          <SearchInput value={googleSearchRight} onChange={setGoogleSearchRight} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1 pb-1">
          {filteredGoogleRight.map((c) => (
            <GoogleRow
              key={c.resourceName}
              contact={c}
              draggable
              onDragStart={(e) =>
                setDragPayload(e, {
                  kind: "google-contact",
                  resourceName: c.resourceName,
                  displayName: c.displayName || "",
                  phone: c.phones[0] || "",
                })
              }
            />
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <DashboardPageShell
      title="Links V2"
      upLevel={{ href: "/dashboard/msg-automation", label: "Msg Auto" }}
      scroll={false}
      padded={false}
      toolbarSecondRow={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 gap-1 px-2 text-[11px]"
            disabled={syncing}
            onClick={() => void handleSynchronize()}
          >
            <RefreshCw className={cn("h-3 w-3", syncing && "animate-spin")} />
            Synchronize
          </Button>
          {report && (
            <span className="text-[11px] text-muted-foreground">
              Leads {report.leadsScanned} · +Beeper {report.newBeeperLinks} · +Google {report.newGoogleContactsLinks} ·
              Drafts {report.draftLeadsCreated.length} · Errors {report.errors.length}
            </span>
          )}
          {syncError && <span className="text-[11px] text-red-500">{syncError}</span>}
          {actionError && <span className="text-[11px] text-red-500">{actionError}</span>}
        </div>
      }
      contentClassName="p-0"
    >
      <div className="flex h-full min-h-0 flex-col">
        {loading && (
          <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        )}
        {!loading && loadError && (
          <div className="p-4">
            <ErrorBox message={loadError} />
          </div>
        )}
        {!loading && !loadError && (
          <>
            {mainTabsBar}
            <div className="min-h-0 flex-1">
              {activeTab === "leads" && leadsMode}
              {activeTab === "conv" && convMode}
              {activeTab === "google" && googleMode}
            </div>
          </>
        )}
      </div>

      <Dialog open={!!confirmState} onOpenChange={(open) => !open && setConfirmState(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{confirmState?.title}</DialogTitle>
            <DialogDescription>{confirmState?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmState(null)}>
              {confirmState?.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              variant={confirmState?.destructive ? "destructive" : "default"}
              size="sm"
              onClick={() => {
                const s = confirmState;
                setConfirmState(null);
                void s?.onConfirm();
              }}
            >
              {confirmState?.confirmLabel ?? "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardPageShell>
  );
}
