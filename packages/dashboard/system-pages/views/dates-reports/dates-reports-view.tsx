"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { ErrorBox } from "@/components/shared/error-box";
import { TextEditorWithToolbar } from "@/components/shared/text-editor-with-toolbar";
import {
  FRAME_SECTION_GAP_CLASS,
  LIST_ROW_CLASS,
  LIST_ROW_WRAPPER_CLASS,
} from "@/components/shared/layout-tokens";
import { cn } from "@/lib/utils";
import { FileText, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";

interface DateReportEntry {
  itemName: string;
  loca: string;
  address: string;
  kind: "Text" | "Folder";
}

export interface DatesReportsViewProps {
  selectedReportLoca: string | null;
  /** Nested Text part inside a Folder (`before` / `after` / `report` / …). */
  selectedPartLoca: string | null;
  onSelectReport: (loca: string | null) => void;
  onSelectPart: (loca: string | null) => void;
  onBackToMenu: () => void;
}

/**
 * Views → Dates Reports — root `randki`.
 * Text entry → editor (same as Reports).
 * Folder entry → children list on the right; click a Text part → editor.
 */
export function DatesReportsView({
  selectedReportLoca,
  selectedPartLoca,
  onSelectReport,
  onSelectPart,
  onBackToMenu,
}: DatesReportsViewProps) {
  const [reports, setReports] = useState<DateReportEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [reloadEpoch, setReloadEpoch] = useState(0);

  const [children, setChildren] = useState<DateReportEntry[]>([]);
  const [childrenLoading, setChildrenLoading] = useState(false);
  const [childrenError, setChildrenError] = useState<string | null>(null);

  const [editedContent, setEditedContent] = useState("");
  const [editLoca, setEditLoca] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const filteredReports = useMemo(() => {
    if (!filter.trim()) return reports;
    const f = filter.toLowerCase().trim();
    return reports.filter((r) => r.itemName.toLowerCase().includes(f));
  }, [reports, filter]);

  const selectedReport = useMemo(
    () => reports.find((r) => r.loca === selectedReportLoca) || null,
    [reports, selectedReportLoca],
  );

  const selectedPart = useMemo(
    () => children.find((c) => c.loca === selectedPartLoca) || null,
    [children, selectedPartLoca],
  );

  const editingText =
    (selectedReport?.kind === "Text" && !!selectedReportLoca && !selectedPartLoca) ||
    (!!selectedPartLoca && selectedPart?.kind !== "Folder");

  const showFolderParts = selectedReport?.kind === "Folder" && !selectedPartLoca;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/views/dates-reports");
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.success) {
          throw new Error(json.error || "Failed to load date reports");
        }
        const items: DateReportEntry[] = Array.isArray(json.reports)
          ? json.reports.map(
              (r: { name: string; loca: string; address: string; kind: "Text" | "Folder" }) => ({
                itemName: r.name,
                loca: r.loca,
                address: r.address,
                kind: r.kind,
              }),
            )
          : [];
        setReports(items);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setReports([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadEpoch]);

  // Load Folder children when a Folder is selected.
  useEffect(() => {
    if (!selectedReport || selectedReport.kind !== "Folder") {
      setChildren([]);
      setChildrenError(null);
      setChildrenLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setChildrenLoading(true);
      setChildrenError(null);
      try {
        const params = new URLSearchParams({ address: selectedReport.address });
        const res = await fetch(`/api/views/dates-reports/children?${params.toString()}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.success) {
          throw new Error(json.error || "Failed to load parts");
        }
        const items: DateReportEntry[] = Array.isArray(json.children)
          ? json.children.map(
              (r: { name: string; loca: string; address: string; kind: "Text" | "Folder" }) => ({
                itemName: r.name,
                loca: r.loca,
                address: r.address,
                kind: r.kind,
              }),
            )
          : [];
        setChildren(items);
      } catch (err) {
        if (!cancelled) {
          setChildrenError(err instanceof Error ? err.message : String(err));
          setChildren([]);
        }
      } finally {
        if (!cancelled) setChildrenLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedReport?.address, selectedReport?.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load Text body for top-level Text or nested part.
  useEffect(() => {
    const textEntry =
      selectedPartLoca && selectedPart
        ? selectedPart.kind === "Text"
          ? selectedPart
          : null
        : selectedReport?.kind === "Text"
          ? selectedReport
          : null;

    if (!textEntry) {
      setEditedContent("");
      setEditLoca(null);
      setSaved(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ address: textEntry.address });
        const res = await fetch(`/api/views/dates-reports/item?${params.toString()}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.success) throw new Error(json.error || "Failed to load report");
        setEditedContent(typeof json.data?.body === "string" ? json.data.body : "");
        setEditLoca(typeof json.data?.editLoca === "string" ? json.data.editLoca : textEntry.loca);
        setSaved(false);
      } catch {
        if (!cancelled) {
          setEditedContent("");
          setEditLoca(null);
          setSaved(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    selectedReportLoca,
    selectedPartLoca,
    selectedReport?.address,
    selectedReport?.kind,
    selectedPart?.address,
    selectedPart?.kind,
  ]);

  const handleChange = (value: string) => {
    setEditedContent(value);
    if (saved) setSaved(false);
  };

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!editLoca) return false;
    setSaving(true);
    try {
      const response = await fetch("/api/forms/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editedContent, loca: editLoca }),
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Unknown error");
      }
      setSaved(true);
      toast.success("Report updated");
      setTimeout(() => setSaved(false), 3000);
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Error: ${errorMsg}`);
      return false;
    } finally {
      setSaving(false);
    }
  }, [editLoca, editedContent]);

  const handleSelectMain = (entry: DateReportEntry) => {
    onSelectPart(null);
    onSelectReport(entry.loca);
  };

  const handleSelectPart = (entry: DateReportEntry) => {
    if (entry.kind !== "Text") {
      toast.message("Only text parts can be opened");
      return;
    }
    onSelectPart(entry.loca);
  };

  const pageTitle = selectedPart
    ? selectedPart.itemName
    : selectedReport
      ? selectedReport.itemName
      : "Dates Reports";

  if (editingText) {
    return (
      <DashboardPageShell
        scroll={false}
        padded={false}
        title={pageTitle}
      >
        <TextEditorWithToolbar
          value={editedContent}
          onChange={handleChange}
          onSave={() => {
            void handleSave();
          }}
          saving={saving}
          saved={saved}
          placeholder="This report is empty. Start writing..."
          className="h-full"
        />
      </DashboardPageShell>
    );
  }

  return (
    <DashboardPageShell
      scroll={false}
      padded
      contentClassName={FRAME_SECTION_GAP_CLASS}
      title={pageTitle}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search reports"
            className="pl-7 h-7 text-xs w-[180px]"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setReloadEpoch((n) => n + 1)}
          disabled={loading}
          className="gap-2 h-7 text-xs"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        <span className="text-xs text-muted-foreground">
          {filteredReports.length} of {reports.length} reports
        </span>
      </div>

      <ErrorBox message={error} className="mb-2" />

      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
        <div
          className={cn(
            LIST_ROW_WRAPPER_CLASS,
            "flex min-h-0 w-[400px] max-w-[400px] flex-1 flex-col overflow-y-auto",
          )}
        >
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Loading reports...</span>
            </div>
          ) : error ? null : filteredReports.length === 0 ? (
            <div className="flex items-center gap-3 py-4 text-muted-foreground">
              <FileText className="h-8 w-8 opacity-20" />
              <span className="text-sm">No date reports found (dates / randki).</span>
            </div>
          ) : (
            <div className="divide-y">
              {filteredReports.map((report) => (
                <button
                  key={report.loca}
                  type="button"
                  onClick={() => handleSelectMain(report)}
                  className={cn(
                    `flex w-full items-center text-left ${LIST_ROW_CLASS}`,
                    selectedReportLoca === report.loca && "bg-accent",
                  )}
                >
                  <span className="font-medium text-sm truncate">{report.itemName}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {showFolderParts ? (
          <div
            className={cn(
              LIST_ROW_WRAPPER_CLASS,
              "flex min-h-0 w-[400px] max-w-[400px] flex-1 flex-col overflow-y-auto",
            )}
          >
            <div className="border-b px-3 py-2 text-xs text-muted-foreground shrink-0">
              Parts — {selectedReport?.itemName}
            </div>
            <ErrorBox message={childrenError} className="m-2" />
            {childrenLoading ? (
              <div className="flex items-center gap-2 py-4 px-3 text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Loading parts...</span>
              </div>
            ) : childrenError ? null : children.length === 0 ? (
              <div className="flex items-center gap-3 py-4 px-3 text-muted-foreground">
                <FileText className="h-8 w-8 opacity-20" />
                <span className="text-sm">No parts in this folder.</span>
              </div>
            ) : (
              <div className="divide-y">
                {children.map((part) => (
                  <button
                    key={part.loca}
                    type="button"
                    onClick={() => handleSelectPart(part)}
                    className={`flex w-full items-center text-left ${LIST_ROW_CLASS}`}
                  >
                    <span className="font-medium text-sm truncate">{part.itemName}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </DashboardPageShell>
  );
}
