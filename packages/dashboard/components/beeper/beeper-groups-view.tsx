"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Users, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BeeperConversationView, type ParsedWhatsAppMessage } from "@/components/shared/beeper-conversation-view";
import { beeperContactDisplayName } from "@/lib/beeper-contact-display";
import { BeeperPlatformIcon } from "./beeper-platform-icon";
import { BeeperGroupsManage } from "./beeper-groups-manage";
import { ClickRevealTooltip } from "@/components/shared/click-reveal-tooltip";

interface BeeperContactRow {
  _id: string;
  displayName: string;
  groupId: string | null;
  platformNetwork?: string | null;
  lastMessage?: { text: string; timestamp: string | null; network: string } | null;
  identities?: Array<{ network?: string; senderName?: string }>;
}

interface BeeperGroup {
  _id: string;
  name: string;
}

/** Sentinel for "no group" wherever a real group id is otherwise expected (bulk-assign target, pill filter key) — mirrors the API's own `__none__` query-param convention. */
const NO_GROUP_KEY = "__none__";

export type GroupsSubTab = "list" | "manage";

export interface BeeperGroupsViewProps {
  /** Called after a group is created/renamed, so the page-level filter combobox can refresh its options. */
  onGroupsChanged?: () => void;
  /** List vs Manage — controlled by the page row next to the tabs. */
  subTab?: GroupsSubTab;
  /** Search query from the page toolbar. */
  query?: string;
  onQueryChange?: (query: string) => void;
  /** Reports the filtered row count (List sub-tab only) so the page can render "N items" inline in row 2. */
  onCountChange?: (count: number) => void;
}

/**
 * Groups tab (Story 101) — sub-tabs (List / Manage live in page.tsx):
 * - List: assign contacts to groups (bulk + per-row), with per-group toggle
 *   pills to hide/show a group's contacts — this replaced the page-level
 *   "All groups" single-select combobox here, since toggling several
 *   groups independently is strictly more useful than picking just one.
 * - Manage: create/rename/delete groups + set the default group.
 */
