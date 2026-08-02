"use client";

import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, RefreshCw, Save, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import {
  LIST_ROW_CLASS,
  LIST_ROW_WRAPPER_CLASS,
  SAVE_FRAME_PADDING_CLASS,
} from "@/components/shared/layout-tokens";
import { cn } from "@/lib/utils";
import { BeeperGroupDeleteDialog } from "./beeper-group-delete-dialog";

interface BeeperGroup {
  _id: string;
  name: string;
  isDefault?: boolean;
}

export interface BeeperGroupsManageProps {
  onGroupsChanged?: () => void;
}

const NO_GROUP_KEY = "__none__";

/**
 * Manage sub-tab under Beeper → Groups: group list on the left; on the
 * right, a compact "new group" box on top and a larger details box below
 * it — empty until a group is selected, then showing its editable name,
 * its (read-only) id, and Delete (retype-random-word confirm, same
 * pattern as Folders/Daily Entry/AI Prompts delete).
 */
export function BeeperGroupsManage({ onGroupsChanged }: BeeperGroupsManageProps) {
  const [groups, setGroups] = useState<BeeperGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [defaultGroupId, setDefaultGroupId] = useState<string>("");
  const [savingDefault, setSavingDefault] = useState(false);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/beeper-crm/groups");
      if (!res.ok) throw new Error(`Failed to load groups: ${res.status}`);
      const data = await res.json();
      setGroups(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load groups");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDefaultGroup = useCallback(async () => {
    try {
      const res = await fetch("/api/beeper-crm/groups/default");
      if (!res.ok) return;
      const data = await res.json();
      setDefaultGroupId(data?._id ?? "");
    } catch {
      // non-critical — the picker just falls back to "— no group —"
    }
  }, []);

  useEffect(() => {
    void loadGroups();
    void loadDefaultGroup();
  }, [loadGroups, loadDefaultGroup]);

  async function handleDefaultChange(nextId: string) {
    setSavingDefault(true);
    setDefaultGroupId(nextId);
    try {
      const res = await fetch("/api/beeper-crm/groups/default", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: nextId === NO_GROUP_KEY || !nextId ? null : nextId }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || `Save failed (${res.status})`);
      toast.success("Default group updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to set default group");
      await loadDefaultGroup();
    } finally {
      setSavingDefault(false);
    }
  }

  const selected = groups.find((g) => g._id === selectedId) ?? null;
  const dirty = selected ? editName.trim() !== selected.name : false;

  function openGroup(g: BeeperGroup) {
    setSelectedId(g._id);
    setEditName(g.name);
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch("/api/beeper-crm/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Failed to create group (${res.status})`);
      setNewName("");
      await loadGroups();
      onGroupsChanged?.();
      if (json._id) {
        setSelectedId(json._id);
        setEditName(json.name ?? name);
      }
      toast.success(`Group "${name}" ready`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create group");
    } finally {
      setCreating(false);
    }
  }

  async function handleSave() {
    if (!selected || !dirty) return;
    const name = editName.trim();
    if (!name) {
      toast.error("Group name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/beeper-crm/groups/${encodeURIComponent(selected._id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) {
        throw new Error(json.error || `Save failed (${res.status})`);
      }
      setGroups((prev) => prev.map((g) => (g._id === selected._id ? { ...g, name: json.name } : g)));
      setEditName(json.name);
      onGroupsChanged?.();
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save group");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selected) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/beeper-crm/groups/${encodeURIComponent(selected._id)}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        throw new Error(json.error || `Delete failed (${res.status})`);
      }
      toast.success(`Group "${selected.name}" deleted`);
      setDeleteOpen(false);
      setSelectedId(null);
      setEditName("");
      await loadGroups();
      onGroupsChanged?.();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete group");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex gap-2">
      <div className={cn(LIST_ROW_WRAPPER_CLASS, "w-[180px] shrink-0")}>
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span className="text-sm">…</span>
          </div>
        ) : (
          <div className="divide-y">
            {groups.length === 0 && <div className="px-[10px] py-2 text-sm text-muted-foreground">No groups yet.</div>}
            {groups.map((g) => (
              <button
                key={g._id}
                type="button"
                onClick={() => openGroup(g)}
                aria-current={selectedId === g._id ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-2 text-left",
                  LIST_ROW_CLASS,
                  selectedId === g._id && "bg-accent"
                )}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Users className="h-3 w-3" />
                </span>
                <span className="min-w-0 truncate text-sm font-medium">{g.name}</span>
              </button>
            ))}
            {/* Virtual "no group" row — for reference/consistency with the
                other group pickers only; not a real document, so it's never
                clickable/editable/deletable. Always last, matching the
                "no group" ordering standard everywhere else. */}
            <div className="flex w-full items-center gap-2 px-[10px] py-[10px] text-left text-muted-foreground/60 italic">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
                <Users className="h-3 w-3" />
              </span>
              <span className="min-w-0 truncate text-sm">— no group —</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2">
        <div
          className={cn(
            "flex shrink-0 flex-wrap items-center gap-2 rounded-lg border bg-muted/10",
            SAVE_FRAME_PADDING_CLASS
          )}
        >
          <label className="text-xs font-medium text-muted-foreground" htmlFor="beeper-default-group">
            Default group
          </label>
          <select
            id="beeper-default-group"
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
            value={defaultGroupId || NO_GROUP_KEY}
            disabled={savingDefault}
            onChange={(e) => void handleDefaultChange(e.target.value)}
          >
            {groups.map((g) => (
              <option key={g._id} value={g._id}>
                {g.name}
              </option>
            ))}
            <option value={NO_GROUP_KEY}>— no group —</option>
          </select>
          {savingDefault && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>

        <div
          className={cn(
            "flex shrink-0 flex-wrap items-center gap-2 rounded-lg border bg-muted/10",
            SAVE_FRAME_PADDING_CLASS
          )}
        >
          <Input
            placeholder="New group name"
            className="h-8 w-[160px] text-sm"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreate();
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1"
            disabled={creating || !newName.trim()}
            onClick={() => void handleCreate()}
          >
            {creating ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add
          </Button>
        </div>

        <div className="flex-1 rounded-lg border bg-muted/10 p-3">
          {selected ? (
            <div className="flex max-w-[420px] flex-col gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-8"
                  aria-label="Group name"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleSave();
                  }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">ID</label>
                <Input value={selected._id} readOnly className="h-8 font-mono text-xs text-muted-foreground" />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="h-8 gap-1.5"
                  disabled={!dirty || saving || !editName.trim()}
                  onClick={() => void handleSave()}
                >
                  {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[120px] items-center justify-center text-sm text-muted-foreground">
              Select a group to see its details.
            </div>
          )}
        </div>
      </div>

      <BeeperGroupDeleteDialog
        open={deleteOpen}
        groupName={selected?.name}
        deleting={deleting}
        error={deleteError}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
      />
    </div>
  );
}
