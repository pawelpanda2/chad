"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { FRAME_SECTION_GAP_CLASS } from "@/components/shared/layout-tokens";
import { Button } from "@/components/ui/button";
import { ErrorBox } from "@/components/shared/error-box";
import { cn } from "@/lib/utils";
import { Loader2, Plus } from "lucide-react";
import {
  aiPromptKindLabel,
  normalizeAiPromptKind,
  type AiPromptKind,
} from "@/components/msg-automation/ai-prompt-kind";

interface AiPromptSummary {
  id: string;
  slug: string;
  name: string;
  description?: string;
  promptKind?: AiPromptKind | string;
  version: number;
}

/**
 * Fixed column widths so header cells and row cells share the same left edges.
 * Last cell is an empty flex spacer (no chevron). Left-packed, phone-friendly.
 */
const ROW = "flex w-full items-stretch text-left";

const VER_CELL =
  "flex w-12 shrink-0 items-center border-border border-r px-[3px] py-[1px]";

const NAME_CELL =
  "flex w-[9.5rem] shrink-0 items-center border-border border-r px-[3px] py-[1px] sm:w-[14rem]";

const CATEGORY_CELL =
  "flex w-[10.75rem] shrink-0 items-center border-border border-r px-[3px] py-[1px] sm:w-[12.5rem]";

const DESCRIPTION_CELL =
  "flex w-[8rem] shrink-0 items-center border-border border-r px-[3px] py-[1px] sm:w-[12rem]";

const SPACER_CELL = "min-w-0 flex-1";

export default function AiPromptsListPage() {
  const router = useRouter();
  const [prompts, setPrompts] = useState<AiPromptSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const openPrompt = (p: AiPromptSummary) => {
    router.push(`/dashboard/msg-automation/ai-prompts/${encodeURIComponent(p.id)}`);
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
          className="h-7 gap-2 text-xs"
          onClick={() => router.push("/dashboard/msg-automation/ai-prompts/new")}
        >
          <Plus className="h-3 w-3" />
          Add
        </Button>
      </div>

      <ErrorBox message={error} className="shrink-0" />

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-muted/10 px-[3px] py-[2px]">
        {loading ? (
          <div className="flex items-center gap-2 px-[3px] py-[2px] text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading prompts…
          </div>
        ) : prompts.length === 0 ? (
          <div className="px-[3px] py-[2px] text-sm text-muted-foreground">No prompts yet</div>
        ) : (
          <div className="space-y-px">
            {/* Transparent border matches row box model so columns line up. */}
            <div
              className={cn(
                ROW,
                "rounded-xl border border-transparent text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              )}
            >
              <div className={VER_CELL}>Ver.</div>
              <div className={NAME_CELL}>Name</div>
              <div className={CATEGORY_CELL}>Category</div>
              <div className={DESCRIPTION_CELL}>Description</div>
              <div className={SPACER_CELL} aria-hidden />
            </div>
            {prompts.map((p) => {
              const kind = normalizeAiPromptKind(p.promptKind);
              const category = aiPromptKindLabel(kind);
              return (
                <button
                  type="button"
                  key={p.id}
                  data-testid="ai-prompt-row"
                  data-prompt-kind={kind}
                  onClick={() => openPrompt(p)}
                  className={cn(
                    ROW,
                    "rounded-xl border border-border bg-background transition-colors hover:bg-accent/60"
                  )}
                >
                  <div className={cn(VER_CELL, "font-semibold text-muted-foreground")}>
                    v{p.version}
                  </div>
                  <div className={NAME_CELL}>
                    <span className="w-full truncate text-sm font-semibold">{p.name}</span>
                  </div>
                  <div className={CATEGORY_CELL}>
                    <span
                      className={cn(
                        "inline-flex max-w-full truncate rounded-full px-[3px] py-0 text-xs font-semibold",
                        kind === "openai_managed"
                          ? "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200"
                          : "bg-violet-50 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200"
                      )}
                    >
                      {category}
                    </span>
                  </div>
                  <div className={DESCRIPTION_CELL}>
                    <span className="w-full truncate text-xs text-muted-foreground">
                      {p.description?.trim() || ""}
                    </span>
                  </div>
                  <div className={SPACER_CELL} aria-hidden />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </DashboardPageShell>
  );
}
