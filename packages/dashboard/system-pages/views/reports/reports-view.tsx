"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  TextReportsBrowser,
  type TextReportListRow,
} from "@/system-pages/views/shared/text-reports-browser";

interface ReportEntry {
  itemName: string;
  loca: string;
  body?: string;
  address?: string;
}

interface ReportCategoryOption {
  id: string;
  logicalName: string;
  displayName: string;
  loca: string;
}

export interface ReportsViewProps {
  selectedReportLoca: string | null;
  onSelectReport: (loca: string | null) => void;
  onBackToMenu: () => void;
}

/**
 * Views → Reports — implementation lives under system-pages (Story 113).
 * Behavior matches the former inline block in `views/page.tsx` (Story 102).
 */
export function ReportsView({
  selectedReportLoca,
  onSelectReport,
  onBackToMenu,
}: ReportsViewProps) {
  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [reportCategories, setReportCategories] = useState<ReportCategoryOption[]>([]);
  const [selectedReportCategoryId, setSelectedReportCategoryId] = useState<string>("");
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [editedReportContent, setEditedReportContent] = useState("");
  const [reportSaving, setReportSaving] = useState(false);
  const [reportSaved, setReportSaved] = useState(false);
  const [categoriesEpoch, setCategoriesEpoch] = useState(0);
  const [listEpoch, setListEpoch] = useState(0);

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
      setReportsLoading(true);
      setReportsError(null);
      try {
        const res = await fetch("/api/reports/categories");
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.success) {
          throw new Error(json.error || "Failed to load report categories");
        }
        const cats: ReportCategoryOption[] = Array.isArray(json.categories) ? json.categories : [];
        setReportCategories(cats);
        setSelectedReportCategoryId((prev) => {
          if (prev && cats.some((c) => c.id === prev)) return prev;
          return cats[0]?.id ?? "";
        });
      } catch (err) {
        if (!cancelled) {
          setReportsError(err instanceof Error ? err.message : String(err));
          setReportCategories([]);
          setSelectedReportCategoryId("");
          setReports([]);
        }
      } finally {
        if (!cancelled) setReportsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [categoriesEpoch]);

  useEffect(() => {
    if (!selectedReportCategoryId) {
      setReports([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setReportsLoading(true);
      setReportsError(null);
      try {
        const params = new URLSearchParams({ category: selectedReportCategoryId });
        const res = await fetch(`/api/reports?${params.toString()}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.success) {
          throw new Error(json.error || "Failed to load reports");
        }
        const items: ReportEntry[] = Array.isArray(json.reports)
          ? json.reports.map(
              (r: { name: string; loca: string; address: string; preview?: string | null }) => ({
                itemName: r.name,
                loca: r.loca,
                address: r.address,
                body: undefined,
              }),
            )
          : [];
        setReports(items);
      } catch (err) {
        if (!cancelled) {
          setReportsError(err instanceof Error ? err.message : String(err));
          setReports([]);
        }
      } finally {
        if (!cancelled) setReportsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedReportCategoryId, listEpoch]);

  useEffect(() => {
    if (!selectedReportLoca) {
      setEditedReportContent("");
      setReportSaved(false);
      return;
    }
    const fromList = reports.find((r) => r.loca === selectedReportLoca);
    if (!fromList?.address) return;
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ address: fromList.address! });
        const res = await fetch(`/api/reports/item?${params.toString()}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.success) throw new Error(json.error || "Failed to load report");
        setEditedReportContent(typeof json.data?.body === "string" ? json.data.body : "");
        setReportSaved(false);
      } catch {
        if (!cancelled) {
          setEditedReportContent("");
          setReportSaved(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedReportLoca, selectedReport?.address]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReportEditorChange = (value: string) => {
    setEditedReportContent(value);
    if (reportSaved) setReportSaved(false);
  };

  const handleReportEditorSave = useCallback(async (): Promise<boolean> => {
    if (!selectedReportLoca) return false;
    setReportSaving(true);
    try {
      const response = await fetch("/api/forms/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editedReportContent, loca: selectedReportLoca }),
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Unknown error");
      }
      setReports((prev) =>
        prev.map((r) => (r.loca === selectedReportLoca ? { ...r, body: editedReportContent } : r)),
      );
      setReportSaved(true);
      toast.success("Report updated");
      setTimeout(() => setReportSaved(false), 3000);
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Error: ${errorMsg}`);
      return false;
    } finally {
      setReportSaving(false);
    }
  }, [editedReportContent, selectedReportLoca]);

  const rows: TextReportListRow[] = filteredReports.map((r) => ({
    key: r.loca,
    name: r.itemName,
    loca: r.loca,
  }));

  const selectedRow = selectedReport
    ? { key: selectedReport.loca, name: selectedReport.itemName, loca: selectedReport.loca }
    : null;

  const emptyMessage =
    reportCategories.length === 0 ? "No report categories found." : "No reports in this category.";

  return (
    <TextReportsBrowser
      title="Reports"
      selectedReport={selectedRow}
      onBackToList={() => onSelectReport(null)}
      onBackToMenu={onBackToMenu}
      toolbarExtra={
        <Select
          value={selectedReportCategoryId || undefined}
          onValueChange={(v) => {
            setSelectedReportCategoryId(v);
            setFilter("");
          }}
          disabled={reportCategories.length === 0 || reportsLoading}
        >
          <SelectTrigger size="sm" className="h-7 w-[260px] text-xs">
            <SelectValue placeholder="Report type" />
          </SelectTrigger>
          <SelectContent>
            {reportCategories.map((c) => (
              <SelectItem key={c.id} value={c.id} className="text-xs">
                {c.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      filter={filter}
      onFilterChange={setFilter}
      filterPlaceholder="Search reports"
      onRefresh={() => {
        setCategoriesEpoch((n) => n + 1);
        setListEpoch((n) => n + 1);
      }}
      loading={reportsLoading}
      error={reportsError}
      countLabel={`${filteredReports.length} of ${reports.length} reports`}
      emptyMessage={emptyMessage}
      rows={rows}
      onSelectReport={(loca) => onSelectReport(loca)}
      editorValue={editedReportContent}
      onEditorChange={handleReportEditorChange}
      onSave={handleReportEditorSave}
      saving={reportSaving}
      saved={reportSaved}
    />
  );
}
