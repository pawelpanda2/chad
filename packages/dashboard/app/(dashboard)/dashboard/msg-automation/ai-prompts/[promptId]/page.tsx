"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { EditorPageShell } from "@/components/shared/editor-page-shell";
import { NavGroup } from "@/components/shared/nav-group";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Loader2, Plus, Trash2 } from "lucide-react";

type AiProvider = "openai" | "anthropic" | "gemini" | "openai-compatible";
type AiPromptStatus = "draft" | "published" | "archived";
type AiPromptActionType =
  | "conversation-health"
  | "capital"
  | "next-message"
  | "improve"
  | "full-analysis"
  | "custom";

interface AiPromptVariableRow {
  key: string;
  label: string;
  required: boolean;
  description: string;
}

interface AiPromptMessage {
  role: "developer" | "system" | "user";
  content: string;
}

interface AiPromptDefinition {
  id: string;
  slug: string;
  name: string;
  description?: string;
  schoolId?: string;
  actionType: AiPromptActionType;
  status: AiPromptStatus;
  version: number;
  publishedVersion?: number;
  publishedSnapshot?: { version: number };
  messages: AiPromptMessage[];
  variables: AiPromptVariableRow[];
  provider: AiProvider;
  model?: string;
  settings?: {
    textFormat?: "text" | "json_schema";
    reasoningMode?: string;
    reasoningEffort?: string;
    verbosity?: string;
    summary?: string;
    outputSchema?: unknown;
  };
  providerBindings?: { openaiPromptId?: string; openaiPromptVersion?: string };
  updatedAt: string;
}

const ACTION_TYPES: AiPromptActionType[] = [
  "conversation-health",
  "capital",
  "next-message",
  "improve",
  "full-analysis",
  "custom",
];
const PROVIDERS: AiProvider[] = ["openai", "anthropic", "gemini", "openai-compatible"];

function messageContent(messages: AiPromptMessage[], role: AiPromptMessage["role"]): string {
  return messages.find((m) => m.role === role)?.content ?? "";
}

