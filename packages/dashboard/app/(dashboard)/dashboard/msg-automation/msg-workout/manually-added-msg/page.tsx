"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Download, Loader2, Trash2 } from "lucide-react";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { ErrorBox } from "@/components/shared/error-box";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** Same retype-confirm pattern as Folders / AI Prompts / Beeper groups. */
const DELETE_CONFIRM_WORDS = ["DELETE", "CONFIRM", "CLEAR", "WYCZYSC", "USUN", "PERMANENT"];

type LeadRow = {
  leadKey: string;
  leadName: string;
  loca: string;
  leadUuid: string;
  hasContacts: boolean;
};

type ArchiveRow = {
  id: string;
  fileName?: string;
  originalFileName: string;
  fileType: "zip" | "rar";
  sizeBytes: number;
  createdAt: string;
  leadNameAtExport?: string;
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

function pickDeleteConfirmWord(): string {
  return DELETE_CONFIRM_WORDS[Math.floor(Math.random() * DELETE_CONFIRM_WORDS.length)];
}

/**
 * Msg Auto → manually added msg (Story 110).
 * Left: leads + archive counts (keyed by leadUuid).
 * Right: upload .zip/.rar for selected lead + assigned archives list.
 */
export default function ManuallyAddedMsgPage() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [leadsError, setLeadsError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  /** Extra attachment-count filters row (toggled by Filters). */
  const [filtersOpen, setFiltersOpen] = useState(false);
  /** When true, leads with that exact archive count stay visible. Default: both on. */
  const [showCount0, setShowCount0] = useState(true);
  const [showCount1, setShowCount1] = useState(true);
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  const [archives, setArchives] = useState<ArchiveRow[]>([]);
  const [loadingArchives, setLoadingArchives] = useState(false);
  const [archivesError, setArchivesError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<ArchiveRow | null>(null);
  const [deleteConfirmWord, setDeleteConfirmWord] = useState("");
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const selectedLead = useMemo(
    () => leads.find((l) => l.leadUuid === selectedUuid) ?? null,
    [leads, selectedUuid],
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

  const refreshArchives = useCallback(async (leadUuid: string) => {
    setLoadingArchives(true);
    setArchivesError(null);
    try {
      const res = await fetch(`/api/leads/archives?leadUuid=${encodeURIComponent(leadUuid)}`);
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
    if (!selectedUuid) {
      setArchives([]);
      setArchivesError(null);
      return;
    }
    void refreshArchives(selectedUuid);
  }, [selectedUuid, refreshArchives]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return leads.filter((l) => {
      if (q && !l.leadName.toLowerCase().includes(q)) return false;
      const count = counts[l.leadUuid] ?? 0;
      if (count === 0) return showCount0;
      if (count === 1) return showCount1;
      // 2+ attachments: always listed (no toggle for those counts yet).
      return true;
    });
  }, [leads, filter, counts, showCount0, showCount1]);

  async function handleUpload(files: FileList | null) {
    if (!selectedUuid || !files || files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.set("leadUuid", selectedUuid);
      for (const file of Array.from(files)) {
        form.append("archives", file);
      }
      const res = await fetch("/api/leads/archives", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Upload failed (${res.status})`);
      }
      await Promise.all([refreshArchives(selectedUuid), refreshCounts()]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  function openDeleteDialog(archive: ArchiveRow) {
    setDeleteTarget(archive);
    setDeleteConfirmWord(pickDeleteConfirmWord());
    setDeleteConfirmInput("");
    setDeleteError(null);
  }

  function closeDeleteDialog() {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteConfirmInput("");
    setDeleteError(null);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget || deleteConfirmInput.trim() !== deleteConfirmWord) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/leads/archives/${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Delete failed (${res.status})`);
      }
      setDeleteTarget(null);
      setDeleteConfirmInput("");
      if (selectedUuid) {
        await Promise.all([refreshArchives(selectedUuid), refreshCounts()]);
      }
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  }

  const deleteMatches = deleteConfirmInput.trim() === deleteConfirmWord;

  return (
    <DashboardPageShell
      title="manually added msg"
      upLevel={{ href: "/dashboard/msg-automation" }}
      scroll={false}
    >
      {leadsError ? <ErrorBox message={leadsError} className="mb-2 shrink-0" /> : null}
      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
        <div className="flex w-full max-w-sm min-h-0 flex-col gap-2">
          <div className="flex shrink-0 items-center gap-2">
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search"
              className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
              aria-label="Search"
            />
            <Button
              type="button"
              size="sm"
              variant={filtersOpen ? "default" : "outline"}
              className="h-9 shrink-0"
              aria-pressed={filtersOpen}
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              Filters
            </Button>
          </div>
          {filtersOpen && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={showCount0 ? "default" : "outline"}
                className="h-8 min-w-8 tabular-nums"
                aria-pressed={showCount0}
                title={showCount0 ? "Hide leads with 0 archives" : "Show leads with 0 archives"}
                onClick={() => setShowCount0((v) => !v)}
              >
                0
              </Button>
              <Button
                type="button"
                size="sm"
                variant={showCount1 ? "default" : "outline"}
                className="h-8 min-w-8 tabular-nums"
                aria-pressed={showCount1}
                title={showCount1 ? "Hide leads with 1 archive" : "Show leads with 1 archive"}
                onClick={() => setShowCount1((v) => !v)}
              >
                1
              </Button>
            </div>
          )}
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
                const count = counts[lead.leadUuid] ?? 0;
                const selected = lead.leadUuid === selectedUuid;
                return (
                  <li key={lead.leadUuid || lead.leadKey || `${lead.leadName}:${lead.loca}`}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted",
                        selected && "bg-accent",
                      )}
                      onClick={() => setSelectedUuid(lead.leadUuid)}
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
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                      >
                        <span className="min-w-0 truncate font-medium">
                          {a.fileName || a.originalFileName}
                        </span>
                        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                          <span>
                            .{a.fileType} · {formatBytes(a.sizeBytes)} · {formatDate(a.createdAt)}
                          </span>
                          <a
                            href={`/api/leads/archives/${encodeURIComponent(a.id)}`}
                            className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium text-foreground hover:bg-muted"
                            download={a.fileName || a.originalFileName}
                            aria-label={`Download ${a.fileName || a.originalFileName}`}
                          >
                            <Download className="h-3.5 w-3.5" />
                            Download
                          </a>
                          <button
                            type="button"
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-destructive/40 px-2 text-xs font-medium text-destructive hover:bg-destructive/10"
                            onClick={() => openDeleteDialog(a)}
                            aria-label={`Delete ${a.fileName || a.originalFileName}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
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

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && closeDeleteDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete archive?</DialogTitle>
            <DialogDescription>
              Permanently removes{" "}
              <strong>{deleteTarget?.fileName || deleteTarget?.originalFileName}</strong> (file +
              metadata). This can&apos;t be undone. Type{" "}
              <span className="font-mono font-bold">{deleteConfirmWord}</span> to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={deleteConfirmInput}
            onChange={(e) => setDeleteConfirmInput(e.target.value)}
            placeholder={deleteConfirmWord}
            autoFocus
            autoComplete="off"
            disabled={deleting}
          />
          {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={closeDeleteDialog} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleConfirmDelete()}
              disabled={deleting || !deleteMatches}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardPageShell>
  );
}
