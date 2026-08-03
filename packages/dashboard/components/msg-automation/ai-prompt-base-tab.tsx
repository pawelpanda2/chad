"use client";

import { Loader2 } from "lucide-react";

interface AiPromptBaseTabProps {
  finalPrompt: string;
  loading: boolean;
}

/**
 * AI Prompts → editor workspace, "base" tab: the exact, full final prompt
 * that Send will submit — never a JSON dump or a shortened summary. Built
 * exclusively by `dba`'s `buildLeadAnalysisCurrentCase` /
 * `appendAdditionalUserInput` via the `lead-context/preview` endpoint
 * (`AiPromptWorkspace`), so this text always matches the real request byte
 * for byte. Only rendered once a lead is selected (base/auto stay locked
 * until then) — the parent gates that, not this component.
 */
export function AiPromptBaseTab({ finalPrompt, loading }: AiPromptBaseTabProps) {
  return (
    <div className="space-y-2">
      <div>
        <h2 className="text-base font-semibold">final prompt</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          The full prompt sent to OpenAI — including any additional text typed on the right.
        </p>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-1.5 text-xs font-semibold">
          <span>request preview</span>
          {loading && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              live preview
            </span>
          )}
        </div>
        <pre className="max-h-[calc(100vh-320px)] overflow-y-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed">
          {finalPrompt || "…"}
        </pre>
      </div>
    </div>
  );
}