export function BeeperGroupsView({
  onGroupsChanged,
  subTab = "list",
  query = "",
  onCountChange,
}: BeeperGroupsViewProps = {}) {
  const [contacts, setContacts] = useState<BeeperContactRow[]>([]);
  const [groups, setGroups] = useState<BeeperGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const [bulkGroupId, setBulkGroupId] = useState("");
  const [applying, setApplying] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [conversationMessages, setConversationMessages] = useState<ParsedWhatsAppMessage[]>([]);
  /** Toggle-off pill filter (List sub-tab only) — a group (or NO_GROUP_KEY) in here is hidden from the table below. */
  const [excludedKeys, setExcludedKeys] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadGroups = useCallback(async () => {
    try {
      const res = await fetch("/api/beeper-crm/groups");
      if (!res.ok) throw new Error(`Failed to load groups: ${res.status}`);
      const data = await res.json();
      setGroups(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load groups");
    }
  }, []);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("view", "permissions");
      params.set("permissionFilter", "all");
      const res = await fetch(`/api/beeper-crm/contacts?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to load contacts: ${res.status}`);
      const data = await res.json();
      setContacts(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load contacts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGroups();
    void loadContacts();
  }, [loadGroups, loadContacts]);

  function groupKey(groupId: string | null): string {
    return groupId ?? NO_GROUP_KEY;
  }

  const filtered = contacts.filter(
    (c) =>
      c.displayName.toLowerCase().includes(query.toLowerCase()) &&
      !excludedKeys.has(groupKey(c.groupId))
  );

  useEffect(() => {
    if (subTab === "list") onCountChange?.(filtered.length);
  }, [subTab, filtered.length, onCountChange]);

  function toggleGroupPill(key: string) {
    setExcludedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function groupName(groupId: string | null): string {
    if (!groupId) return "— no group —";
    return groups.find((g) => g._id === groupId)?.name ?? "—";
  }

  function handleCheckboxClick(e: React.MouseEvent<HTMLInputElement>, index: number, id: string) {
    if (e.shiftKey && lastClickedIndex !== null) {
      const [start, end] = [Math.min(lastClickedIndex, index), Math.max(lastClickedIndex, index)];
      const rangeIds = filtered.slice(start, end + 1).map((c) => c._id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        rangeIds.forEach((rid) => next.add(rid));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }
    setLastClickedIndex(index);
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      if (prev.size === filtered.length) return new Set();
      return new Set(filtered.map((c) => c._id));
    });
  }

  async function assignSingleGroup(contactId: string, groupId: string) {
    setSavingId(contactId);
    setContacts((prev) => prev.map((c) => (c._id === contactId ? { ...c, groupId: groupId || null } : c)));
    try {
      const res = await fetch(`/api/beeper-crm/contacts/${contactId}/group`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: groupId || null }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || `Save failed (${res.status})`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign group");
      await loadContacts();
    } finally {
      setSavingId(null);
    }
  }

  async function applyBulkGroup() {
    if (!bulkGroupId || selectedIds.size === 0) return;
    setApplying(true);
    try {
      const targetGroupId = bulkGroupId === NO_GROUP_KEY ? null : bulkGroupId;
      const res = await fetch("/api/beeper-crm/contacts/group-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: [...selectedIds], groupId: targetGroupId }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || `Failed to assign group (${res.status})`);
      toast.success(`Assigned ${json.updated} contact${json.updated === 1 ? "" : "s"} to "${groupName(targetGroupId)}"`);
      setSelectedIds(new Set());
      await loadContacts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign group");
    } finally {
      setApplying(false);
    }
  }

  function selectContact(id: string) {
    setSelectedContactId(id);
    setLoadingConversation(true);
    setConversationMessages([]);
    fetch(`/api/beeper-crm/contacts/${id}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || `Failed to load conversation: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        setConversationMessages(Array.isArray(data?.conversationMessages) ? data.conversationMessages : []);
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to load conversation");
      })
      .finally(() => setLoadingConversation(false));
  }

  useEffect(() => {
    if (messagesEndRef.current && conversationMessages.length > 0) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [conversationMessages]);

  function handleGroupsChanged() {
    void loadGroups();
    onGroupsChanged?.();
  }

  return (
    <div className="flex flex-col">
      {subTab === "manage" ? (
        <BeeperGroupsManage onGroupsChanged={handleGroupsChanged} />
      ) : (
        <>
          <div className="mb-1.5 flex shrink-0 flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{selectedIds.size} selected</span>

            <select
              className="h-10 rounded-[9px] border border-border bg-background px-2 text-sm"
              value={bulkGroupId}
              onChange={(e) => setBulkGroupId(e.target.value)}
              aria-label="Assign selected contacts to group"
            >
              <option value="">Assign to…</option>
              {groups.map((g) => (
                <option key={g._id} value={g._id}>
                  {g.name}
                </option>
              ))}
              <option value={NO_GROUP_KEY}>— no group —</option>
            </select>
            <Button size="sm" onClick={() => void applyBulkGroup()} disabled={applying || !bulkGroupId || selectedIds.size === 0}>
              {applying ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : "Do"}
            </Button>
          </div>

          {/* Per-group toggle pills — click one off to hide that group's contacts below. */}
          <div className="mb-1.5 flex shrink-0 flex-wrap items-center gap-1.5">
            {groups.map((g) => {
              const excluded = excludedKeys.has(g._id);
              return (
                <button
                  key={g._id}
                  type="button"
                  onClick={() => toggleGroupPill(g._id)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                    excluded
                      ? "border-border bg-transparent text-muted-foreground/50 line-through hover:bg-accent"
                      : "border-primary/40 bg-primary/10 text-foreground hover:bg-primary/20"
                  )}
                  title={excluded ? `Show "${g.name}" contacts again` : `Hide "${g.name}" contacts`}
                >
                  {g.name}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => toggleGroupPill(NO_GROUP_KEY)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                excludedKeys.has(NO_GROUP_KEY)
                  ? "border-border bg-transparent text-muted-foreground/50 line-through hover:bg-accent"
                  : "border-primary/40 bg-primary/10 text-foreground hover:bg-primary/20"
              )}
              title={excludedKeys.has(NO_GROUP_KEY) ? "Show ungrouped contacts again" : "Hide ungrouped contacts"}
            >
              — no group —
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" /> Loading contacts...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-24 text-muted-foreground">
              <Users className="h-10 w-10 opacity-20" />
              <span>No contacts found.</span>
            </div>
          ) : (
            <div className="flex gap-2">
              <div
                className={cn(
                  "min-w-0 flex-1",
                  selectedContactId && "hidden md:block"
                )}
              >
                <div className="overflow-x-auto">
                  {/* table-fixed + explicit widths so columns never reflow as
                      search/filter results change; the last (empty) column
                      absorbs any remaining width so Name's own width stays put. */}
                  <table className="w-full min-w-[560px] table-fixed text-left text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <th className="w-10 pl-2 pr-4 py-2 text-center">
                          <input
                            type="checkbox"
                            className="h-[18px] w-[18px] cursor-pointer"
                            checked={filtered.length > 0 && selectedIds.size === filtered.length}
                            onChange={toggleSelectAll}
                            aria-label="Select all contacts"
                          />
                        </th>
                        <th className="w-[160px] pr-4 py-2">Group</th>
                        <th className="w-[60px] pr-4 py-2 text-center">
                          <ClickRevealTooltip label="Platform">Plat.</ClickRevealTooltip>
                        </th>
                        <th className="w-[240px] py-2">Name</th>
                        <th aria-hidden="true" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filtered.map((c, index) => {
                        const name = beeperContactDisplayName(c.displayName, c.identities);
                        return (
                          <tr
                            key={c._id}
                            className={cn(
                              "hover:bg-accent",
                              savingId === c._id && "opacity-70",
                              selectedContactId === c._id && "bg-accent"
                            )}
                          >
                            <td className="pl-2 pr-4 py-2 text-center">
                              <input
                                type="checkbox"
                                className="h-[18px] w-[18px] cursor-pointer"
                                checked={selectedIds.has(c._id)}
                                onChange={() => {}}
                                onClick={(e) => handleCheckboxClick(e, index, c._id)}
                                aria-label={`Select ${name}`}
                                title="Shift-click to select a range"
                              />
                            </td>
                            <td className="pr-4 py-2">
                              <select
                                className="h-8 w-full rounded-md border border-border bg-background px-1 text-sm"
                                value={c.groupId ?? ""}
                                disabled={savingId === c._id}
                                onChange={(e) => void assignSingleGroup(c._id, e.target.value)}
                                aria-label={`Group for ${name}`}
                              >
                                {groups.map((g) => (
                                  <option key={g._id} value={g._id}>
                                    {g.name}
                                  </option>
                                ))}
                                <option value="">— no group —</option>
                              </select>
                            </td>
                            <td className="pr-4 py-2 text-center align-middle">
                              <BeeperPlatformIcon
                                network={c.platformNetwork ?? c.lastMessage?.network ?? null}
                              />
                            </td>
                            <td className="truncate py-2">
                              <button
                                type="button"
                                className="truncate font-medium hover:underline"
                                onClick={() => selectContact(c._id)}
                              >
                                {name}
                              </button>
                            </td>
                            <td aria-hidden="true" />
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {selectedContactId && (
                <div className="flex w-full shrink-0 flex-col rounded-lg border md:w-[420px]">
                  <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
                    <span className="truncate text-sm font-medium">
                      {(() => {
                        const c = contacts.find((c) => c._id === selectedContactId);
                        return c ? beeperContactDisplayName(c.displayName, c.identities) : "Conversation";
                      })()}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedContactId(null)}
                      aria-label="Close conversation"
                      className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {loadingConversation ? (
                    <div className="flex min-h-[240px] items-center justify-center text-muted-foreground">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    </div>
                  ) : (
                    <BeeperConversationView messages={conversationMessages} endRef={messagesEndRef} />
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
