"use client";

import Link from "next/link";
import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { buildLeadDetailsHref, getLeadDetailsHref } from "@/lib/lead-links";
import { ErrorBox } from "@/components/shared/error-box";
import { TextEditorWithToolbar } from "@/components/shared/text-editor-with-toolbar";
import { TABLE_ACTION_COLUMN_WIDTH_CLASS, FRAME_SECTION_GAP_CLASS, LIST_ROW_CLASS, LIST_ROW_WRAPPER_CLASS } from "@/components/shared/layout-tokens";
import { cn } from "@/lib/utils";
import {
  RefreshCw,
  Search,
  ArrowUp,
  ArrowDown,
  User,
  CheckCircle2,
  FileText,
  Plus,
  Save,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

// Fields computed server-side on every read (computeDailyAutoFieldsByDate in
// dba) — never editable, never sent back on save. Kept as a Set so the edit
// path can never accidentally include them (Story 62).
const AUTO_FIELD_KEYS = new Set([
  "PULLS AUTO",
  "CLOSES AUTO",
  "QUALITY DP AUTO",
  "QUALITY C AUTO",
]);

// ============================================================================
// Types
// ============================================================================

interface DateEntryRecord {
  itemName: string;
  loca?: string;
  body?: Record<string, unknown>;
}

interface DailyEntryRecord {
  itemName: string;
  loca?: string;
  body?: Record<string, unknown>;
}

type RowSaveStatus = "idle" | "saving" | "saved" | "error";

interface LeadDashboardItem {
  leadKey: string;
  leadName: string;
  loca: string;
  hasContacts: boolean;
}

interface ReportEntry {
  itemName: string;
  loca: string;
  body?: string;
}

type ViewType = null | "tracker" | "dates" | "leads" | "reports";
type SortDir = "asc" | "desc";

// ============================================================================
// Column definitions — mirror the Google Sheets exactly: order, grouping,
// section colors. "— AUTO" columns are computed server-side in
// /api/views (see computeDailyAutoFieldsByDate in dba) from Date entries
// matched by day.
// ============================================================================

type Group = "none" | "training" | "action" | "texting" | "results";

const DATE_COLUMNS: Array<{ key: string; label: string; group: Group }> = [
  { key: "DATA", label: "DATA", group: "none" },
  { key: "ŹRÓDŁO", label: "ŹRÓDŁO", group: "none" },
  { key: "NAZWA", label: "NAZWA", group: "none" },
  { key: "LINK", label: "LINK", group: "none" },
  { key: "PULL", label: "PULL", group: "none" },
  { key: "CLOSE", label: "CLOSE", group: "none" },
  { key: "JAKOŚĆ", label: "JAKOŚĆ", group: "none" },
];

const DAILY_COLUMNS: Array<{ key: string; label: string; group: Group }> = [
  { key: "DATE", label: "DATE", group: "none" },
  { key: "STATE", label: "STATE", group: "training" },
  { key: "TRAINING TIME", label: "TRAINING TIME", group: "training" },
  { key: "VERBAL EXERCISES", label: "VERBAL EXERCISES", group: "training" },
  { key: "INFIELD", label: "INFIELD", group: "training" },
  { key: "THEORY", label: "THEORY", group: "training" },
  { key: "FIELD REVIEW", label: "FIELD REVIEW", group: "training" },
  { key: "ACTION TIME", label: "ACTION TIME", group: "action" },
  { key: "APPROACHES", label: "APPROACHES", group: "action" },
  { key: "LONG INTERACTIONS", label: "LONG INTERACTIONS", group: "action" },
  { key: "NUMBERS", label: "NUMBERS", group: "action" },
  { key: "PULLS AUTO", label: "PULLS — AUTO", group: "action" },
  { key: "FIRST MESSAGES", label: "FIRST MESSAGES", group: "texting" },
  { key: "RESPONSES", label: "RESPONSES", group: "texting" },
  { key: "DATES SET UP", label: "DATES SET UP", group: "texting" },
  { key: "DATES", label: "DATES", group: "texting" },
  { key: "CLOSES AUTO", label: "CLOSES — AUTO", group: "results" },
  { key: "QUALITY DP AUTO", label: "QUALITY D/P — AUTO", group: "results" },
  { key: "QUALITY C AUTO", label: "QUALITY C — AUTO", group: "results" },
  { key: "OUTINGS", label: "OUTINGS", group: "results" },
];

const GROUP_HEADER_CLASS: Record<Group, string> = {
  none: "bg-muted",
  training: "bg-green-100 dark:bg-green-950/50",
  action: "bg-amber-100 dark:bg-amber-950/50",
  texting: "bg-blue-100 dark:bg-blue-950/50",
  results: "bg-rose-100 dark:bg-rose-950/50",
};

const CELL_CLASS: Record<Group, string> = {
  none: "",
  training: "bg-green-50/60 dark:bg-green-950/20",
  action: "bg-amber-50/60 dark:bg-amber-950/20",
  texting: "bg-blue-50/60 dark:bg-blue-950/20",
  results: "bg-rose-50/60 dark:bg-rose-950/20",
};

// ============================================================================
// Main Component
// ============================================================================

export default function ViewsPage() {
  return (
    <Suspense fallback={null}>
      <ViewsPageContent />
    </Suspense>
  );
}

function ViewsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The URL is the single source of truth for which view is selected, so
  // browser back/forward works correctly across: selection menu -> a view
  // -> (e.g.) a form's post-save redirect back into a view. Each transition
  // uses router.push (a new history entry), never replace.
  const viewParam = searchParams.get("view");
  const selectedView: ViewType =
    viewParam === "tracker" || viewParam === "dates" || viewParam === "leads" || viewParam === "reports"
      ? viewParam
      : null;
  const returnTo = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;

  const [dateEntries, setDateEntries] = useState<DateEntryRecord[]>([]);
  const [dailyEntries, setDailyEntries] = useState<DailyEntryRecord[]>([]);
  const [leads, setLeads] = useState<LeadDashboardItem[]>([]);
  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [selectedReportLoca, setSelectedReportLoca] = useState<string | null>(null);
  // Local editable copy of the selected report's body, plus its own
  // save state — Views/Reports is editable (Story 56), reusing the same
  // /api/forms/reports update endpoint Forms uses (no new route, no
  // duplicated save logic).
  const [editedReportContent, setEditedReportContent] = useState("");
  const [reportSaving, setReportSaving] = useState(false);
  const [reportSaved, setReportSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Dates and Daily Tracker fetch errors are kept separate (mirroring
  // reportsError above) — a Content Provider failure fetching one no longer
  // silently discards the other's already-fetched data, and each view shows
  // its own specific error instead of a shared, generic one.
  const [dateEntriesError, setDateEntriesError] = useState<string | null>(null);
  const [dailyEntriesError, setDailyEntriesError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<string>("");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Daily Tracker inline edit (Story 62) — read-only by default; `Edit`
  // reveals the floppy in the action column and unlocks cells. Draft edits
  // are keyed by itemName so unrelated rows' in-progress edits are never
  // clobbered by a save/refresh of a different row.
  const [isTrackerEditMode, setIsTrackerEditMode] = useState(false);
  const [editedRows, setEditedRows] = useState<Record<string, Record<string, string>>>({});
  const [rowSaveStatus, setRowSaveStatus] = useState<Record<string, RowSaveStatus>>({});
  const [bulkSaving, setBulkSaving] = useState(false);
  // "Open Raw": makes every row clickable, navigating to a full-page editor
  // (the ADD DAILY ENTRY form, reused in edit mode) instead of the old
  // pencil-opened modal. Mutually exclusive with inline Edit mode so a
  // click never has to choose between focusing an editable cell and
  // navigating away (Story 62 Round 8).
  const [isRawMode, setIsRawMode] = useState(false);
  // Toggles a super-narrow extra column showing each row's real Content
  // Provider item name (the sequential "01", "02", ... identifier
  // generateEntryName assigns — not the DATE/DATA value) — independent of
  // Edit/Open Raw mode (Story 62 Round 10).
  const [showItemNameColumn, setShowItemNameColumn] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setDateEntriesError(null);
    setDailyEntriesError(null);
    setReportsError(null);
    try {
      const [viewsRes, leadsRes, reportsRes] = await Promise.all([
        fetch("/api/views"),
        fetch("/api/leads-dashboard"),
        fetch("/api/views/reports"),
      ]);
      const viewsResult = await viewsRes.json();
      const leadsResult = await leadsRes.json();
      const reportsResult = await reportsRes.json();

      if (viewsResult.success) {
        setDateEntries(viewsResult.dateEntries || []);
        setDailyEntries(viewsResult.dailyEntries || []);
        // Independent per-list errors (Content Provider timeout/failure on
        // just one of the two) — never silently shown as "0 entries", and
        // never blocks the other list from rendering.
        if (viewsResult.dateEntriesError) {
          setDateEntriesError(viewsResult.dateEntriesError);
          toast.error(`Dates: ${viewsResult.dateEntriesError}`);
        }
        if (viewsResult.dailyEntriesError) {
          setDailyEntriesError(viewsResult.dailyEntriesError);
          toast.error(`Daily Tracker: ${viewsResult.dailyEntriesError}`);
        }
      } else {
        setError(viewsResult.error || "Failed to fetch data");
        toast.error(viewsResult.error || "Failed to fetch data");
      }

      if (Array.isArray(leadsResult)) {
        setLeads(leadsResult);
      }

      // Reports errors are kept separate from the tracker/dates error above
      // so a Reports-only failure (e.g. views/reports not found) doesn't
      // block the other views, and is never silently shown as "no reports".
      if (reportsResult.success) {
        setReports(reportsResult.reports || []);
      } else {
        setReportsError(reportsResult.error || "Failed to fetch reports");
        setReports([]);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      setError(errorMsg);
      toast.error(`Error: ${errorMsg}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset filter/sort defaults whenever the selected view changes (including
  // via browser back/forward, since selectedView is derived from the URL).
  useEffect(() => {
    setFilter("");
    setSortKey(selectedView === "dates" ? "DATA" : selectedView === "tracker" ? "DATE" : "");
    // Oldest-first by default on both tables (Story 62 Round 10) — was
    // newest-first on DATES only, inconsistent with Tracker.
    setSortDir("asc");
    setSelectedReportLoca(null);
    setIsTrackerEditMode(false);
    setIsRawMode(false);
    setEditedRows({});
    setRowSaveStatus({});
  }, [selectedView]);

  const handleRefresh = () => {
    fetchData();
    toast.success("Data refreshed");
  };

  const handleBack = () => {
    router.push(pathname);
  };

  const handleViewSelect = (view: ViewType) => {
    router.push(`${pathname}?view=${view}`);
  };

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  // ==========================================================================
  // Daily Tracker inline edit — dirty tracking, per-row/bulk save (Story 62)
  // ==========================================================================

  /**
   * Typing a value back to exactly what it originally was clears that
   * field's dirty state instead of leaving it marked as changed — matches
   * the user's expectation that "no real change" means "not dirty."
   */
  const handleTrackerFieldChange = (itemName: string, key: string, value: string, originalValue: string) => {
    setEditedRows((prev) => {
      const rowEdits = { ...prev[itemName] };
      if (value === originalValue) {
        delete rowEdits[key];
      } else {
        rowEdits[key] = value;
      }
      const next = { ...prev };
      if (Object.keys(rowEdits).length === 0) {
        delete next[itemName];
      } else {
        next[itemName] = rowEdits;
      }
      return next;
    });
    // A fresh edit invalidates a previous "saved" confirmation for this row.
    setRowSaveStatus((prev) => (prev[itemName] === "saved" ? { ...prev, [itemName]: "idle" } : prev));
  };

  const isDirtyField = (itemName: string, key: string) => editedRows[itemName]?.[key] !== undefined;
  const hasRowChanges = (itemName: string) => Object.keys(editedRows[itemName] || {}).length > 0;

  /**
   * Saves one row's (Daily Entry or Date Entry) changed fields for real via
   * PATCH /api/forms/daily-entry or /api/forms/date-entry (updateDailyEntry/
   * updateDateEntry in dba, picked by which view is active) — never shows
   * "Saved" unless the write actually succeeded (Story 62 explicit
   * requirement: no pretend Save). Daily Entry AUTO columns are never
   * sent — they are computed server-side on every read and would be
   * silently overwritten with a stale snapshot otherwise (Date Entries
   * have no AUTO columns, so this is a no-op there).
   */
  const saveTrackerRow = async (entry: DailyEntryRecord | DateEntryRecord): Promise<boolean> => {
    const changes = editedRows[entry.itemName];
    if (!changes || Object.keys(changes).length === 0) return true;
    if (!entry.loca) {
      toast.error(`Cannot save "${entry.itemName}": missing loca`);
      return false;
    }
    if (rowSaveStatus[entry.itemName] === "saving") return false; // in-flight guard

    const isTrackerRow = selectedView === "tracker";
    setRowSaveStatus((prev) => ({ ...prev, [entry.itemName]: "saving" }));
    try {
      const fields: Record<string, unknown> = { ...entry.body, ...changes };
      for (const key of AUTO_FIELD_KEYS) delete fields[key];

      const response = await fetch(isTrackerRow ? "/api/forms/daily-entry" : "/api/forms/date-entry", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loca: entry.loca, fields }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || "Save failed");

      const applyChanges = (e: DailyEntryRecord | DateEntryRecord) =>
        e.itemName === entry.itemName ? { ...e, body: { ...e.body, ...changes } } : e;
      if (isTrackerRow) {
        setDailyEntries((prev) => prev.map(applyChanges));
      } else {
        setDateEntries((prev) => prev.map(applyChanges));
      }
      setEditedRows((prev) => {
        const next = { ...prev };
        delete next[entry.itemName];
        return next;
      });
      setRowSaveStatus((prev) => ({ ...prev, [entry.itemName]: "saved" }));
      setTimeout(() => {
        setRowSaveStatus((prev) => (prev[entry.itemName] === "saved" ? { ...prev, [entry.itemName]: "idle" } : prev));
      }, 2000);
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Error saving ${entry.itemName}: ${errorMsg}`);
      setRowSaveStatus((prev) => ({ ...prev, [entry.itemName]: "error" }));
      return false;
    }
  };

  /** Bulk Save — only rows with actual pending changes, per-row status. */
  const saveAllDirtyTrackerRows = async () => {
    const dirtyItemNames = Object.keys(editedRows).filter((name) => hasRowChanges(name));
    if (dirtyItemNames.length === 0) return;
    setBulkSaving(true);
    try {
      const sourceEntries: Array<DailyEntryRecord | DateEntryRecord> =
        selectedView === "tracker" ? dailyEntries : dateEntries;
      const results = await Promise.all(
        dirtyItemNames.map((itemName) => {
          const entry = sourceEntries.find((e) => e.itemName === itemName);
          return entry ? saveTrackerRow(entry) : Promise.resolve(false);
        })
      );
      const failCount = results.filter((ok) => !ok).length;
      if (failCount === 0) {
        toast.success(`Saved ${results.length} ${results.length === 1 ? "row" : "rows"}`);
      } else {
        toast.error(`${failCount} of ${results.length} rows failed to save`);
      }
    } finally {
      setBulkSaving(false);
    }
  };

  // Computed unconditionally (before any early return) — Rules of Hooks:
  // useMemo can't be called after a conditional return.
  const currentEntries = useMemo(() => {
    const rawEntries = selectedView === "dates" ? dateEntries : selectedView === "tracker" ? dailyEntries : [];
    let result = rawEntries;
    if (filter.trim()) {
      const f = filter.toLowerCase().trim();
      result = result.filter(
        (entry) =>
          entry.itemName.toLowerCase().includes(f) ||
          Object.values(entry.body || {}).some((v) => String(v ?? "").toLowerCase().includes(f))
      );
    }
    if (!sortKey) return result;
    return [...result].sort((a, b) => {
      const av = String(a.body?.[sortKey] ?? "");
      const bv = String(b.body?.[sortKey] ?? "");
      const cmp = av.localeCompare(bv, undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [selectedView, dateEntries, dailyEntries, filter, sortKey, sortDir]);

  const filteredLeads = useMemo(() => {
    if (!filter.trim()) return leads;
    const f = filter.toLowerCase().trim();
    return leads.filter(
      (lead) => lead.leadName.toLowerCase().includes(f) || lead.leadKey.toLowerCase().includes(f)
    );
  }, [leads, filter]);

  const filteredReports = useMemo(() => {
    if (!filter.trim()) return reports;
    const f = filter.toLowerCase().trim();
    return reports.filter((r) => r.itemName.toLowerCase().includes(f));
  }, [reports, filter]);

  const selectedReport = useMemo(
    () => reports.find((r) => r.loca === selectedReportLoca) || null,
    [reports, selectedReportLoca]
  );

  // Sync the editable copy when a (different) report is selected — keyed on
  // the loca, not on `selectedReport` itself, so an in-progress edit isn't
  // clobbered by a background refetch of the same report.
  useEffect(() => {
    setEditedReportContent(selectedReport?.body ?? "");
    setReportSaved(false);
  }, [selectedReportLoca]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReportEditorChange = (value: string) => {
    setEditedReportContent(value);
    if (reportSaved) setReportSaved(false);
  };

  /** Saves the selected report's edited body via the same update endpoint
   * the Forms Reports editor uses (loca-based POST) — no duplicated save
   * logic, no new route. */
  const handleReportEditorSave = async (): Promise<boolean> => {
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
        prev.map((r) => (r.loca === selectedReportLoca ? { ...r, body: editedReportContent } : r))
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
  };

  // ============================================================================
  // Render: View Selection Menu
  // ============================================================================

  if (!selectedView) {
    return (
      <DashboardPageShell title="Views">
        {/*
          Fixed 4-column grid (same as Forms): the 3 buttons occupy 3 cells and
          the 4th cell stays empty — buttons keep their column width instead of
          stretching to fill the row.
        */}
        <div className="grid grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => handleViewSelect("tracker")}
            className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[60px]"
          >
            <span className="font-semibold text-sm">DAILY TRACKER</span>
          </button>
          <button
            type="button"
            onClick={() => handleViewSelect("dates")}
            className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[60px]"
          >
            <span className="font-semibold text-sm">DATES</span>
          </button>
          <button
            type="button"
            onClick={() => handleViewSelect("leads")}
            className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[60px]"
          >
            <span className="font-semibold text-sm">LEADS</span>
          </button>
          <button
            type="button"
            onClick={() => handleViewSelect("reports")}
            className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[60px]"
          >
            <span className="font-semibold text-sm">REPORTS</span>
          </button>
        </div>
      </DashboardPageShell>
    );
  }

  // ============================================================================
  // Render: Leads (moved here from the former standalone /dashboard/leads
  // page — same data/links, just embedded as a Views option)
  // ============================================================================

  if (selectedView === "leads") {
    return (
      <DashboardPageShell
        upLevel={{ onClick: handleBack }}
        title="Leads"
        contentClassName={FRAME_SECTION_GAP_CLASS}
      >
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter leads..."
              className="pl-7 h-7 text-xs w-[220px]"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
            className="gap-2 h-7 text-xs"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <span className="text-xs text-muted-foreground">
            {filteredLeads.length} of {leads.length} leads
          </span>
        </div>

        <ErrorBox message={error} className="mb-2" />

        {/* Inner frame (Story 62 standard). */}
        <div className={LIST_ROW_WRAPPER_CLASS}>
        {isLoading ? (
          <div className="flex items-center gap-2 py-4 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Loading leads...</span>
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="flex items-center gap-3 py-4 text-muted-foreground">
            <User className="h-8 w-8 opacity-20" />
            <span className="text-sm">No leads found</span>
          </div>
        ) : (
          <div className="divide-y">
              {filteredLeads.map((lead) => (
                  <div
                    key={lead.leadKey}
                    className={`flex items-center group ${LIST_ROW_CLASS}`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Link
                        href={getLeadDetailsHref(lead.leadName, lead.loca)}
                        className="flex flex-shrink-0 items-center gap-2 rounded-lg"
                        aria-label={`Open lead details for ${lead.leadName}`}
                      >
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <User className="h-3.5 w-3.5" />
                        </span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {lead.leadKey}.
                        </span>
                      </Link>
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Link
                          href={buildLeadDetailsHref({
                            leadName: lead.leadName,
                            leadLoca: lead.loca,
                            returnTo,
                          })}
                          className="font-medium text-sm truncate hover:text-primary hover:underline"
                        >
                          {lead.leadName}
                        </Link>
                        {lead.hasContacts ? (
                          <span className="flex items-center gap-1 text-xs text-green-600">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Contacts
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">No contacts</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
          </div>
        )}
        </div>
      </DashboardPageShell>
    );
  }

  // ============================================================================
  // Render: Reports
  // ============================================================================

  if (selectedView === "reports") {
    return (
      <DashboardPageShell
        scroll={!selectedReport}
        padded={!selectedReport}
        contentClassName={!selectedReport ? FRAME_SECTION_GAP_CLASS : undefined}
        upLevel={{
          onClick: selectedReport ? () => setSelectedReportLoca(null) : handleBack,
          label: selectedReport ? "Back to reports list" : "Back to Views menu",
        }}
        title="Reports"
      >
        {selectedReport ? (
          <TextEditorWithToolbar
            value={editedReportContent}
            onChange={handleReportEditorChange}
            onSave={handleReportEditorSave}
            saving={reportSaving}
            saved={reportSaved}
            placeholder="This report is empty. Start writing..."
            className="h-full"
          />
        ) : (
          <>
            <div className="flex shrink-0 flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter reports..."
                  className="pl-7 h-7 text-xs w-[220px]"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isLoading}
                className="gap-2 h-7 text-xs"
              >
                <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <span className="text-xs text-muted-foreground">
                {filteredReports.length} of {reports.length} reports
              </span>
            </div>

            <ErrorBox message={reportsError} className="mb-2" />
            <div className={LIST_ROW_WRAPPER_CLASS}>
            {isLoading ? (
              <div className="flex items-center gap-2 py-4 text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Loading reports...</span>
              </div>
            ) : reportsError ? null : filteredReports.length === 0 ? (
              <div className="flex items-center gap-3 py-4 text-muted-foreground">
                <FileText className="h-8 w-8 opacity-20" />
                <span className="text-sm">No reports yet. Use Forms to add one.</span>
              </div>
            ) : (
              <div className="divide-y">
                {filteredReports.map((report) => (
                  <button
                    key={report.loca}
                    type="button"
                    onClick={() => setSelectedReportLoca(report.loca)}
                    className={`flex w-full items-center gap-3 text-left ${LIST_ROW_CLASS}`}
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <FileText className="h-3.5 w-3.5" />
                    </span>
                    <span className="font-medium text-sm truncate">{report.itemName}</span>
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

  // ============================================================================
  // Render: Tracker / Dates
  // ============================================================================

  const columns = selectedView === "dates" ? DATE_COLUMNS : DAILY_COLUMNS;
  const viewTitle = selectedView === "dates" ? "Dates" : "Daily Tracker";
  const isTracker = selectedView === "tracker";
  const isDates = selectedView === "dates";
  // DATES has the same Add/Edit/Open Raw/inline-edit capability as DAILY
  // TRACKER (Story 62 Round 8) — both are "row-editable" views, unlike
  // LEADS/REPORTS which aren't reached through this branch at all.
  const canEditRows = isTracker || isDates;
  const dirtyRowCount = Object.keys(editedRows).filter((name) => hasRowChanges(name)).length;
  // Action column (row Save) only exists while editing — hidden entirely
  // otherwise, not just its pencil trigger (Story 62 Round 8).
  const showActionColumn = canEditRows && isTrackerEditMode;
  const addFormParam = isTracker ? "add_action" : "date_entry";

  return (
    <DashboardPageShell
      contentClassName={cn(FRAME_SECTION_GAP_CLASS, "overscroll-contain overflow-x-auto")}
      upLevel={{ onClick: handleBack }}
      title={viewTitle}
    >
      {/* Page-specific controls live inside the main frame, not above it
          (Story 62 Round 3). Scroll (both vertical AND horizontal, Round
          7 — the shell's own default hides horizontal overflow, which
          broke this wide table's right-scroll; overridden back on here)
          belongs to the outer shell frame (default `scroll`), not this
          table's own box — dragging the frame's scrollbar moves the toolbar
          row and table together
          instead of leaving the toolbar pinned while only the table
          scrolls in its own nested scrollbar (Story 62 Round 6). */}
      <div className="flex flex-wrap items-center gap-3">
        {canEditRows && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 h-7 text-xs"
              onClick={() => router.push(`/dashboard/forms?form=${addFormParam}`)}
            >
              <Plus className="h-3 w-3" />
              Add
            </Button>
            <Button
              variant={isTrackerEditMode ? "secondary" : "outline"}
              size="sm"
              className="gap-2 h-7 text-xs"
              onClick={() => setIsTrackerEditMode((v) => {
                const next = !v;
                if (next) setIsRawMode(false);
                return next;
              })}
            >
              <Save className="h-3 w-3" />
              Edit
            </Button>
            <Button
              variant={isRawMode ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              title="Click a row to open it in a full editable page"
              onClick={() => setIsRawMode((v) => {
                const next = !v;
                if (next) setIsTrackerEditMode(false);
                return next;
              })}
            >
              Open Raw
            </Button>
            <Button
              variant={showItemNameColumn ? "default" : "outline"}
              size="sm"
              className="h-7 w-7 p-0 text-xs"
              title="Show the real Content Provider item name column (01, 02, ...)"
              onClick={() => setShowItemNameColumn((v) => !v)}
            >
              n
            </Button>
          </>
        )}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter rows..."
            className="pl-7 h-7 text-xs w-[220px]"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isLoading}
          className="gap-2 h-7 text-xs"
        >
          <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        <span className="text-xs text-muted-foreground">
          {currentEntries.length} of {isTracker ? dailyEntries.length : dateEntries.length}
        </span>
      </div>

      {/* Error display — view-specific: Tracker shows a daily-entries
          failure, Dates shows a date-entries failure. A failure fetching
          one never blanks out the other view's data (see /api/views). */}
      <ErrorBox message={isTracker ? dailyEntriesError : dateEntriesError} className="mb-1 shrink-0" />

      {/* Inner frame (Story 62 standard: outer shell frame always holds at
          least one inner frame around its content, even single-element
          pages). No longer its own scroll box (Round 6) — the outer shell
          frame owns the one scrollbar now (both axes), so this div must
          NOT have its own overflow/width constraint — it has to be free to
          render as wide/tall as the table actually is so that overflow
          bubbles up to the real scroll container above. `overflow-hidden`
          here (tried in Round 8 for rounded corners) reintroduced a
          second, wrong scrollbar/clip point and got reverted (Round 9).
          Per-cell `rounded-*` on the header/body corner cells was also
          tried (still no `overflow`, so still safe re: scroll) but doesn't
          render — `border-radius` on cells is not respected when the table
          uses `border-collapse` (a genuine browser limitation, not a bug
          here). Deliberately NOT `rounded-lg` on this wrapper either
          anymore (was, until Round 9's third pass) — a rounded wrapper
          around a square `<table>` left the table's own square corner
          poking past the wrapper's curve, an odd-looking notch rather
          than a clean shape either way. Square wrapper + square table now
          match exactly, no mismatch to switch to `border-collapse:
          separate` (visible double borders between every cell) for. */}
      <div className="border bg-muted/10">
            {/* No `w-full` here (Round 9) — a table that's told to be
                100% wide but doesn't have enough real column content
                distributes the slack into every column instead of one
                place, stretching each column wider than its data needs.
                Without it the table hugs its own natural content width
                and stays left-aligned; the wrapper's own background simply
                shows through on the right when the table doesn't reach the
                frame's full width — still exactly as wide as its columns
                need when that's MORE than the frame (unaffected, still
                overflows correctly for the outer scrollbar). */}
            <table className="border-collapse text-xs">
              <thead>
                {isTracker && (
                  <tr>
                    {showActionColumn && (
                      <th rowSpan={2} className={cn("border p-px bg-muted text-center", TABLE_ACTION_COLUMN_WIDTH_CLASS)}>
                        {/* Bulk Save lives in the table's corner cell, matching
                            STATUSES' matrix mode — not in the toolbar, where it
                            would shift the other buttons as it appears/disappears
                            (Story 62 Round 8). */}
                        <Button
                          onClick={saveAllDirtyTrackerRows}
                          disabled={bulkSaving || dirtyRowCount === 0}
                          variant={dirtyRowCount > 0 ? "destructive" : "default"}
                          size="sm"
                          className="h-6 w-6 p-0"
                          title="Save all changed rows"
                        >
                          {bulkSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        </Button>
                      </th>
                    )}
                    {showItemNameColumn && (
                      <th rowSpan={2} className="w-[32px] border p-px bg-muted text-center text-[10px] text-muted-foreground">
                        n
                      </th>
                    )}
                    <th
                      className="border p-1 bg-muted"
                      colSpan={columns.filter((c) => c.group === "none").length}
                    />
                    {(["training", "action", "texting", "results"] as const).map((g) => (
                      <th
                        key={g}
                        colSpan={columns.filter((c) => c.group === g).length}
                        className={`border p-1 text-center font-bold ${GROUP_HEADER_CLASS[g]}`}
                      >
                        {g.toUpperCase()}
                      </th>
                    ))}
                  </tr>
                )}
                <tr>
                  {/* DATES has no group row above (that's Tracker-only), so
                      its action column header lives directly in this row
                      instead of relying on a rowSpan from row 1 — Tracker's
                      own action `<th>` above already covers this row via
                      rowSpan={2} and must not get a second one here (Story
                      62 Round 9: this cell was missing entirely for DATES,
                      shifting every column header one slot out of place
                      whenever Edit mode revealed the action column). */}
                  {showActionColumn && !isTracker && (
                    <th className={cn("border p-px bg-muted text-center", TABLE_ACTION_COLUMN_WIDTH_CLASS)}>
                      <Button
                        onClick={saveAllDirtyTrackerRows}
                        disabled={bulkSaving || dirtyRowCount === 0}
                        variant={dirtyRowCount > 0 ? "destructive" : "default"}
                        size="sm"
                        className="h-6 w-6 p-0"
                        title="Save all changed rows"
                      >
                        {bulkSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      </Button>
                    </th>
                  )}
                  {showItemNameColumn && !isTracker && (
                    <th className="w-[32px] border p-px bg-muted text-center text-[10px] text-muted-foreground">
                      n
                    </th>
                  )}
                  {columns.map((col) => {
                    // Sorting is only meaningful (and only offered) on the
                    // date column — every other column used to re-sort the
                    // whole table on click too, which wasn't wanted (Story
                    // 62 Round 10). The date column keeps its click-to-
                    // reverse behavior.
                    const isSortable = col.key === "DATE" || col.key === "DATA";
                    return (
                      <th
                        key={col.key}
                        onClick={isSortable ? () => toggleSort(col.key) : undefined}
                        className={cn(
                          "border p-1.5 px-2 text-left font-semibold whitespace-nowrap select-none",
                          isSortable ? "cursor-pointer hover:brightness-95" : "cursor-default",
                          GROUP_HEADER_CLASS[col.group]
                        )}
                      >
                        <span className="inline-flex items-center gap-1">
                          {col.label}
                          {sortKey === col.key && (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={columns.length + (showActionColumn ? 1 : 0) + (showItemNameColumn ? 1 : 0)} className="border h-8 p-1.5 px-2 text-left text-muted-foreground">
                      <span className="inline-flex items-center justify-start gap-2">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        Loading...
                      </span>
                    </td>
                  </tr>
                ) : currentEntries.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + (showActionColumn ? 1 : 0) + (showItemNameColumn ? 1 : 0)} className="border h-8 text-center text-muted-foreground">
                      No entries yet. Use Forms to add data.
                    </td>
                  </tr>
                ) : (
                  currentEntries.map((entry) => {
                    const status: RowSaveStatus = rowSaveStatus[entry.itemName] || "idle";
                    const rowDirty = hasRowChanges(entry.itemName);
                    const rawClickable = canEditRows && isRawMode && !!entry.loca;
                    return (
                      <tr
                        // loca (the physical Content Provider path), not
                        // itemName — itemName is a display/logical name, not
                        // guaranteed unique (accounts can end up with two
                        // physical entries sharing one name). A duplicate
                        // key made React's reconciliation misrender rows as
                        // repeating blocks after any sort/re-render.
                        key={entry.loca}
                        className={cn("hover:bg-accent", rawClickable && "cursor-pointer")}
                        onClick={rawClickable ? () => router.push(`/dashboard/forms?form=${addFormParam}&editLoca=${encodeURIComponent(entry.loca!)}`) : undefined}
                      >
                        {showActionColumn && (
                          <td className={cn("border p-px text-center", TABLE_ACTION_COLUMN_WIDTH_CLASS)}>
                            <Button
                              size="sm"
                              variant={rowDirty ? "destructive" : "default"}
                              disabled={status === "saving"}
                              onClick={() => saveTrackerRow(entry)}
                              title={rowDirty ? "Save changes" : "No changes"}
                              aria-label="Save row"
                              className="h-7 w-7 p-0"
                            >
                              {status === "saving" ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : status === "saved" ? (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              ) : (
                                <Save className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </td>
                        )}
                        {showItemNameColumn && (
                          <td className="w-[32px] border p-px text-center font-mono text-[10px] text-muted-foreground">
                            {entry.itemName}
                          </td>
                        )}
                        {columns.map((col) => {
                          const raw = entry.body?.[col.key];
                          const isAuto = AUTO_FIELD_KEYS.has(col.key);
                          const originalStr =
                            typeof raw === "number" ? (Number.isInteger(raw) ? String(raw) : raw.toFixed(1)) : String(raw ?? "");
                          const draft = editedRows[entry.itemName]?.[col.key];
                          const value = draft ?? originalStr;
                          const editable = canEditRows && isTrackerEditMode && !isAuto;
                          const dirty = canEditRows && isDirtyField(entry.itemName, col.key);
                          // The DATE/DATA column's "YYYY-MM-DD" value doesn't
                          // fit the general 70px minimum — give it more room
                          // so the full date is always visible.
                          const isDateColumn = col.key === "DATE" || col.key === "DATA";
                          if (editable) {
                            return (
                              <td
                                key={col.key}
                                className={cn("border p-0.5 px-1", dirty ? "bg-destructive/10" : CELL_CLASS[col.group])}
                              >
                                <input
                                  value={value}
                                  onChange={(e) => handleTrackerFieldChange(entry.itemName, col.key, e.target.value, originalStr)}
                                  className={cn(
                                    "h-6 w-full max-w-[180px] rounded border-0 bg-transparent px-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring",
                                    isDateColumn ? "min-w-[100px]" : "min-w-[70px]",
                                    dirty && "text-destructive"
                                  )}
                                />
                              </td>
                            );
                          }
                          return (
                            <td
                              key={col.key}
                              className={cn(
                                "border p-1.5 px-2 whitespace-nowrap max-w-[180px] truncate",
                                isDateColumn && "min-w-[100px]",
                                CELL_CLASS[col.group]
                              )}
                              title={value}
                            >
                              {value}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
      </div>
    </DashboardPageShell>
  );
}