function StatusBadge({ status }: { status: AiPromptStatus }) {
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

export default function AiPromptEditorPage() {
  const router = useRouter();
  const params = useParams<{ promptId: string }>();
  const promptId = params.promptId;
  const isNew = promptId === "new";

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [existing, setExisting] = useState<AiPromptDefinition | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [actionType, setActionType] = useState<AiPromptActionType>("next-message");
  const [provider, setProvider] = useState<AiProvider>("openai");
  const [model, setModel] = useState("");
  const [developerInstructions, setDeveloperInstructions] = useState("");
  const [systemInstructions, setSystemInstructions] = useState("");
  const [userPromptTemplate, setUserPromptTemplate] = useState("");
  const [variables, setVariables] = useState<AiPromptVariableRow[]>([]);
  const [textFormat, setTextFormat] = useState<"text" | "json_schema">("text");
  const [reasoningMode, setReasoningMode] = useState("");
  const [reasoningEffort, setReasoningEffort] = useState("");
  const [verbosity, setVerbosity] = useState("");
  const [summary, setSummary] = useState("");
  const [outputSchemaText, setOutputSchemaText] = useState("");
  const [openaiPromptId, setOpenaiPromptId] = useState("");
  const [openaiPromptVersion, setOpenaiPromptVersion] = useState("");

  const applyDefinition = useCallback((p: AiPromptDefinition) => {
    setExisting(p);
    setName(p.name);
    setSlug(p.slug);
    setDescription(p.description ?? "");
    setSchoolId(p.schoolId ?? "");
    setActionType(p.actionType);
    setProvider(p.provider);
    setModel(p.model ?? "");
    setDeveloperInstructions(messageContent(p.messages, "developer"));
    setSystemInstructions(messageContent(p.messages, "system"));
    setUserPromptTemplate(messageContent(p.messages, "user"));
    setVariables(p.variables ?? []);
    setTextFormat(p.settings?.textFormat ?? "text");
    setReasoningMode(p.settings?.reasoningMode ?? "");
    setReasoningEffort(p.settings?.reasoningEffort ?? "");
    setVerbosity(p.settings?.verbosity ?? "");
    setSummary(p.settings?.summary ?? "");
    setOutputSchemaText(
      p.settings?.outputSchema !== undefined ? JSON.stringify(p.settings.outputSchema, null, 2) : "",
    );
    setOpenaiPromptId(p.providerBindings?.openaiPromptId ?? "");
    setOpenaiPromptVersion(p.providerBindings?.openaiPromptVersion ?? "");
  }, []);

  const load = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/msg-automation/ai-prompts/${encodeURIComponent(promptId)}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Failed to load prompt (${res.status})`);
      }
      applyDefinition(json.data as AiPromptDefinition);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [isNew, promptId, applyDefinition]);

  useEffect(() => {
    load();
  }, [load]);

  function buildMessages(): AiPromptMessage[] {
    const list: AiPromptMessage[] = [];
    if (developerInstructions.trim()) list.push({ role: "developer", content: developerInstructions });
    if (systemInstructions.trim()) list.push({ role: "system", content: systemInstructions });
    if (userPromptTemplate.trim()) list.push({ role: "user", content: userPromptTemplate });
    return list;
  }

  function buildSettings() {
    let outputSchema: unknown;
    if (textFormat === "json_schema" && outputSchemaText.trim()) {
      outputSchema = JSON.parse(outputSchemaText); // throws → caught by caller, surfaced as an error
    }
    const settings = {
      textFormat,
      reasoningMode: reasoningMode || undefined,
      reasoningEffort: reasoningEffort || undefined,
      verbosity: verbosity || undefined,
      summary: summary || undefined,
      outputSchema,
    };
    return settings;
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      let settings;
      try {
        settings = buildSettings();
      } catch {
        throw new Error("Expected output schema is not valid JSON");
      }
      const cleanVariables = variables
        .filter((v) => v.key.trim())
        .map((v) => ({ key: v.key.trim(), label: v.label || undefined, required: v.required, description: v.description || undefined }));
      const providerBindings =
        openaiPromptId.trim() || openaiPromptVersion.trim()
          ? { openaiPromptId: openaiPromptId.trim() || undefined, openaiPromptVersion: openaiPromptVersion.trim() || undefined }
          : undefined;

      const body = {
        slug,
        name,
        description: description || undefined,
        schoolId: schoolId || undefined,
        actionType,
        provider,
        model: model || undefined,
        messages: buildMessages(),
        variables: cleanVariables,
        settings,
        providerBindings,
      };

      if (isNew) {
        const res = await fetch("/api/msg-automation/ai-prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || "Save failed");
        router.replace(`/dashboard/msg-automation/ai-prompts/${encodeURIComponent(json.data.id)}`);
        applyDefinition(json.data as AiPromptDefinition);
      } else {
        const res = await fetch(`/api/msg-automation/ai-prompts/${encodeURIComponent(promptId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || "Save failed");
        applyDefinition(json.data as AiPromptDefinition);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (isNew) return;
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
      applyDefinition(json.data as AiPromptDefinition);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  }

  async function handleArchive() {
    if (isNew) return;
    setError(null);
    try {
      const res = await fetch(`/api/msg-automation/ai-prompts/${encodeURIComponent(promptId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive" }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Archive failed");
      applyDefinition(json.data as AiPromptDefinition);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const requestPreview = useMemo(() => {
    return JSON.stringify(
      {
        slug: slug || "(unset)",
        actionType,
        provider,
        model: model || "(provider default)",
        messages: buildMessages(),
        settings: {
          textFormat,
          reasoningMode: reasoningMode || undefined,
          reasoningEffort: reasoningEffort || undefined,
          verbosity: verbosity || undefined,
          summary: summary || undefined,
        },
        providerBindings:
          openaiPromptId || openaiPromptVersion
            ? { openaiPromptId: openaiPromptId || undefined, openaiPromptVersion: openaiPromptVersion || undefined }
            : undefined,
        variables: variables.filter((v) => v.key.trim()).map((v) => v.key),
      },
      null,
      2,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    slug,
    actionType,
    provider,
    model,
    developerInstructions,
    systemInstructions,
    userPromptTemplate,
    textFormat,
    reasoningMode,
    reasoningEffort,
    verbosity,
    summary,
    openaiPromptId,
    openaiPromptVersion,
    variables,
  ]);

  function updateVariable(index: number, patch: Partial<AiPromptVariableRow>) {
    setVariables((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)));
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

  return (
    <EditorPageShell>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-2 py-1.5 pl-14">
        <NavGroup upLevel={{ href: "/dashboard/msg-automation/ai-prompts", label: "AI Prompts" }} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{isNew ? "New prompt" : name || "Untitled prompt"}</h1>
        </div>
        <StatusBadge status={existing?.status ?? "draft"} />
        {!isNew && (
          <Button variant="outline" size="sm" className="h-8" onClick={handleArchive} disabled={existing?.status === "archived"}>
            Archive
          </Button>
        )}
        {!isNew && (
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={handlePublish}
            disabled={publishing || existing?.status === "archived"}
            title="Publishes the current draft as the new live version"
          >
            {publishing ? "Publishing…" : "Publish version"}
          </Button>
        )}
        <Button size="sm" className="h-8" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      {error && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-destructive/5 px-3 py-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,480px)_minmax(0,1fr)]">
        {/* Left pane — Prompt configuration, own scrollbar */}
        <div className="min-h-0 space-y-5 overflow-y-auto border-b p-4 md:border-b-0 md:border-r">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Metadata</h2>
            <div className="space-y-1.5">
              <Label htmlFor="ap-name">Name</Label>
              <Input id="ap-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Next Message — SD-PL" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ap-slug">Slug / stable id</Label>
              <Input id="ap-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="sd-pl-next-message" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ap-description">Description</Label>
              <Textarea id="ap-description" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-16" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ap-school">School</Label>
                <Input id="ap-school" value={schoolId} onChange={(e) => setSchoolId(e.target.value)} placeholder="sd-pl" />
              </div>
              <div className="space-y-1.5">
                <Label>Action type</Label>
                <Select value={actionType} onValueChange={(v) => setActionType(v as AiPromptActionType)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTION_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section className="space-y-3 border-t pt-4">
            <h2 className="text-sm font-semibold">Prompt</h2>
            <div className="space-y-1.5">
              <Label htmlFor="ap-developer">Developer instructions</Label>
              <Textarea
                id="ap-developer"
                value={developerInstructions}
                onChange={(e) => setDeveloperInstructions(e.target.value)}
                className="min-h-24"
                placeholder="Describe desired model behavior (tone, tool usage, response style)"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ap-system">System instructions (optional)</Label>
              <Textarea id="ap-system" value={systemInstructions} onChange={(e) => setSystemInstructions(e.target.value)} className="min-h-16" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ap-user">User prompt template</Label>
              <Textarea
                id="ap-user"
                value={userPromptTemplate}
                onChange={(e) => setUserPromptTemplate(e.target.value)}
                className="min-h-28"
                placeholder="Use {{variable}} placeholders, e.g. {{conversation}}, {{school_name}}"
              />
            </div>
          </section>

          <section className="space-y-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Variables</h2>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2"
                onClick={() => setVariables((prev) => [...prev, { key: "", label: "", required: false, description: "" }])}
              >
                <Plus className="h-3.5 w-3.5" />
                Add variable
              </Button>
            </div>
            {variables.length === 0 ? (
              <p className="text-xs text-muted-foreground">No variables defined.</p>
            ) : (
              <div className="space-y-2">
                {variables.map((v, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-md border p-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={v.key}
                        onChange={(e) => updateVariable(i, { key: e.target.value })}
                        placeholder="key (e.g. conversation)"
                        className="h-8 text-xs"
                      />
                      <Input
                        value={v.label}
                        onChange={(e) => updateVariable(i, { label: e.target.value })}
                        placeholder="label (optional)"
                        className="h-8 text-xs"
                      />
                      <label className="col-span-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <input type="checkbox" checked={v.required} onChange={(e) => updateVariable(i, { required: e.target.checked })} />
                        Required
                      </label>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-destructive"
                      onClick={() => setVariables((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3 border-t pt-4">
            <h2 className="text-sm font-semibold">Model</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Provider</Label>
                <Select value={provider} onValueChange={(v) => setProvider(v as AiProvider)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ap-model">Model</Label>
                <Input id="ap-model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4o" />
              </div>
              <div className="space-y-1.5">
                <Label>Text format</Label>
                <Select value={textFormat} onValueChange={(v) => setTextFormat(v as "text" | "json_schema")}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">text</SelectItem>
                    <SelectItem value="json_schema">json_schema</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ap-reasoning-mode">Reasoning mode</Label>
                <Input id="ap-reasoning-mode" value={reasoningMode} onChange={(e) => setReasoningMode(e.target.value)} placeholder="standard" />
              </div>
              <div className="space-y-1.5">
                <Label>Reasoning effort</Label>
                <Select value={reasoningEffort || "__unset__"} onValueChange={(v) => setReasoningEffort(v === "__unset__" ? "" : v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unset__">(unset)</SelectItem>
                    <SelectItem value="low">low</SelectItem>
                    <SelectItem value="medium">medium</SelectItem>
                    <SelectItem value="high">high</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Verbosity</Label>
                <Select value={verbosity || "__unset__"} onValueChange={(v) => setVerbosity(v === "__unset__" ? "" : v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unset__">(unset)</SelectItem>
                    <SelectItem value="low">low</SelectItem>
                    <SelectItem value="medium">medium</SelectItem>
                    <SelectItem value="high">high</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Summary</Label>
                <Select value={summary || "__unset__"} onValueChange={(v) => setSummary(v === "__unset__" ? "" : v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unset__">(unset)</SelectItem>
                    <SelectItem value="auto">auto</SelectItem>
                    <SelectItem value="concise">concise</SelectItem>
                    <SelectItem value="detailed">detailed</SelectItem>
                    <SelectItem value="none">none</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {textFormat === "json_schema" && (
              <div className="space-y-1.5">
                <Label htmlFor="ap-schema">Expected output schema (JSON)</Label>
                <Textarea
                  id="ap-schema"
                  value={outputSchemaText}
                  onChange={(e) => setOutputSchemaText(e.target.value)}
                  className="min-h-24 font-mono text-xs"
                  placeholder='{ "type": "object", "properties": { ... } }'
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ap-openai-id">OpenAI stored prompt id (optional)</Label>
                <Input id="ap-openai-id" value={openaiPromptId} onChange={(e) => setOpenaiPromptId(e.target.value)} placeholder="pmpt_..." />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ap-openai-version">Version (optional)</Label>
                <Input id="ap-openai-version" value={openaiPromptVersion} onChange={(e) => setOpenaiPromptVersion(e.target.value)} placeholder="1" />
              </div>
            </div>
          </section>
        </div>

        {/* Right pane — request preview, own scrollbar. Static preview only:
            no request is ever sent from this editor (input §11). */}
        <div className="min-h-0 overflow-y-auto p-4">
          <h2 className="mb-2 text-sm font-semibold">Request preview</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            This is what the provider adapter will send when this prompt runs — nothing is sent from here.
          </p>
          <pre className="overflow-x-auto rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed">{requestPreview}</pre>
          {existing?.publishedSnapshot && (
            <p className="mt-3 text-xs text-muted-foreground">
              Live version: v{existing.publishedVersion}. Message Creator uses this published snapshot, not
              unsaved draft edits above.
            </p>
          )}
        </div>
      </div>
    </EditorPageShell>
  );
}
