"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Users, RefreshCw, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BeeperConversationView, type ParsedWhatsAppMessage } from "@/components/shared/beeper-conversation-view";
import { beeperContactDisplayName } from "@/lib/beeper-contact-display";
import { BeeperPlatformIcon } from "./beeper-platform-icon";

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

export interface BeeperGroupsViewProps {
  /** Called after a group is created, so the page-level filter combobox can refresh its options. */
  onGroupsChanged?: () => void;
}

/**
 * Groups tab (Story 101) — bulk contact-group assignment. Intentionally
 * shows every contact regardless of the page-level group filter (this is
 * the management view, not a filtered read) — fetches the full contact
 * list via the same `view=permissions` shape the Permissions tab uses
 * (unfiltered by conversation activity, unlike the default contacts list).
 */
export function BeeperGroupsView({ onGroupsChanged }: BeeperGroupsViewProps = {}) {
  const [contacts, setContacts] = useState<BeeperContactRow[]>([]);
  const [groups, setGroups] = useState<BeeperGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const [bulkGroupId, setBulkGroupId] = useState("");
  const [applying, setApplying] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  /** Groups tab only — click a group pill off to hide its members from the table below. */
  const [excludedGroupIds, setExcludedGroupIds] = useState<Set<string>>(new Set());
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [conversationMessages, setConversationMessages] = useState<ParsedWhatsAppMessage[]>([]);
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
      const res = await fetch("/api/beeper-crm/contacts?view=permissions&permissionFilter=all");
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

  const filtered = contacts.filter(
    (c) =>
      c.displayName.toLowerCase().includes(query.toLowerCase()) &&
      !(c.groupId && excludedGroupIds.has(c.groupId))
  );

  function toggleGroupPill(groupId: string) {
    setExcludedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function groupName(groupId: string | null): string {
    if (!groupId) return "—";
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

  async function createGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    setCreatingGroup(true);
    try {
      const res = await fetch("/api/beeper-crm/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Failed to create group (${res.status})`);
      setNewGroupName("");
      await loadGroups();
      onGroupsChanged?.();
      toast.success(`Group "${name}" ready`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create group");
    } finally {
      setCreatingGroup(false);
    }
  }

  async function applyBulkGroup() {
    if (!bulkGroupId || selectedIds.size === 0) return;
    setApplying(true);
    try {
      const res = await fetch("/api/beeper-crm/contacts/group-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: [...selectedIds], groupId: bulkGroupId }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || `Failed to assign group (${res.status})`);
      toast.success(`Assigned ${json.updated} contact${json.updated === 1 ? "" : "s"} to "${groupName(bulkGroupId)}"`);
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

  return (
    <>
      <div className="mb-1.5 flex shrink-0 flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search"
            className="h-10 w-[140px] rounded-[9px] pl-7 text-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-1">
          <Input
            placeholder="New group name"
            className="h-10 w-[160px] rounded-[9px] text-sm"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void createGroup();
            }}
          />
          <Button size="sm" variant="outline" className="h-10 gap-1" onClick={() => void createGroup()} disabled={creatingGroup || !newGroupName.trim()}>
            <Plus className="h-3.5 w-3.5" /> New group
          </Button>
        </div>

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
        </select>
        <Button size="sm" onClick={() => void applyBulkGroup()} disabled={applying || !bulkGroupId || selectedIds.size === 0}>
          {applying ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : "Do"}
        </Button>

        <span className="ml-auto pr-1 text-sm text-muted-foreground">{filtered.length} contacts</span>
      </div>

      {groups.length > 0 && (
        <div className="mb-1.5 flex shrink-0 flex-wrap items-center gap-1.5">
          {groups.map((g) => {
            const excluded = excludedGroupIds.has(g._id);
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
        </div>
      )}

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
        <div className="flex min-h-0 flex-1 gap-2 overflow-hidden">
          <div
            className={cn(
              "min-h-0 min-w-0 flex-1 overflow-y-auto rounded-lg border bg-muted/10",
              selectedContactId && "hidden md:block"
            )}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        className="h-[18px] w-[18px] cursor-pointer"
                        checked={filtered.length > 0 && selectedIds.size === filtered.length}
                        onChange={toggleSelectAll}
                        aria-label="Select all contacts"
                      />
                    </th>
                    <th className="px-3 py-2">Group</th>
                    <th className="w-8 px-1 py-2 text-center">Platform</th>
                    <th className="px-3 py-2">Name</th>
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
                        <td className="px-3 py-2.5 text-center">
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
                        <td className="px-3 py-2.5">
                          <select
                            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
                            value={c.groupId ?? ""}
                            disabled={savingId === c._id}
                            onChange={(e) => void assignSingleGroup(c._id, e.target.value)}
                            aria-label={`Group for ${name}`}
                          >
                            <option value="">— No group —</option>
                            {groups.map((g) => (
                              <option key={g._id} value={g._id}>
                                {g.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="w-8 px-1 py-2.5 text-center align-middle">
                          <BeeperPlatformIcon
                            network={c.platformNetwork ?? c.lastMessage?.network ?? null}
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            className="font-medium hover:underline"
                            onClick={() => selectContact(c._id)}
                          >
                            {name}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {selectedContactId && (
            <div className="flex h-full w-full shrink-0 flex-col overflow-hidden rounded-lg border md:w-[420px]">
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
              <div className="min-h-0 flex-1 overflow-y-auto">
                {loadingConversation ? (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  </div>
                ) : (
                  <BeeperConversationView messages={conversationMessages} endRef={messagesEndRef} />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
