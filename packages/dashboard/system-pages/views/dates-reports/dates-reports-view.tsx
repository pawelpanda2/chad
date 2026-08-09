"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  TextReportsBrowser,
  type TextReportListRow,
} from "@/system-pages/views/shared/text-reports-browser";

interface DateReportEntry {
  itemName: string;
  loca: string;
  address: string;
  kind: "Text" | "Folder";
}

export interface DatesReportsViewProps {
  selectedReportLoca: string | null;
  onSelectReport: (loca: string | null) => void;
  onBackToMenu: () => void;
}

/**
 * Views → Dates Reports — lists free-text reports from root CP folder `randki`.
 * GUI shell matches Views → Reports (Story 113).
 */
export function DatesReportsView({
  selectedReportLoca,
  onSelectReport,
  onBackToMenu,
}: DatesReportsViewProps) {
  const [reports, setReports] = useState<DateReportEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [reloadEpoch, setReloadEpoch] = useState(0);
  const [editedContent, setEditedContent] = useState("");
  const [editLoca, setEditLoca] = useState<string | null>(null);
  const [editable, setEditable] = useState(true);
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

  useEffect(() => {
    if (!selectedReportLoca) {
      setEditedContent("");
      setEditLoca(null);
      setEditable(true);
      setSaved(false);
      return;
    }
    const fromList = reports.find((r) => r.loca === selectedReportLoca);
    if (!fromList?.address) return;
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ address: fromList.address });
        const res = await fetch(`/api/views/dates-reports/item?${params.toString()}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.success) throw new Error(json.error || "Failed to load report");
        setEditedContent(typeof json.data?.body === "string" ? json.data.body : "");
        setEditLoca(typeof json.data?.editLoca === "string" ? json.data.editLoca : fromList.loca);
        setEditable(json.data?.editable !== false);
        setSaved(false);
      } catch {
        if (!cancelled) {
          setEditedContent("");
          setEditLoca(null);
          setEditable(false);
          setSaved(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedReportLoca, selectedReport?.address]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (value: string) => {
    setEditedContent(value);
    if (saved) setSaved(false);
  };

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!editLoca || !editable) return false;
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
  }, [editLoca, editable, editedContent]);

  const rows: TextReportListRow[] = filteredReports.map((r) => ({
    key: r.loca,
    name: r.itemName,
    loca: r.loca,
  }));

  const selectedRow = selectedReport
    ? { key: selectedReport.loca, name: selectedReport.itemName, loca: selectedReport.loca }
    : null;

  return (
    <TextReportsBrowser
      title="Dates Reports"
      selectedReport={selectedRow}
      onBackToList={() => onSelectReport(null)}
      onBackToMenu={onBackToMenu}
      filter={filter}
      onFilterChange={setFilter}
      filterPlaceholder="Search reports"
      onRefresh={() => setReloadEpoch((n) => n + 1)}
      loading={loading}
      error={error}
      countLabel={`${filteredReports.length} of ${reports.length} reports`}
      emptyMessage="No date reports found (dates / randki)."
      rows={rows}
      onSelectReport={(loca) => onSelectReport(loca)}
      editorValue={editedContent}
      onEditorChange={handleChange}
      onSave={handleSave}
      saving={saving}
      saved={saved}
      editorWritable={editable}
    />
  );
}
