"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import {
  FRAME_SECTION_GAP_CLASS,
  LIST_ROW_CLASS,
  LIST_ROW_WRAPPER_CLASS,
} from "@/components/shared/layout-tokens";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorBox } from "@/components/shared/error-box";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { PROMPT_KIND_OPTIONS, type AiPromptKind } from "@/components/msg-automation/prompt-form";

interface AiPromptSummary {
  id: string;
  slug: string;
  name: string;
  schoolId?: string;
  actionType: string;
  promptKind?: AiPromptKind;
  enabled?: boolean;
  tags?: string[];
  status: "draft" | "published" | "archived";
  version: number;
  provider: string;
  updatedAt: string;
}

const DELETE_CONFIRM_WORDS = ["DELETE", "CONFIRM", "CLEAR", "WYCZYSC", "USUN", "PERMANENT"];

function StatusBadge({ status }: { status: AiPromptSummary["status"] }) {
  if (status === "published") {
    return (
      <Badge className="border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
        Published
      </Badge>
    );
  }
  if (status === "archived") {
    return <Badge variant="outline">Archived</Badge>;
  }
  return <Badge variant="secondary">Draft</Badge>;
}

function promptKindLabel(kind: AiPromptKind | undefined): string {
  const k = kind === "openai_managed" ? "openai_managed" : "our_custom";
  return PROMPT_KIND_OPTIONS.find((o) => o.value === k)?.label ?? k;
}

export default function AiPromptsListPage() {
  const router = useRouter();
  const [prompts, setPrompts] = useState<AiPromptSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteWord, setDeleteWord] = useState("");
  const [deleteInput, setDeleteInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/msg-automation/ai-prompts");
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Failed to load prompts (${res.status})`);
      }
      setPrompts(Array.isArray(json.data) ? json.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selected = prompts.find((p) => p.id === selectedId) ?? null;

  const openDelete = () => {
    if (!selected) return;
    setDeleteWord(DELETE_CONFIRM_WORDS[Math.floor(Math.random() * DELETE_CONFIRM_WORDS.length)]);
    setDeleteInput("");
    setDeleteError(null);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!selected || deleteInput.trim() !== deleteWord) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/msg-automation/ai-prompts/${encodeURIComponent(selected.id)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Delete failed (${res.status})`);
      }
      setDeleteOpen(false);
      setSelectedId(null);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <DashboardPageShell
      title="AI Prompts"
      upLevel={{ href: "/dashboard/msg-automation", label: "Msg Auto" }}
      contentClassName={FRAME_SECTION_GAP_CLASS}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          className="gap-2 h-7 text-xs"
          onClick={() => router.push("/dashboard/forms?form=add_prompt")}
        >
          <Plus className="h-3 w-3" />
          Add
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 h-7 text-xs"
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            router.push(
              `/dashboard/forms?form=add_prompt&promptId=${encodeURIComponent(selected.id)}`
            );
          }}
        >
          <Save className="h-3 w-3" />
          Edit
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 h-7 text-xs"
          disabled={!selected}
          onClick={openDelete}
        >
          <Trash2 className="h-3 w-3" />
          Delete
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">{prompts.length} prompts</span>
      </div>

      <ErrorBox message={error} className="shrink-0" />

      <div className={cn(LIST_ROW_WRAPPER_CLASS, "min-h-0 flex-1 overflow-auto")}>
        {loading ? (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading prompts…
          </div>
        ) : prompts.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No prompts yet</div>
        ) : (
          <div className="divide-y">
            {prompts.map((p) => {
              const isSelected = p.id === selectedId;
              return (
                <button
                  type="button"
                  key={p.id}
                  data-testid="ai-prompt-row"
                  onClick={() => setSelectedId(p.id)}
                  onDoubleClick={() =>
                    router.push(
                      `/dashboard/forms?form=add_prompt&promptId=${encodeURIComponent(p.id)}`
                    )
                  }
                  className={cn(
                    "flex w-full items-center gap-3 text-left",
                    LIST_ROW_CLASS,
                    isSelected && "bg-accent"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{p.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {promptKindLabel(p.promptKind)} · {p.actionType}
                    </div>
                  </div>
                  <StatusBadge status={p.status} />
                  <span className="shrink-0 text-xs text-muted-foreground">v{p.version}</span>
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                    {p.enabled === false ? "Off" : "On"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={deleteOpen} onOpenChange={(open) => !deleting && setDeleteOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this prompt?</DialogTitle>
            <DialogDescription>
              Permanently removes <strong>{selected?.name}</strong> from the registry. Type{" "}
              <span className="font-mono font-bold">{deleteWord}</span> to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={deleteInput}
            onChange={(e) => setDeleteInput(e.target.value)}
            placeholder={deleteWord}
            autoFocus
          />
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting || deleteInput.trim() !== deleteWord}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardPageShell>
  );
}
