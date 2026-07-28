"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { EditorPageShell } from "@/components/shared/editor-page-shell";
import { Loader2 } from "lucide-react";
import { AiPromptCustomEditor } from "@/components/msg-automation/ai-prompt-custom-editor";
import { AiPromptManagedForm } from "@/components/msg-automation/ai-prompt-managed-form";
import { normalizeAiPromptKind, type AiPromptKind } from "@/components/msg-automation/ai-prompt-kind";
import { ErrorBox } from "@/components/shared/error-box";

export default function AiPromptDetailPage() {
  const params = useParams<{ promptId: string }>();
  const promptId = params.promptId;
  const [kind, setKind] = useState<AiPromptKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/msg-automation/ai-prompts/${encodeURIComponent(promptId)}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Failed to load (${res.status})`);
      }
      setKind(normalizeAiPromptKind(json.data?.promptKind));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [promptId]);

  useEffect(() => {
    void load();
  }, [load]);

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

  if (error || !kind) {
    return (
      <EditorPageShell>
        <div className="p-4">
          <ErrorBox message={error || "Prompt not found"} />
        </div>
      </EditorPageShell>
    );
  }

  if (kind === "openai_managed") {
    return <AiPromptManagedForm promptId={promptId} />;
  }

  return <AiPromptCustomEditor promptId={promptId} />;
}
