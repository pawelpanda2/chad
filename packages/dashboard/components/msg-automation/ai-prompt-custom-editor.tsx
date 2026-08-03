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
import { AlertCircle, Loader2, Plus } from "lucide-react";
import { AiPromptDeleteDialog } from "@/components/msg-automation/ai-prompt-delete-dialog";
import { AiPromptWorkspace } from "@/components/msg-automation/ai-prompt-workspace";
import { slugifyPromptName } from "@/components/msg-automation/ai-prompt-kind";

interface VariableRow {
  key: string;
  label: string;
  required: boolean;
  description: string;
}

interface AiPromptCustomEditorProps {
  promptId?: string;
}

const HOSTED_TOOLS = [
  "MCP server",
  "File search",
  "Web search",
  "Image generation",
  "Tool search",
  "Code interpreter",
  "Hosted Shell",
] as const;

export function AiPromptCustomEditor({ promptId }: AiPromptCustomEditorProps) {
  const router = useRouter();
  const isNew = !promptId;
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [name, setName] = useState(isNew ? "New prompt" : "");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"draft" | "published" | "archived">("draft");
  const [promptBody, setPromptBody] = useState("");
  const [extraMessages, setExtraMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [model, setModel] = useState("gpt-5.5");
  const [textFormat, setTextFormat] = useState<"text" | "json_schema">("text");
  const [reasoningMode, setReasoningMode] = useState("standard");
  const [reasoningEffort, setReasoningEffort] = useState("medium");
  const [verbosity, setVerbosity] = useState("medium");
  const [summary, setSummary] = useState("auto");
  const [storeLogs, setStoreLogs] = useState(true);
  const [variables, setVariables] = useState<VariableRow[]>([]);
  const [tools, setTools] = useState<Record<string, boolean>>(
    Object.fromEntries(HOSTED_TOOLS.map((t) => [t, false]))
  );

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
        status: "draft" | "published" | "archived";
        messages?: Array<{ role: string; content: string }>;
        model?: string;
        settings?: {
          textFormat?: "text" | "json_schema";
          reasoningMode?: string;
          reasoningEffort?: string;
          verbosity?: string;
          summary?: string;
          storeLogs?: boolean;
        };
        variables?: VariableRow[];
      };
      setName(p.name);
      setSlug(p.slug);
      setDescription(p.description ?? "");
      setStatus(p.status);
      const msgs = p.messages ?? [];
      const primary =
        msgs.find((m) => m.role === "developer")?.content ||
        msgs.find((m) => m.role === "system")?.content ||
        msgs.find((m) => m.role === "user")?.content ||
        "";
      setPromptBody(primary);
      setExtraMessages(
        msgs.filter((m) => m.content !== primary).map((m) => ({ role: m.role, content: m.content }))
      );
      setModel(p.model || "gpt-5.5");
      setTextFormat(p.settings?.textFormat ?? "text");
      setReasoningMode(p.settings?.reasoningMode || "standard");
      setReasoningEffort(p.settings?.reasoningEffort || "medium");
      setVerbosity(p.settings?.verbosity || "medium");
      setSummary(p.settings?.summary || "auto");
      setStoreLogs(p.settings?.storeLogs !== false);
      setVariables(
        (p.variables ?? []).map((v) => ({
          key: v.key,
          label: v.label ?? "",
          required: Boolean(v.required),
          description: v.description ?? "",
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [promptId]);

  useEffect(() => {
    void load();
  }, [load]);

  function buildMessages() {
    const list: Array<{ role: "developer" | "system" | "user"; content: string }> = [];
    if (promptBody.trim()) list.push({ role: "developer", content: promptBody });
    for (const m of extraMessages) {
      if (!m.content.trim()) continue;
      const role = m.role === "system" || m.role === "user" ? m.role : "user";
      list.push({ role, content: m.content });
    }
    return list;
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const messages = buildMessages();
      if (!messages.some((m) => m.content.trim())) {
        throw new Error("Prompt content is required");
      }
      const nextSlug = slug.trim() || slugifyPromptName(name);
      const payload = {
        slug: nextSlug,
        name: name.trim() || "Untitled prompt",
        description: description.trim() || undefined,
        actionType: "custom" as const,
        promptKind: "our_custom" as const,
        provider: "openai" as const,
        model: model || undefined,
        messages,
        variables: variables
          .filter((v) => v.key.trim())
          .map((v) => ({
            key: v.key.trim(),
            label: v.label || undefined,
            required: v.required,
            description: v.description || undefined,
          })),
        settings: {
          textFormat,
          reasoningMode: reasoningMode || undefined,
          reasoningEffort: reasoningEffort || undefined,
          verbosity: verbosity || undefined,
          summary: summary || undefined,
          storeLogs,
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
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || "Save failed");
        setSlug(json.data.slug ?? nextSlug);
        setStatus(json.data.status ?? status);
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
          Loading prompt…
        </div>
      </EditorPageShell>
    );
  }

  const manageContent = (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">prompt settings</h2>
        <Button size="sm" className="h-8" onClick={() => void handleSave()} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      <div className="space-y-3 rounded-xl border p-4">
        <div className="text-sm font-semibold">Prompt</div>
        <div className="space-y-1.5">
          <Label htmlFor="custom-description">Description</Label>
          <Textarea
            id="custom-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-16 rounded-xl"
            placeholder="What this prompt is for"
          />
        </div>
        <Textarea
          value={promptBody}
          onChange={(e) => setPromptBody(e.target.value)}
          className="min-h-[160px] rounded-xl"
          placeholder="Describe desired model behavior (tone, tool usage, response style)"
        />
        <button
          type="button"
          className="flex w-full items-center justify-between py-1 text-left text-sm font-medium"
          onClick={() => setExtraMessages((prev) => [...prev, { role: "user", content: "" }])}
        >
          <span>Add messages to prompt</span>
          <Plus className="h-4 w-4" />
        </button>
        {extraMessages.map((m, i) => (
          <Textarea
            key={i}
            value={m.content}
            onChange={(e) =>
              setExtraMessages((prev) => prev.map((row, idx) => (idx === i ? { ...row, content: e.target.value } : row)))
            }
            className="min-h-20 rounded-xl"
            placeholder="Additional message"
          />
        ))}
      </div>

      <div className="space-y-3 rounded-xl border p-4">
        <div className="text-sm font-semibold">Model</div>
        <div className="grid grid-cols-[120px_1fr] items-center gap-2 text-sm">
          <Label>Model</Label>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger className="h-9 rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gpt-5.5">gpt-5.5</SelectItem>
              <SelectItem value="gpt-4o">gpt-4o</SelectItem>
              <SelectItem value="Provider default">Provider default</SelectItem>
            </SelectContent>
          </Select>
          <Label>Text format</Label>
          <Select value={textFormat} onValueChange={(v) => setTextFormat(v as "text" | "json_schema")}>
            <SelectTrigger className="h-9 rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">text</SelectItem>
              <SelectItem value="json_schema">json_schema</SelectItem>
            </SelectContent>
          </Select>
          <Label>Reasoning mode</Label>
          <Select value={reasoningMode} onValueChange={setReasoningMode}>
            <SelectTrigger className="h-9 rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">standard</SelectItem>
              <SelectItem value="minimal">minimal</SelectItem>
            </SelectContent>
          </Select>
          <Label>Reasoning effort</Label>
          <Select value={reasoningEffort} onValueChange={setReasoningEffort}>
            <SelectTrigger className="h-9 rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">low</SelectItem>
              <SelectItem value="medium">medium</SelectItem>
              <SelectItem value="high">high</SelectItem>
            </SelectContent>
          </Select>
          <Label>Verbosity</Label>
          <Select value={verbosity} onValueChange={setVerbosity}>
            <SelectTrigger className="h-9 rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">low</SelectItem>
              <SelectItem value="medium">medium</SelectItem>
              <SelectItem value="high">high</SelectItem>
            </SelectContent>
          </Select>
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
        <div className="flex items-center justify-between pt-1">
          <span className="text-sm">Store logs</span>
          <Switch checked={storeLogs} onCheckedChange={setStoreLogs} />
        </div>
      </div>

      <div className="space-y-3 rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Variables</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1"
            onClick={() => setVariables((prev) => [...prev, { key: "", label: "", required: false, description: "" }])}
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>
        {variables.map((v, i) => (
          <Input
            key={i}
            value={v.key}
            onChange={(e) =>
              setVariables((prev) => prev.map((row, idx) => (idx === i ? { ...row, key: e.target.value } : row)))
            }
            placeholder="variable_key"
            className="h-8 text-xs"
          />
        ))}
      </div>

      <div className="space-y-2 rounded-xl border p-4">
        <div className="text-sm font-semibold">Hosted tools</div>
        {HOSTED_TOOLS.map((tool) => (
          <div key={tool} className="flex items-center justify-between py-1 text-sm">
            <span>{tool}</span>
            <Switch
              checked={Boolean(tools[tool])}
              onCheckedChange={(checked) => setTools((prev) => ({ ...prev, [tool]: checked }))}
            />
          </div>
        ))}
      </div>

      {!isNew && (
        <div className="flex items-center justify-between rounded-xl border border-destructive/30 p-4">
          <div className="text-sm">
            <div className="font-semibold">Delete prompt</div>
            <div className="text-muted-foreground">This cannot be undone.</div>
          </div>
          <Button variant="outline" size="sm" className="h-8 text-destructive" onClick={() => setDeleteOpen(true)}>
            Delete
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <EditorPageShell>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-2 py-1.5 pl-14">
        <NavGroup upLevel={{ href: "/dashboard/msg-automation/ai-prompts", label: "AI Prompts" }} />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 max-w-xs border-0 bg-transparent px-1 text-sm font-semibold shadow-none focus-visible:ring-1"
            aria-label="Prompt name"
          />
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
            {status === "published" ? "Published" : status === "archived" ? "Archived" : "Draft"}
          </span>
        </div>
      </div>

      {error && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-destructive/5 px-3 py-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}

      <AiPromptWorkspace promptId={promptId} manageContent={manageContent} />

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
