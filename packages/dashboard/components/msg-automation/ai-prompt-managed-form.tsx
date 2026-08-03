"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EditorPageShell } from "@/components/shared/editor-page-shell";
import { NavGroup } from "@/components/shared/nav-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Loader2 } from "lucide-react";
import { AiPromptDeleteDialog } from "@/components/msg-automation/ai-prompt-delete-dialog";
import { AiPromptConversationPanel } from "@/components/msg-automation/ai-prompt-conversation-panel";
import { aiPromptKindLabel, slugifyPromptName } from "@/components/msg-automation/ai-prompt-kind";

interface AiPromptManagedFormProps {
  promptId?: string;
}

const ACTION_TYPE_OPTIONS = [
  { value: "custom", label: "Custom" },
  { value: "conversation-health", label: "Conversation health" },
  { value: "capital", label: "Capital" },
  { value: "next-message", label: "Next message" },
  { value: "improve", label: "Improve" },
  { value: "full-analysis", label: "Full analysis" },
] as const;

export function AiPromptManagedForm({ promptId }: AiPromptManagedFormProps) {
  const router = useRouter();
  const isNew = !promptId;
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [savedPromptId, setSavedPromptId] = useState(promptId);

  const [name, setName] = useState(isNew ? "New prompt" : "");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [actionType, setActionType] = useState<string>("custom");
  const [schoolId, setSchoolId] = useState("");
  const [status, setStatus] = useState<"draft" | "published" | "archived">("draft");
  const [version, setVersion] = useState(1);
  const [openaiPromptId, setOpenaiPromptId] = useState("");
  const [openaiPromptVersion, setOpenaiPromptVersion] = useState("");
  const [summary, setSummary] = useState("auto");
  const [storeLogs, setStoreLogs] = useState(true);

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
        slug: string;
        description?: string;
        actionType: string;
        schoolId?: string;
        status: "draft" | "published" | "archived";
        version: number;
        providerBindings?: { openaiPromptId?: string; openaiPromptVersion?: string };
        settings?: { summary?: string; storeLogs?: boolean };
      };
      setName(p.name || "Untitled");
      setSlug(p.slug || "");
      setDescription(p.description || "");
      setActionType(p.actionType || "custom");
      setSchoolId(p.schoolId || "");
      setStatus(p.status);
      setVersion(p.version);
      setOpenaiPromptId(p.providerBindings?.openaiPromptId ?? "");
      setOpenaiPromptVersion(p.providerBindings?.openaiPromptVersion ?? "");
      setSummary(p.settings?.summary || "auto");
      setStoreLogs(p.settings?.storeLogs !== false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [promptId]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * `messages` is only included for a brand-new prompt (empty body — the
   * console-imported/managed pattern fills it separately, e.g. via the
   * import script's user-message template). On update it must be omitted
   * entirely, not sent as `[]` — `updateAiPrompt` only touches fields that
   * are present in the input, so omitting preserves whatever message
   * template the prompt already has instead of silently wiping it on every
   * metadata-only Save.
   */
  function buildPayload(isUpdate: boolean) {
    const idValue = openaiPromptId.trim();
    if (!idValue) throw new Error("Prompt ID is required");
    return {
      slug: slug.trim() || slugifyPromptName(name || idValue),
      name: (name || "Untitled OpenAI prompt").trim(),
      description: description.trim() || undefined,
      actionType,
      schoolId: schoolId.trim() || undefined,
      promptKind: "openai_managed" as const,
      provider: "openai" as const,
      ...(isUpdate ? {} : { messages: [] as Array<{ role: "user"; content: string }> }),
      settings: { summary, storeLogs },
      providerBindings: {
        openaiPromptId: idValue,
        openaiPromptVersion: openaiPromptVersion.trim() || undefined,
      },
    };
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        const payload = buildPayload(false);
        const res = await fetch("/api/msg-automation/ai-prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || "Save failed");
        setSavedPromptId(json.data.id);
        setStatus(json.data.status ?? status);
        setVersion(json.data.version ?? version);
        router.replace(`/dashboard/msg-automation/ai-prompts/${encodeURIComponent(json.data.id)}`);
      } else {
        const payload = buildPayload(true);
        const res = await fetch(`/api/msg-automation/ai-prompts/${encodeURIComponent(promptId!)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || "Save failed");
        setName(json.data.name ?? name);
        setStatus(json.data.status ?? status);
        setVersion(json.data.version ?? version);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!promptId) return;
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch(`/api/msg-automation/ai-prompts/${encodeURIComponent(promptId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish" }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Publish failed");
      setStatus(json.data.status ?? "published");
      setVersion(json.data.version ?? version);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
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
          {aiPromptKindLabel("openai_managed")}
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

      <Tabs defaultValue="conversation" className="flex min-h-0 flex-1 flex-col gap-0">
        <TabsList className="mx-2 mt-1.5 w-fit shrink-0">
          <TabsTrigger value="conversation">conversation</TabsTrigger>
          <TabsTrigger value="manage">manage</TabsTrigger>
        </TabsList>

        <TabsContent value="conversation" className="mt-0 flex min-h-0 flex-1 flex-col">
          <AiPromptConversationPanel promptId={savedPromptId} />
        </TabsContent>

        <TabsContent value="manage" className="mt-0 min-h-0 flex-1 overflow-y-auto p-6">
          <div className="mx-auto w-full max-w-xl space-y-4">
            <div className="rounded-2xl border bg-background p-5">
              <h2 className="text-lg font-semibold">Prompt metadata</h2>
              <div className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="managed-name">Name</Label>
                  <Input id="managed-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="managed-slug">Slug</Label>
                  <Input
                    id="managed-slug"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="auto-generated from name if left empty"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="managed-description">Description</Label>
                  <Textarea
                    id="managed-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="min-h-20"
                  />
                </div>
                <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                  <Label>Category</Label>
                  <Select value={actionType} onValueChange={setActionType}>
                    <SelectTrigger className="h-9 rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTION_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Label htmlFor="managed-school">School</Label>
                  <Input
                    id="managed-school"
                    value={schoolId}
                    onChange={(e) => setSchoolId(e.target.value)}
                    placeholder="(all schools)"
                  />
                  <Label>Provider</Label>
                  <Input value="openai" disabled className="bg-muted" />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-background p-5">
              <h2 className="text-lg font-semibold">openai published prompt</h2>
              <p className="mt-1 mb-5 text-sm text-muted-foreground">
                Enter only the values shown after publishing the prompt in OpenAI.
              </p>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="managed-prompt-id">OpenAI prompt ID</Label>
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
                  <Label htmlFor="managed-version">OpenAI prompt version</Label>
                  <Input
                    id="managed-version"
                    value={openaiPromptVersion}
                    onChange={(e) => setOpenaiPromptVersion(e.target.value)}
                    placeholder="1"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-background p-5">
              <h2 className="text-lg font-semibold">Settings</h2>
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                  <Label>Summary</Label>
                  <Select value={summary} onValueChange={setSummary}>
                    <SelectTrigger className="h-9 rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">auto</SelectItem>
                      <SelectItem value="none">none</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Store logs</span>
                  <Switch checked={storeLogs} onCheckedChange={setStoreLogs} />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-2xl border bg-background p-5">
              <div>
                <div className="text-sm font-semibold">Status</div>
                <span className="mt-1 inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                  {status === "published" ? `Published (v${version})` : status === "archived" ? "Archived" : "Draft"}
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={isNew || publishing || status === "archived"}
                onClick={() => void handlePublish()}
              >
                {publishing ? "Publishing…" : "Publish version"}
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

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
