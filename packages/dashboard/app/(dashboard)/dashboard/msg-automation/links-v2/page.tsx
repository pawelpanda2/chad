"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { FRAME_SECTION_GAP_CLASS, LIST_ROW_CLASS, LIST_ROW_WRAPPER_CLASS } from "@/components/shared/layout-tokens";
import { Button } from "@/components/ui/button";
import { ErrorBox } from "@/components/shared/error-box";
import { cn } from "@/lib/utils";
import { Loader2, RefreshCw } from "lucide-react";

interface BeeperLinkEntry {
  chatId: string;
  type: string;
}

interface GoogleContactsLinkEntry {
  resourceName: string;
  displayName: string;
  phone: string;
}

interface LinksV2LeadRow {
  leadKey: string;
  leadName: string;
  loca: string;
  draft: boolean;
  links: { beeper: BeeperLinkEntry[]; googleContacts: GoogleContactsLinkEntry[] };
}

interface SyncReport {
  leadsScanned: number;
  newBeeperLinks: number;
  newGoogleContactsLinks: number;
  draftLeadsCreated: string[];
  googleContactsConnected: boolean;
  googleContactsError?: string;
  errors: { leadName: string; error: string }[];
}

type PageState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; leads: LinksV2LeadRow[] };

export default function LinksV2Page() {
  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [syncing, setSyncing] = useState(false);
  const [report, setReport] = useState<SyncReport | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/msg-automation/links-v2");
      const json = await res.json();
      if (!res.ok || !json.success) {
        setState({ kind: "error", message: json.error || "Failed to load Links V2 data" });
        return;
      }
      setState({ kind: "ready", leads: Array.isArray(json.leads) ? json.leads : [] });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSynchronize() {
    setSyncing(true);
    setSyncError(null);
    setReport(null);
    try {
      const res = await fetch("/api/msg-automation/links-v2/synchronize", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setSyncError(json.error || "Synchronize failed");
        return;
      }
      setReport(json.report as SyncReport);
      await load();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <DashboardPageShell
      title="Links V2"
      upLevel={{ href: "/dashboard/msg-automation", label: "Msg Auto" }}
      scroll={false}
      contentClassName={FRAME_SECTION_GAP_CLASS}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          disabled={syncing}
          onClick={() => void handleSynchronize()}
        >
          <RefreshCw className={cn("h-3 w-3", syncing && "animate-spin")} />
          Synchronize
        </Button>
        {state.kind === "ready" && (
          <span className="text-xs text-muted-foreground">{state.leads.length} leads</span>
        )}
      </div>

      {syncError && <ErrorBox message={syncError} />}

      {report && (
        <div className="rounded-lg border px-3 py-2 text-xs">
          <div className="font-medium text-foreground">Synchronize report</div>
          <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-muted-foreground sm:grid-cols-3">
            <div>Leads scanned: {report.leadsScanned}</div>
            <div>New Beeper links: {report.newBeeperLinks}</div>
            <div>New Google Contacts links: {report.newGoogleContactsLinks}</div>
            <div>Draft leads created: {report.draftLeadsCreated.length}</div>
            <div>Google Contacts: {report.googleContactsConnected ? "connected" : "not connected"}</div>
            <div>Errors: {report.errors.length}</div>
          </div>
          {report.googleContactsError && (
            <div className="mt-1 text-amber-600 dark:text-amber-400">
              Google Contacts: {report.googleContactsError}
            </div>
          )}
          {report.draftLeadsCreated.length > 0 && (
            <div className="mt-1 text-muted-foreground">
              New draft leads: {report.draftLeadsCreated.join(", ")}
            </div>
          )}
          {report.errors.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-red-600 dark:text-red-400">
              {report.errors.map((e, i) => (
                <li key={i}>
                  {e.leadName}: {e.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {state.kind === "loading" && (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      )}

      {state.kind === "error" && <ErrorBox message={state.message} />}

      {state.kind === "ready" && state.leads.length === 0 && (
        <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          No leads yet.
        </div>
      )}

      {state.kind === "ready" && state.leads.length > 0 && (
        <div
          className={cn(
            LIST_ROW_WRAPPER_CLASS,
            "flex min-h-0 w-full max-w-[720px] flex-1 flex-col overflow-y-auto",
          )}
        >
          <div className="divide-y">
            {state.leads.map((lead) => (
              <div key={lead.leadKey} className={cn("flex items-center gap-3", LIST_ROW_CLASS)}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {lead.leadName}
                    {lead.draft && (
                      <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold uppercase text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                        Draft
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Beeper: {lead.links.beeper.length} · Google Contacts: {lead.links.googleContacts.length}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </DashboardPageShell>
  );
}
