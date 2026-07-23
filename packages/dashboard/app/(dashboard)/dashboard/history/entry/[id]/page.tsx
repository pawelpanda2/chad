"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { ErrorBox } from "@/components/shared/error-box";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface HistoryConfigOp {
  op: "add" | "remove" | "replace";
  path: string;
  oldValue?: unknown;
  newValue?: unknown;
}

interface HistoryBodyHunk {
  added: boolean;
  removed: boolean;
  value: string;
}

interface HistoryDetail {
  id: string;
  mutationId: string;
  sourceId: string;
  address: string;
  itemName: string;
  version: number;
  operationType: string;
  changedAt: string;
  actor: { username: string; repoGuid: string; kind: string };
  requestId: string | null;
  changedConfigPaths: string[];
  bodyChanged: boolean;
  hasSnapshot: boolean;
  changes: {
    config: HistoryConfigOp[];
    body: HistoryBodyHunk[] | null;
  };
  afterSnapshot: { config: Record<string, unknown>; body: string } | null;
}

function formatDiffValue(value: unknown): string {
  if (value === null || value === undefined) return "(none)";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

const OPERATION_LABEL: Record<string, string> = {
  insert: "Created",
  update: "Updated",
  delete: "Deleted",
  replace: "Updated",
};

/**
 * Separate History details route (Story 79 GUI rewrite) — replaces the old
 * inline accordion expansion. A real route (`/dashboard/history/entry/[id]`)
 * with a real back button (plus the browser's own Back, since this is a
 * genuine navigation, not client-side state), never a modal.
 */
export default function HistoryEntryDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<HistoryDetail | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    fetch(`/api/content-provider/history/${params.id}`)
      .then((res) => res.json())
      .then((json: { success: boolean; data?: HistoryDetail; error?: string }) => {
        if (!json.success || !json.data) throw new Error(json.error || "History entry not found");
        setDetail(json.data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unknown error"))
      .finally(() => setIsLoading(false));
  }, [params.id]);

  const handleBack = () => router.back();

  return (
    <DashboardPageShell upLevel={{ onClick: handleBack }} title="History Entry" contentClassName="gap-3">
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && <ErrorBox message={error} />}

      {!isLoading && detail && (
        <>
          <div className="border bg-muted/10 p-3 space-y-1.5 text-sm" data-testid="history-entry-summary">
            <div>
              <span className="text-muted-foreground">Date:</span>{" "}
              {new Date(detail.changedAt).toLocaleString()}
            </div>
            <div>
              <span className="text-muted-foreground">Operation:</span>{" "}
              {OPERATION_LABEL[detail.operationType] ?? detail.operationType}
            </div>
            <div>
              <span className="text-muted-foreground">Item:</span> {detail.itemName}
            </div>
            <div>
              <span className="text-muted-foreground">Address:</span>{" "}
              <span className="font-mono text-xs">{detail.address}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Actor:</span> {detail.actor.username}{" "}
              <span className="text-xs text-muted-foreground">({detail.actor.kind})</span>
            </div>
            <div>
              <span className="text-muted-foreground">Version:</span> {detail.version}
            </div>
          </div>

          {(detail.operationType === "insert" || detail.operationType === "delete") && !detail.afterSnapshot && (
            <div className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 rounded-md px-3 py-2">
              This event predates full before/after tracking — only the recorded field changes below are available,
              not a full snapshot.
            </div>
          )}

          {detail.changes.config.length > 0 && (
            <div className="border bg-muted/10 p-3">
              <div className="font-medium mb-2 text-sm">Config changes</div>
              <div className="space-y-1 text-xs font-mono">
                {detail.changes.config.map((op, i) => (
                  <div key={i}>
                    <span className="text-foreground">{op.path}</span>
                    {": "}
                    <span className="text-red-600 line-through">{formatDiffValue(op.oldValue)}</span>
                    {" → "}
                    <span className="text-green-700">{formatDiffValue(op.newValue)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {detail.changes.body && detail.changes.body.length > 0 && (
            <div className="border bg-muted/10 p-3">
              <div className="font-medium mb-2 text-sm">Body changes</div>
              <div className="font-mono text-xs whitespace-pre-wrap rounded border bg-background p-2">
                {detail.changes.body.map((hunk, i) => (
                  <div
                    key={i}
                    className={cn(
                      hunk.added && "text-green-700 bg-green-50 dark:bg-green-950/30",
                      hunk.removed && "text-red-600 bg-red-50 dark:bg-red-950/30 line-through"
                    )}
                  >
                    {hunk.added ? "+ " : hunk.removed ? "- " : "  "}
                    {hunk.value}
                  </div>
                ))}
              </div>
            </div>
          )}

          {detail.changes.config.length === 0 && !detail.changes.body?.length && (
            <div className="text-sm text-muted-foreground italic">No field changes recorded for this event.</div>
          )}

          {detail.afterSnapshot && (
            <div className="border bg-muted/10 p-3" data-testid="history-entry-snapshot">
              <div className="font-medium mb-2 text-sm">
                {detail.operationType === "delete" ? "Snapshot before delete" : "Snapshot"}
              </div>
              <details>
                <summary className="text-xs text-muted-foreground cursor-pointer">Raw config</summary>
                <pre className="text-xs font-mono whitespace-pre-wrap rounded border bg-background p-2 mt-1">
                  {JSON.stringify(detail.afterSnapshot.config, null, 2)}
                </pre>
              </details>
              {detail.afterSnapshot.body && (
                <details className="mt-2">
                  <summary className="text-xs text-muted-foreground cursor-pointer">Body</summary>
                  <pre className="text-xs font-mono whitespace-pre-wrap rounded border bg-background p-2 mt-1">
                    {detail.afterSnapshot.body}
                  </pre>
                </details>
              )}
            </div>
          )}
        </>
      )}
    </DashboardPageShell>
  );
}
