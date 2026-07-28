"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EditorPageShell } from "@/components/shared/editor-page-shell";
import { NavGroup } from "@/components/shared/nav-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2 } from "lucide-react";
import { AiPromptDeleteDialog } from "@/components/msg-automation/ai-prompt-delete-dialog";
import { slugifyPromptName } from "@/components/msg-automation/ai-prompt-kind";

interface AiPromptManagedFormProps {
  promptId?: string;
}

export function AiPromptManagedForm({ promptId }: AiPromptManagedFormProps) {
  const router = useRouter();
  const isNew = !promptId;
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [name, setName] = useState(isNew ? "New prompt" : "");
  const [openaiPromptId, setOpenaiPromptId] = useState("");
  const [openaiPromptVersion, setOpenaiPromptVersion] = useState("");

  const load = useCallback(async () => {
    if (!promptId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/msg-automation/ai-prompts/${encodeURIComponent(promptId)}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load");
      const p = json.data as {
        name: string;
        providerBindings?: { openaiPromptId?: string; openaiPromptVersion?: string };
      };
      setName(p.name || "Untitled");
      setOpenaiPromptId(p.providerBindings?.openaiPromptId ?? "");
      setOpenaiPromptVersion(p.providerBindings?.openaiPromptVersion ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [promptId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const idValue = openaiPromptId.trim();
      if (!idValue) throw new Error("Prompt ID is required");
      const payload = {
        slug: slugifyPromptName(name || idValue),
        name: (name || "OpenAI Managed Prompt").trim(),
        actionType: "custom" as const,
        promptKind: "openai_managed" as const,
        provider: "openai" as const,
        messages: [] as Array<{ role: "user"; content: string }>,
        providerBindings: {
          openaiPromptId: idValue,
          openaiPromptVersion: openaiPromptVersion.trim() || undefined,
        },
      };
      if (isNew) {
        const res = await fetch("/api/msg-automation/ai-prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || "Save failed");
        router.replace(`/dashboard/msg-automation/ai-prompts/${encodeURIComponent(json.data.id)}`);
      } else {
        const res = await fetch(`/api/msg-automation/ai-prompts/${encodeURIComponent(promptId!)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            promptKind: "openai_managed",
            providerBindings: {
              openaiPromptId: idValue,
              openaiPromptVersion: openaiPromptVersion.trim() || undefined,
            },
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || "Save failed");
        setName(json.data.name ?? name);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!promptId) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/msg-automation/ai-prompts/${encodeURIComponent(promptId)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Delete failed");
      setDeleteOpen(false);
      router.push("/dashboard/msg-automation/ai-prompts");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <EditorPageShell>
        <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      </EditorPageShell>
    );
  }

  return (
    <EditorPageShell>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-2 py-1.5 pl-14">
        <NavGroup upLevel={{ href: "/dashboard/msg-automation/ai-prompts", label: "AI Prompts" }} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{name || "New prompt"}</h1>
        </div>
        <span className="hidden rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800 sm:inline dark:bg-blue-950/40 dark:text-blue-200">
          OpenAI Managed Prompt
        </span>
        {!isNew && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            Delete
          </Button>
        )}
        <Button size="sm" className="h-8" onClick={() => void handleSave()} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      {error && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-destructive/5 px-3 py-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}

      <div className="mx-auto w-full max-w-xl flex-1 overflow-y-auto p-6">
        <div className="rounded-2xl border bg-background p-5">
          <h2 className="text-lg font-semibold">OpenAI published prompt</h2>
          <p className="mt-1 mb-5 text-sm text-muted-foreground">
            Enter only the values shown after publishing the prompt in OpenAI.
          </p>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="managed-prompt-id">Prompt ID</Label>
              <div className="flex gap-2">
                <Input
                  id="managed-prompt-id"
                  value={openaiPromptId}
                  onChange={(e) => setOpenaiPromptId(e.target.value)}
                  placeholder="pmpt_…"
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void navigator.clipboard?.writeText(openaiPromptId)}
                  disabled={!openaiPromptId}
                >
                  Copy
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="managed-version">Version</Label>
              <Input
                id="managed-version"
                value={openaiPromptVersion}
                onChange={(e) => setOpenaiPromptVersion(e.target.value)}
                placeholder="1"
              />
            </div>
          </div>
        </div>
      </div>

      <AiPromptDeleteDialog
        open={deleteOpen}
        promptName={name}
        deleting={deleting}
        error={deleteError}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
      />
    </EditorPageShell>
  );
}
