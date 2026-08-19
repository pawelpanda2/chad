"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { ErrorBox } from "@/components/shared/error-box";
import { TextEditorWithToolbar } from "@/components/shared/text-editor-with-toolbar";
import { FRAME_SECTION_GAP_CLASS, LIST_ROW_CLASS, LIST_ROW_WRAPPER_CLASS } from "@/components/shared/layout-tokens";
import { cn } from "@/lib/utils";
import { FileText, RefreshCw, Search } from "lucide-react";

export interface TextReportListRow {
  key: string;
  name: string;
  loca: string;
}

export interface TextReportsBrowserProps {
  title: string;
  /** When a report is open — up-level goes to list; otherwise to Views menu. */
  selectedReport: TextReportListRow | null;
  onBackToList: () => void;
  onBackToMenu: () => void;
  toolbarExtra?: ReactNode;
  filter: string;
  onFilterChange: (value: string) => void;
  filterPlaceholder: string;
  onRefresh: () => void;
  loading: boolean;
  error: string | null;
  countLabel: string;
  emptyMessage: string;
  rows: TextReportListRow[];
  onSelectReport: (loca: string) => void;
  /** Editor */
  editorValue: string;
  onEditorChange: (value: string) => void;
  onSave: () => Promise<boolean>;
  saving: boolean;
  saved: boolean;
  /** When false, hide Save (Folder with no Text body). Default true. */
  editorWritable?: boolean;
  editorPlaceholder?: string;
}

/**
 * Shared list + editor shell used by Views → Reports and Views → Dates Reports.
 * Data loading / category UI stay in the parent system-page.
 */
export function TextReportsBrowser({
  title,
  selectedReport,
  onBackToList,
  onBackToMenu,
  toolbarExtra,
  filter,
  onFilterChange,
  filterPlaceholder,
  onRefresh,
  loading,
  error,
  countLabel,
  emptyMessage,
  rows,
  onSelectReport,
  editorValue,
  onEditorChange,
  onSave,
  saving,
  saved,
  editorWritable = true,
  editorPlaceholder = "This report is empty. Start writing...",
}: TextReportsBrowserProps) {
  return (
    <DashboardPageShell
      scroll={!selectedReport}
      padded={!selectedReport}
      contentClassName={!selectedReport ? FRAME_SECTION_GAP_CLASS : undefined}
      title={selectedReport ? selectedReport.name : title}
    >
      {selectedReport ? (
        <TextEditorWithToolbar
          value={editorValue}
          onChange={onEditorChange}
          onSave={() => {
            void onSave();
          }}
          saving={saving}
          saved={saved}
          showSave={editorWritable}
          saveDisabled={!editorWritable}
          placeholder={editorPlaceholder}
          className="h-full"
        />
      ) : (
        <>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            {toolbarExtra}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => onFilterChange(e.target.value)}
                placeholder={filterPlaceholder}
                className="pl-7 h-7 text-xs w-[180px]"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={loading}
              className="gap-2 h-7 text-xs"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <span className="text-xs text-muted-foreground">{countLabel}</span>
          </div>

          <ErrorBox message={error} className="mb-2" />
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
            ) : error ? null : rows.length === 0 ? (
              <div className="flex items-center gap-3 py-4 text-muted-foreground">
                <FileText className="h-8 w-8 opacity-20" />
                <span className="text-sm">{emptyMessage}</span>
              </div>
            ) : (
              <div className="divide-y">
                {rows.map((report) => (
                  <button
                    key={report.key}
                    type="button"
                    onClick={() => onSelectReport(report.loca)}
                    className={`flex w-full items-center text-left ${LIST_ROW_CLASS}`}
                  >
                    <span className="font-medium text-sm truncate">{report.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </DashboardPageShell>
  );
}
