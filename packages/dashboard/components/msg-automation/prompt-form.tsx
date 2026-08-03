"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorBox } from "@/components/shared/error-box";
import {
  FRAME_SECTION_GAP_CLASS,
  FRAME_SECTION_SPACE_Y_CLASS,
  SAVE_FRAME_PADDING_CLASS,
} from "@/components/shared/layout-tokens";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertCircle } from "lucide-react";
import {
  type AiPromptKind,
  AI_PROMPT_KIND_OPTIONS,
  slugifyPromptName,
} from "@/components/msg-automation/ai-prompt-kind";

export type { AiPromptKind };
export { slugifyPromptName };
export const PROMPT_KIND_OPTIONS = AI_PROMPT_KIND_OPTIONS.map(({ value, label }) => ({
  value,
  label,
}));

/** Category — for now a single Msg Creator option (our custom prompt only). */
export const PROMPT_CATEGORY_OPTIONS = [
  { value: "custom", label: "Msg Creator" },
] as const;

export interface PromptFormState {
  name: string;
  promptKind: AiPromptKind;
  category: string;
  openaiPromptId: string;
  slug: string;
}

const EMPTY: PromptFormState = {
  name: "",
  promptKind: "our_custom",
  category: "custom",
  openaiPromptId: "",
  slug: "",
};

interface PromptFormProps {
  /** When set, form loads and PATCHes this prompt id. */
  promptId?: string | null;
  /** Where to go after successful save / back. */
  returnTo?: string;
  title?: string;
}

/**
 * Add/Edit prompt form — same table layout as Add Daily Entry.
 * Prompt type is a combobox (no type-picker cards / captions).
 */
export function PromptForm({
  promptId,
  returnTo = "/dashboard/msg-automation/ai-prompts",
  title,
}: PromptFormProps) {
  const router = useRouter();
  const isEdit = Boolean(promptId);
  const [state, setState] = useState<PromptFormState>(EMPTY);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const load = useCallback(async () => {
    if (!promptId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/msg-automation/ai-prompts/${encodeURIComponent(promptId)}`);
      const json = await res.json();
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error || `Failed to load (${res.status})`);
      }
      const p = json.data as {
        name: string;
        promptKind?: AiPromptKind | "chad_custom";
        actionType: string;
        providerBindings?: { openaiPromptId?: string };
        slug: string;
      };
      setState({
        name: p.name ?? "",
        promptKind: p.promptKind === "openai_managed" ? "openai_managed" : "our_custom",
        category: p.actionType || "custom",
        openaiPromptId: p.providerBindings?.openaiPromptId ?? "",
        slug: p.slug ?? "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [promptId]);

  useEffect(() => {
    load();
  }, [load]);

  const setField = <K extends keyof PromptFormState>(key: K, value: PromptFormState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setResult(null);
    setError(null);
    try {
      const slug = state.slug.trim() || slugifyPromptName(state.name);
      const category =
        state.promptKind === "our_custom"
          ? PROMPT_CATEGORY_OPTIONS.some((o) => o.value === state.category)
            ? state.category
            : PROMPT_CATEGORY_OPTIONS[0].value
          : "custom";
      const providerBindings =
        state.promptKind === "openai_managed"
          ? { openaiPromptId: state.openaiPromptId.trim() }
          : undefined;

      const payload = {
        slug,
        name: state.name.trim(),
        actionType: category,
        promptKind: state.promptKind,
        provider: "openai" as const,
        // Body is edited in the rich custom editor — form only creates metadata.
        messages: [] as Array<{ role: "user"; content: string }>,
        providerBindings,
      };

      const res = await fetch(
        isEdit
          ? `/api/msg-automation/ai-prompts/${encodeURIComponent(promptId!)}`
          : "/api/msg-automation/ai-prompts",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Save failed (${res.status})`);
      }
      setResult({ type: "success", message: isEdit ? "Saved" : "Created" });
      if (!isEdit) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        router.push(returnTo);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setResult({ type: "error", message });
    } finally {
      setSaving(false);
    }
  };

  // Same layout as Add Daily Entry; dashboard-neutral cells (no amber / grey fills).
  const fieldCell = "border bg-background px-2 py-1.5";
  const labelCell = "whitespace-nowrap border bg-background px-3 py-2 font-semibold";

  return (
    <form onSubmit={handleSubmit} className={cn(FRAME_SECTION_SPACE_Y_CLASS, FRAME_SECTION_GAP_CLASS)}>
      <div
        className={cn(
          "flex flex-wrap items-center gap-3 max-w-[500px] rounded-lg border bg-muted/10",
          SAVE_FRAME_PADDING_CLASS
        )}
      >
        <Button type="submit" disabled={saving || loading}>
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push(returnTo)}>
          Full View
        </Button>
        <Input
          value={state.name}
          readOnly
          tabIndex={-1}
          aria-label="Prompt name"
          placeholder="Name"
          className="h-9 min-w-[140px] flex-1 bg-muted font-mono"
        />
        {loading && <span className="text-sm text-muted-foreground">Loading…</span>}
        {result && (
          <span
            className={`flex items-center gap-1 text-sm ${
              result.type === "success" ? "text-green-600" : "text-red-600"
            }`}
          >
            {result.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
            )}
            {result.message}
          </span>
        )}
      </div>

      {error && <ErrorBox message={error} />}

      <div className="max-w-[460px] rounded-lg border bg-muted/10 p-2">
        <table className="w-full border-collapse text-sm">
          <tbody>
            <tr>
              <td className={labelCell}>Name</td>
              <td className={fieldCell}>
                <Input
                  value={state.name}
                  onChange={(e) => setField("name", e.target.value)}
                  disabled={loading}
                  required
                  className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-1"
                />
              </td>
            </tr>
            <tr>
              <td className={labelCell}>Prompt type</td>
              <td className={fieldCell}>
                <select
                  value={state.promptKind}
                  onChange={(e) => setField("promptKind", e.target.value as AiPromptKind)}
                  disabled={loading}
                  className="h-8 w-full border-0 bg-transparent text-sm focus:outline-none focus:ring-1"
                  aria-label="Prompt type"
                >
                  {PROMPT_KIND_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
            {state.promptKind === "our_custom" && (
              <tr>
                <td className={labelCell}>Category</td>
                <td className={fieldCell}>
                  <select
                    value={
                      PROMPT_CATEGORY_OPTIONS.some((o) => o.value === state.category)
                        ? state.category
                        : PROMPT_CATEGORY_OPTIONS[0].value
                    }
                    onChange={(e) => setField("category", e.target.value)}
                    disabled={loading}
                    className="h-8 w-full border-0 bg-transparent text-sm focus:outline-none focus:ring-1"
                    aria-label="Category"
                  >
                    {PROMPT_CATEGORY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            )}
            {state.promptKind === "openai_managed" && (
              <tr>
                <td className={labelCell}>Prompt ID</td>
                <td className={fieldCell}>
                  <Input
                    value={state.openaiPromptId}
                    onChange={(e) => setField("openaiPromptId", e.target.value)}
                    disabled={loading}
                    required
                    className="h-8 border-0 bg-transparent shadow-none font-mono focus-visible:ring-1"
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {title ? <span className="sr-only">{title}</span> : null}
    </form>
  );
}
