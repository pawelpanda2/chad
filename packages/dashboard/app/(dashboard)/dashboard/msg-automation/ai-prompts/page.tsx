"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { FRAME_SECTION_GAP_CLASS } from "@/components/shared/layout-tokens";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Loader2, Sparkles } from "lucide-react";

interface AiPromptSummary {
  id: string;
  slug: string;
  name: string;
  schoolId?: string;
  actionType: string;
  status: "draft" | "published" | "archived";
  version: number;
  provider: string;
  updatedAt: string;
}

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

export default function AiPromptsListPage() {
  const router = useRouter();
  const [prompts, setPrompts] = useState<AiPromptSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return prompts;
    return prompts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        (p.schoolId ?? "").toLowerCase().includes(q) ||
        p.actionType.toLowerCase().includes(q),
    );
  }, [prompts, search]);

  const toolbarSecondRow = (
    <>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search prompts..."
        className="h-9 w-full max-w-xs rounded-md border bg-background px-3 text-sm"
      />
      <Button size="sm" className="ml-auto" onClick={() => router.push("/dashboard/msg-automation/ai-prompts/new")}>
        New prompt
      </Button>
    </>
  );

  return (
    <DashboardPageShell
      title="AI Prompts"
      upLevel={{ href: "/dashboard/msg-automation", label: "Msg Auto" }}
      toolbarSecondRow={toolbarSecondRow}
      contentClassName={FRAME_SECTION_GAP_CLASS}
    >
      <p className="shrink-0 text-sm text-muted-foreground">
        Create, version and publish prompts used by Msg Auto (Message Creator and other actions).
      </p>

      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-muted/10">
        {loading ? (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading prompts…
          </div>
        ) : error ? (
          <div className="flex flex-col items-start gap-2 p-4 text-sm">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
            <button type="button" onClick={load} className="text-sm text-primary hover:underline">
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-start gap-2 p-6 text-sm text-muted-foreground">
            <Sparkles className="h-6 w-6 opacity-30" />
            {prompts.length === 0 ? "No prompts yet" : "No prompts match your search"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">School</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Version</th>
                  <th className="px-3 py-2">Provider</th>
                  <th className="px-3 py-2">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    className="cursor-pointer hover:bg-accent"
                    onClick={() => router.push(`/dashboard/msg-automation/ai-prompts/${encodeURIComponent(p.id)}`)}
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.actionType}</div>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{p.schoolId ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">v{p.version}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{p.provider}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {new Date(p.updatedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardPageShell>
  );
}
