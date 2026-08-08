"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { ErrorBox } from "@/components/shared/error-box";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LeadRow = {
  leadKey: string;
  leadName: string;
  loca: string;
  hasContacts: boolean;
};

type ArchiveRow = {
  id: string;
  originalFileName: string;
  fileType: "zip" | "rar";
  sizeBytes: number;
  createdAt: string;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * Msg Workout → Manually Added Messages (Story 108).
 * Left: leads list (same `/api/leads-dashboard` source as Message Creator) + archive counts.
 * Right: upload .zip/.rar for selected lead + assigned archives list.
 */
export default function ManuallyAddedMessagesPage() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [leadsError, setLeadsError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selectedLoca, setSelectedLoca] = useState<string | null>(null);
  const [archives, setArchives] = useState<ArchiveRow[]>([]);
  const [loadingArchives, setLoadingArchives] = useState(false);
  const [archivesError, setArchivesError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedLead = useMemo(
    () => leads.find((l) => l.loca === selectedLoca) ?? null,
    [leads, selectedLoca],
  );

  const refreshCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/leads/archives/counts");
      const json = await res.json();
      if (res.ok && json?.success) {
        setCounts(json.counts && typeof json.counts === "object" ? json.counts : {});
      }
    } catch {
      /* keep previous counts */
    }
  }, []);

  const refreshArchives = useCallback(async (loca: string) => {
    setLoadingArchives(true);
    setArchivesError(null);
    try {
      const res = await fetch(`/api/leads/archives?loca=${encodeURIComponent(loca)}`);
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Failed to load archives (${res.status})`);
      }
      setArchives(Array.isArray(json.archives) ? json.archives : []);
    } catch (err) {
      setArchives([]);
      setArchivesError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingArchives(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingLeads(true);
      setLeadsError(null);
      try {
        const [leadsRes] = await Promise.all([fetch("/api/leads-dashboard"), refreshCounts()]);
        const json = await leadsRes.json();
        if (!leadsRes.ok || json?.ok === false) {
          throw new Error(json?.error || `Failed to load leads (${leadsRes.status})`);
        }
        if (!cancelled) setLeads(Array.isArray(json) ? json : []);
      } catch (err) {
        if (!cancelled) setLeadsError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoadingLeads(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshCounts]);

  useEffect(() => {
    if (!selectedLoca) {
      setArchives([]);
      setArchivesError(null);
      return;
    }
    void refreshArchives(selectedLoca);
  }, [selectedLoca, refreshArchives]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) => l.leadName.toLowerCase().includes(q));
  }, [leads, filter]);

  async function handleUpload(files: FileList | null) {
    if (!selectedLoca || !files || files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.set("loca", selectedLoca);
      for (const file of Array.from(files)) {
        form.append("archives", file);
      }
      const res = await fetch("/api/leads/archives", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Upload failed (${res.status})`);
      }
      await Promise.all([refreshArchives(selectedLoca), refreshCounts()]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <DashboardPageShell
      title="Manually Added Messages"
      upLevel={{ href: "/dashboard/msg-automation/msg-workout" }}
      scroll={false}
    >
      {leadsError ? <ErrorBox message={leadsError} className="mb-2 shrink-0" /> : null}
      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
        {/* Left — leads (same source as Message Creator) */}
        <div className="flex w-full max-w-sm min-h-0 flex-col gap-2">
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter leads…"
            className="h-9 w-full shrink-0 rounded-md border bg-background px-3 text-sm"
            aria-label="Filter leads"
          />
          {loadingLeads ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading leads…
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No leads found.</p>
          ) : (
            <ul className="min-h-0 flex-1 divide-y overflow-y-auto rounded-md border">
              {filtered.map((lead) => {
                const count = counts[lead.loca] ?? 0;
                const selected = lead.loca === selectedLoca;
                return (
                  <li key={lead.leadKey || `${lead.leadName}:${lead.loca}`}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted",
                        selected && "bg-accent",
                      )}
                      onClick={() => setSelectedLoca(lead.loca)}
                    >
                      <span className="min-w-0 truncate font-medium">{lead.leadName}</span>
                      <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                        {count}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Right — detail / upload */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto rounded-md border p-3">
          {!selectedLead ? (
            <p className="text-sm text-muted-foreground">Select a lead</p>
          ) : (
            <>
              <h2 className="truncate text-sm font-semibold">{selectedLead.leadName}</h2>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip,.rar,application/zip,application/x-rar-compressed,application/vnd.rar"
                  multiple
                  disabled={uploading}
                  className="text-sm file:mr-2"
                  onChange={(e) => void handleUpload(e.target.files)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      Uploading…
                    </>
                  ) : (
                    "Upload .zip / .rar"
                  )}
                </Button>
              </div>
              {uploadError ? (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {uploadError}
                </div>
              ) : null}

              <div className="min-h-0 flex-1">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Assigned archives</p>
                {loadingArchives ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading…
                  </div>
                ) : archivesError ? (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    {archivesError}
                  </div>
                ) : archives.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No archives yet.</p>
                ) : (
                  <ul className="divide-y rounded-md border">
                    {archives.map((a) => (
                      <li
                        key={a.id}
                        className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-sm"
                      >
                        <span className="min-w-0 truncate font-medium">{a.originalFileName}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          .{a.fileType} · {formatBytes(a.sizeBytes)} · {formatDate(a.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardPageShell>
  );
}
