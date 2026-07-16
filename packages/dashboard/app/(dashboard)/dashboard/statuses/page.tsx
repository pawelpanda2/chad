"use client";

import Link from "next/link";
import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildLeadDetailsHref } from "@/lib/lead-links";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { FRAME_SECTION_GAP_CLASS, SAVE_FRAME_PADDING_CLASS } from "@/components/shared/layout-tokens";
import { cn } from "@/lib/utils";
import {
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  User,
  Search,
  Save,
  X,
} from "lucide-react";

// ============================================================================
// Types
// ============================================================================

type StatusCategory = "missing" | "empty" | "valid" | "outdated";

interface StatusLeadItem {
  leadKey: string;
  leadName: string;
  leadLoca?: string;
  statusCategory: StatusCategory;
  statusLoca?: string;
  statusBody?: string;
}

interface StatusFields {
  city: string;
  "only-friends": boolean;
  "her-first-msg": boolean;
  "your-first-message": boolean;
  "writing-deadline": string;
  "priority-today": number;
}

interface StatusEditorData {
  leadKey: string;
  leadName: string;
  leadLoca: string;
  statusLoca: string;
  statusBody: string;
  statusCategory: StatusCategory;
}

// ============================================================================
// Status Category Labels and Colors
// ============================================================================

const STATUS_LABELS: Record<StatusCategory, string> = {
  missing: "brak statusu",
  empty: "pusty",
  valid: "ważny",
  outdated: "nieaktualny",
};

const STATUS_COLORS: Record<StatusCategory, string> = {
  missing: "bg-gray-500",
  empty: "bg-yellow-500",
  valid: "bg-green-500",
  outdated: "bg-orange-500",
};

// ============================================================================
// Mode Types
// ============================================================================

type ViewMode = "matrix" | "migration";

// ============================================================================
// City Options
// ============================================================================

const CITY_OPTIONS = [
  "Warszawa",
  "Kraków",
  "Gdańsk",
  "Wrocław",
  "Poznań",
  "Łódź",
  "Szczecin",
  "Bydgoszcz",
  "Lublin",
  "Katowice",
];

// ============================================================================
// Priority Options (0-30)
// ============================================================================

const PRIORITY_OPTIONS = Array.from({ length: 31 }, (_, i) => i);

// ============================================================================
// Main Component
// ============================================================================

export default function StatusesPage() {
  return (
    <Suspense fallback={null}>
      <StatusesPageContent />
    </Suspense>
  );
}

function StatusesPageContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const returnTo = searchParams.toString()
    ? `${pathname}?${searchParams.toString()}`
    : pathname;

  // View mode state
  const [mode, setMode] = useState<ViewMode>("matrix");

  // List view state
  const [view, setView] = useState<"list" | "editor">("list");
  const [rangeFilter, setRangeFilter] = useState("");
  const [leads, setLeads] = useState<StatusLeadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editor state
  const [editorData, setEditorData] = useState<StatusEditorData | null>(null);
  const [fields, setFields] = useState<StatusFields | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Matrix mode state
  const [nameFilter, setNameFilter] = useState("");
  const [matrixData, setMatrixData] = useState<Map<string, StatusFields>>(new Map());
  const [matrixSaving, setMatrixSaving] = useState(false);
  const [matrixSaved, setMatrixSaved] = useState(false);
  const [matrixError, setMatrixError] = useState<string | null>(null);

  // Per-row dirty state tracking (leadKey -> original fields)
  const [originalMatrixData, setOriginalMatrixData] = useState<Map<string, StatusFields>>(new Map());
  // Per-row saving state
  const [rowSavingStates, setRowSavingStates] = useState<Map<string, { saving: boolean; saved: boolean }>>(new Map());

  /** Load leads based on current range filter */
  const loadLeads = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const url = rangeFilter
        ? `/api/statuses?range=${encodeURIComponent(rangeFilter)}`
        : "/api/statuses";
      const response = await fetch(url);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to load: ${response.status}`);
      }
      const data = await response.json();
      // Response now includes { leads, _traces } - extract leads array
      setLeads(data.leads || data);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to load leads";
      setError(errorMsg);
      console.error("Error loading statuses:", err);
    } finally {
      setLoading(false);
    }
  }, [rangeFilter]);

  // Load leads on mount and when range filter changes
  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  /** Open editor for a specific lead */
  const openEditor = async (leadKey: string) => {
    setView("editor");
    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      const response = await fetch(`/api/statuses/edit?leadKey=${encodeURIComponent(leadKey)}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to load: ${response.status}`);
      }
      const data = await response.json();
      setEditorData(data);
      setFields({
        city: "",
        "only-friends": false,
        "her-first-msg": false,
        "your-first-message": false,
        "writing-deadline": "2099-01-01",
        "priority-today": 0,
      });

      // Parse existing status body if present
      if (data.statusBody) {
        const parsed = parseStatusBody(data.statusBody);
        setFields({
          city: parsed.city || "",
          "only-friends": parsed["only-friends"] === "true",
          "her-first-msg": parsed["her-first-msg"] === "true",
          "your-first-message": parsed["your-first-message"] === "true",
          "writing-deadline": parsed["writing-deadline"] || "2099-01-01",
          "priority-today": parseInt(parsed["priority-today"] || "0", 10),
        });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to load editor";
      setError(errorMsg);
      console.error("Error loading editor:", err);
    } finally {
      setSaving(false);
    }
  };

  /** Close editor and return to list */
  const closeEditor = () => {
    setView("list");
    setEditorData(null);
    setFields(null);
    setSaved(false);
    loadLeads(); // Refresh the list
  };

  /** Save the status */
  const handleSave = async () => {
    if (!editorData || !fields) return;

    setSaving(true);
    setSaved(false);

    try {
      // If status is missing, create it first
      if (editorData.statusCategory === "missing") {
        await fetch("/api/statuses/edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadKey: editorData.leadKey,
            createDefault: true,
          }),
        });
      }

      // Save the fields
      const response = await fetch("/api/statuses/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadKey: editorData.leadKey,
          fields,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to save: ${response.status}`);
      }

      setSaved(true);
      
      // Refresh editor data to show updated status
      const updatedResponse = await fetch(`/api/statuses/edit?leadKey=${encodeURIComponent(editorData.leadKey)}`);
      if (updatedResponse.ok) {
        const updatedData = await updatedResponse.json();
        setEditorData(updatedData);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to save";
      setError(errorMsg);
      console.error("Error saving status:", err);
    } finally {
      setSaving(false);
    }
  };

  /** Update a field value */
  const updateField = (key: keyof StatusFields, value: string | number | boolean) => {
    if (!fields) return;
    setFields({ ...fields, [key]: value });
    setSaved(false);
  };

  /** Parse YAML-like status body */
  function parseStatusBody(body: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const line of body.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const colonIndex = trimmed.indexOf(":");
      if (colonIndex === -1) continue;
      const key = trimmed.slice(0, colonIndex).trim();
      const value = trimmed.slice(colonIndex + 1).trim();
      if (key) result[key] = value;
    }
    return result;
  }

  /** Parse status body into StatusFields */
  function parseToStatusFields(body: string): StatusFields {
    const parsed = parseStatusBody(body);
    return {
      city: parsed.city || "",
      "only-friends": parsed["only-friends"] === "true",
      "her-first-msg": parsed["her-first-msg"] === "true",
      "your-first-message": parsed["your-first-message"] === "true",
      "writing-deadline": parsed["writing-deadline"] || "2099-01-01",
      "priority-today": parseInt(parsed["priority-today"] || "0", 10),
    };
  }

  /** Check if a row has changes */
  const hasRowChanges = useCallback((leadKey: string): boolean => {
    const original = originalMatrixData.get(leadKey);
    const current = matrixData.get(leadKey);
    if (!original || !current) return false;
    return (
      original.city !== current.city ||
      original["only-friends"] !== current["only-friends"] ||
      original["her-first-msg"] !== current["her-first-msg"] ||
      original["your-first-message"] !== current["your-first-message"] ||
      original["writing-deadline"] !== current["writing-deadline"] ||
      original["priority-today"] !== current["priority-today"]
    );
  }, [originalMatrixData, matrixData]);

  /** Initialize matrix data from leads */
  useEffect(() => {
    if (leads.length > 0 && mode === "matrix") {
      const newMap = new Map<string, StatusFields>();
      const originalMap = new Map<string, StatusFields>();
      for (const lead of leads) {
        const fields = lead.statusBody ? parseToStatusFields(lead.statusBody) : {
          city: "",
          "only-friends": false,
          "her-first-msg": false,
          "your-first-message": false,
          "writing-deadline": "2099-01-01",
          "priority-today": 0,
        };
        newMap.set(lead.leadKey, fields);
        originalMap.set(lead.leadKey, { ...fields });
      }
      setMatrixData(newMap);
      setOriginalMatrixData(originalMap);
    }
  }, [leads, mode]);

  /** Update a matrix cell value */
  const updateMatrixCell = (leadKey: string, key: keyof StatusFields, value: string | number | boolean) => {
    setMatrixData((prev) => {
      const newMap = new Map(prev);
      const current = newMap.get(leadKey) || {
        city: "",
        "only-friends": false,
        "her-first-msg": false,
        "your-first-message": false,
        "writing-deadline": "2099-01-01",
        "priority-today": 0,
      };
      newMap.set(leadKey, { ...current, [key]: value });
      return newMap;
    });
    setMatrixSaved(false);
    setMatrixError(null);
  };

  /** Filter leads for matrix view */
  const visibleLeads = useMemo(() => {
    if (!nameFilter.trim()) return leads;
    const filter = nameFilter.toLowerCase().trim();
    return leads.filter((lead) => {
      // Filter by lead name
      if (lead.leadName.toLowerCase().includes(filter)) return true;
      // Filter by lead key
      if (lead.leadKey.includes(filter)) return true;
      // Filter by status body values
      if (lead.statusBody && lead.statusBody.toLowerCase().includes(filter)) return true;
      return false;
    });
  }, [leads, nameFilter]);

  // ------------------------------------------------------------------
  // Standardized toolbar controls — identical order in both modes:
  // [mode combobox] [numeric range filter] [name filter]
  // ------------------------------------------------------------------

  /** Mode combobox — always first, left-aligned. */
  const modeSelect = (
    <Select value={mode} onValueChange={(v) => setMode(v as ViewMode)}>
      <SelectTrigger className="w-[130px]">
        <SelectValue placeholder="Select mode" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="matrix">Matrix</SelectItem>
        <SelectItem value="migration">Migration</SelectItem>
      </SelectContent>
    </Select>
  );

  /**
   * Numeric range filter (server-side). Convention:
   *   -10  → last 10 · 10 → first 10 · 1-3 → items 1..3 · 1,2,3 → items 1,2,3
   * Small: ~5 digits wide. Applies on Enter.
   */
  const numericRangeInput = (
    <Input
      value={rangeFilter}
      onChange={(e) => setRangeFilter(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          loadLeads();
        }
      }}
      placeholder="-10"
      title="Zakres: -10 = ostatnie 10, 10 = pierwsze 10, 1-3 = od 1 do 3, 1,2,3 = wybrane"
      inputMode="numeric"
      className="w-16 text-center"
    />
  );

  /** Name filter (client-side). */
  const nameFilterInput = (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        value={nameFilter}
        onChange={(e) => setNameFilter(e.target.value)}
        placeholder="Filtruj po nazwie..."
        className="w-[180px] pl-8"
      />
    </div>
  );

  /** Save all matrix changes */
  const saveMatrixChanges = async () => {
    setMatrixSaving(true);
    setMatrixSaved(false);
    setMatrixError(null);

    try {
      const savePromises = visibleLeads.map(async (lead) => {
        const fields = matrixData.get(lead.leadKey);
        if (!fields) return;

        // If status is missing, create it first
        if (lead.statusCategory === "missing") {
          await fetch("/api/statuses/edit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              leadKey: lead.leadKey,
              createDefault: true,
            }),
          });
        }

        // Save the fields
        const response = await fetch("/api/statuses/edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadKey: lead.leadKey,
            fields,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`Failed to save ${lead.leadName}: ${errorData.error || response.status}`);
        }
      });

      await Promise.all(savePromises);
      setMatrixSaved(true);
      loadLeads(); // Refresh the list
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to save matrix changes";
      setMatrixError(errorMsg);
      console.error("Error saving matrix:", err);
    } finally {
      setMatrixSaving(false);
    }
  };

  /** Save a single row */
  const saveRow = async (lead: StatusLeadItem) => {
    const fields = matrixData.get(lead.leadKey);
    if (!fields) return;

    // Set saving state for this row
    setRowSavingStates((prev) => new Map(prev).set(lead.leadKey, { saving: true, saved: false }));

    try {
      // If status is missing, create it first
      if (lead.statusCategory === "missing") {
        await fetch("/api/statuses/edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadKey: lead.leadKey,
            createDefault: true,
          }),
        });
      }

      // Save the fields
      const response = await fetch("/api/statuses/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadKey: lead.leadKey,
          fields,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to save: ${response.status}`);
      }

      // Update original data to match current
      setOriginalMatrixData((prev) => {
        const newMap = new Map(prev);
        newMap.set(lead.leadKey, { ...fields });
        return newMap;
      });

      // Show saved state
      setRowSavingStates((prev) => new Map(prev).set(lead.leadKey, { saving: false, saved: true }));

      // Clear saved state after 2 seconds
      setTimeout(() => {
        setRowSavingStates((prev) => {
          const newMap = new Map(prev);
          newMap.set(lead.leadKey, { saving: false, saved: false });
          return newMap;
        });
      }, 2000);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to save";
      console.error(`Error saving row ${lead.leadKey}:`, errorMsg);
      setRowSavingStates((prev) => new Map(prev).set(lead.leadKey, { saving: false, saved: false }));
    }
  };

  // ========================================================================
  // Render
  // ========================================================================

  if (view === "editor" && editorData) {
    return (
      <DashboardPageShell
        contentClassName={FRAME_SECTION_GAP_CLASS}
        upLevel={{ onClick: closeEditor, label: "Back to list" }}
        title="STATUSES"
      >
            {/* Top frame: Save/Cancel + lead identity, left-aligned (Story 62
                standard: save controls at the top). */}
            <div className={cn("flex flex-wrap items-center gap-3 rounded-lg border bg-muted/10", SAVE_FRAME_PADDING_CLASS)}>
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </Button>
              <Button variant="outline" onClick={closeEditor} className="gap-2">
                <X className="h-4 w-4" />
                Cancel
              </Button>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-semibold">
                  {editorData.leadName}
                </h3>
                <span className="text-sm text-muted-foreground font-mono">
                  {editorData.statusLoca}
                </span>
                <Badge className={STATUS_COLORS[editorData.statusCategory]}>
                  {STATUS_LABELS[editorData.statusCategory]}
                </Badge>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="flex items-center gap-2 text-red-500 bg-red-50 p-3 rounded-lg">
                <AlertCircle className="h-4 w-4" />
                <span>{error}</span>
              </div>
            )}

            {/* Success message */}
            {saved && (
              <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-lg">
                <CheckCircle2 className="h-4 w-4" />
                <span>Saved!</span>
              </div>
            )}

            {/* Fields, in their own inner frame */}
            {fields && (
              <div className="max-w-md space-y-4 rounded-lg border bg-muted/10 p-4">
                {/* city */}
                <div>
                  <label className="block text-sm font-medium mb-1">City</label>
                  <Input
                    value={fields.city}
                    onChange={(e) => updateField("city", e.target.value)}
                    placeholder="Enter city"
                  />
                </div>

                {/* only-friends */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="only-friends"
                    checked={fields["only-friends"]}
                    onChange={(e) => updateField("only-friends", e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <label htmlFor="only-friends" className="text-sm font-medium">
                    Only friends
                  </label>
                </div>

                {/* her-first-msg */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="her-first-msg"
                    checked={fields["her-first-msg"]}
                    onChange={(e) => updateField("her-first-msg", e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <label htmlFor="her-first-msg" className="text-sm font-medium">
                    Her first message
                  </label>
                </div>

                {/* your-first-message */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="your-first-message"
                    checked={fields["your-first-message"]}
                    onChange={(e) => updateField("your-first-message", e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <label htmlFor="your-first-message" className="text-sm font-medium">
                    Your first message
                  </label>
                </div>

                {/* writing-deadline */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Writing deadline
                  </label>
                  <Input
                    type="date"
                    value={fields["writing-deadline"]}
                    onChange={(e) => updateField("writing-deadline", e.target.value)}
                  />
                </div>

                {/* priority-today */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Priority today (0-30)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    max="30"
                    value={fields["priority-today"]}
                    onChange={(e) => updateField("priority-today", parseInt(e.target.value, 10) || 0)}
                  />
                </div>
              </div>
            )}
      </DashboardPageShell>
    );
  }

  // ========================================================================
  // Render - Matrix Mode
  // ========================================================================

  if (mode === "matrix") {
    return (
      <DashboardPageShell
        scroll={false}
        contentClassName={FRAME_SECTION_GAP_CLASS}
        title="STATUSES"
      >
        {/* Page-specific controls now live inside the main frame, not above
            it (Story 62 Round 3: toolbarSecondRow floated disconnected from
            the frame it controls — moved in, standard gap below). */}
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          {modeSelect}
          {numericRangeInput}
          {nameFilterInput}
          {matrixSaved && (
            <span className="text-sm text-green-600 flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4" />
              Saved!
            </span>
          )}
          {matrixError && (
            <span className="text-sm text-red-500 flex items-center gap-1">
              <AlertCircle className="h-4 w-4" />
              {matrixError}
            </span>
          )}
          <span className="ml-auto text-sm text-muted-foreground">
            {visibleLeads.length} of {leads.length} leads
          </span>
        </div>

        {/* Main Content - Matrix Table, in its own inner frame (Story 62). */}
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Loading leads...</span>
          </div>
        ) : visibleLeads.length === 0 ? (
          <div className="flex items-center gap-3 py-4 text-muted-foreground">
            <User className="h-8 w-8 opacity-20" />
            <span className="text-sm">No leads found</span>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto overscroll-contain rounded-lg border bg-muted/10">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-muted sticky top-0 z-10">
                    <tr>
                      <th className="border p-1 text-center font-medium text-muted-foreground w-[50px]">
                        {/* Save button in table header - left corner */}
                        <Button
                          onClick={saveMatrixChanges}
                          disabled={matrixSaving}
                          className="h-6 w-6 p-0"
                          size="sm"
                          title="Save all changes"
                        >
                          {matrixSaving ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Save className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </th>
                      <th className="border p-1 text-left font-medium text-muted-foreground">
                        Lead
                      </th>
                      <th className="border p-1 text-left font-medium text-muted-foreground w-[120px]">
                        City
                      </th>
                      <th className="border p-1 text-center font-medium text-muted-foreground w-[70px]">
                        Only Friends
                      </th>
                      <th className="border p-1 text-center font-medium text-muted-foreground w-[70px]">
                        Her Msg
                      </th>
                      <th className="border p-1 text-center font-medium text-muted-foreground w-[70px]">
                        Your Msg
                      </th>
                      <th className="border p-1 text-center font-medium text-muted-foreground w-[110px]">
                        Writing Deadline
                      </th>
                      <th className="border p-1 text-center font-medium text-muted-foreground w-[55px]">
                        Priority
                      </th>
                      <th className="border p-1 text-center font-medium text-muted-foreground w-[70px]">
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleLeads.map((lead) => {
                      const fields = matrixData.get(lead.leadKey) || {
                        city: "",
                        "only-friends": false,
                        "her-first-msg": false,
                        "your-first-message": false,
                        "writing-deadline": "2099-01-01",
                        "priority-today": 0,
                      };
                      const rowState = rowSavingStates.get(lead.leadKey) || { saving: false, saved: false };
                      const isDirty = hasRowChanges(lead.leadKey);

                      return (
                        <tr key={lead.leadKey} className="hover:bg-accent/50">
                          {/* Save button */}
                          <td className="border p-1 text-center align-middle">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                size="sm"
                                variant={isDirty ? "destructive" : "default"}
                                disabled={rowState.saving}
                                onClick={() => saveRow(lead)}
                                className="h-7 w-7 p-0"
                                title={isDirty ? "Save changes" : "No changes"}
                              >
                                {rowState.saving ? (
                                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                ) : rowState.saved ? (
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                ) : (
                                  <Save className="h-3.5 w-3.5" />
                                )}
                              </Button>
                              {rowState.saved && (
                                <span className="text-[10px] text-green-600">saved</span>
                              )}
                            </div>
                          </td>

                          {/* Lead name - clickable link to lead info */}
                          <td className="border p-1 px-2 align-middle">
                            {lead.leadLoca ? (
                              <Link
                                href={buildLeadDetailsHref({
                                  leadName: lead.leadName,
                                  leadLoca: lead.leadLoca,
                                  returnTo: `${pathname}?mode=matrix${nameFilter ? `&filter=${encodeURIComponent(nameFilter)}` : ''}`,
                                })}
                                className="text-sm font-medium truncate block hover:text-primary hover:underline"
                                title={lead.leadName}
                              >
                                {lead.leadName}
                              </Link>
                            ) : (
                              <span className="text-sm font-medium truncate block" title={lead.leadName}>
                                {lead.leadName}
                              </span>
                            )}
                          </td>

                          {/* City - editable combobox with datalist */}
                          <td className="border p-1 px-2 align-middle">
                            <Input
                              value={fields.city}
                              onChange={(e) =>
                                updateMatrixCell(lead.leadKey, "city", e.target.value)
                              }
                              placeholder="City"
                              className="h-7 text-sm w-full"
                              list={`city-list-${lead.leadKey}`}
                            />
                            <datalist id={`city-list-${lead.leadKey}`}>
                              {CITY_OPTIONS.map((city) => (
                                <option key={city} value={city} />
                              ))}
                            </datalist>
                          </td>

                          {/* Only Friends - boolean combobox */}
                          <td className="border p-1 text-center align-middle">
                            <Select
                              value={fields["only-friends"] ? "true" : "false"}
                              onValueChange={(v) =>
                                updateMatrixCell(lead.leadKey, "only-friends", v === "true")
                              }
                            >
                              <SelectTrigger className="h-7 w-full text-xs" size="sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="false">false</SelectItem>
                                <SelectItem value="true">true</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>

                          {/* Her First Msg - boolean combobox */}
                          <td className="border p-1 text-center align-middle">
                            <Select
                              value={fields["her-first-msg"] ? "true" : "false"}
                              onValueChange={(v) =>
                                updateMatrixCell(lead.leadKey, "her-first-msg", v === "true")
                              }
                            >
                              <SelectTrigger className="h-7 w-full text-xs" size="sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="false">false</SelectItem>
                                <SelectItem value="true">true</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>

                          {/* Your First Msg - boolean combobox */}
                          <td className="border p-1 text-center align-middle">
                            <Select
                              value={fields["your-first-message"] ? "true" : "false"}
                              onValueChange={(v) =>
                                updateMatrixCell(lead.leadKey, "your-first-message", v === "true")
                              }
                            >
                              <SelectTrigger className="h-7 w-full text-xs" size="sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="false">false</SelectItem>
                                <SelectItem value="true">true</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>

                          {/* Writing Deadline - date input */}
                          <td className="border p-1 text-center align-middle">
                            <Input
                              type="date"
                              value={fields["writing-deadline"]}
                              onChange={(e) =>
                                updateMatrixCell(lead.leadKey, "writing-deadline", e.target.value)
                              }
                              className="h-7 text-xs w-full"
                            />
                          </td>

                          {/* Priority - number input with datalist */}
                          <td className="border p-1 text-center align-middle">
                            <Input
                              type="number"
                              min="0"
                              max="30"
                              value={fields["priority-today"]}
                              onChange={(e) =>
                                updateMatrixCell(lead.leadKey, "priority-today", parseInt(e.target.value, 10) || 0)
                              }
                              className="h-7 text-xs w-full"
                              list={`priority-list-${lead.leadKey}`}
                            />
                            <datalist id={`priority-list-${lead.leadKey}`}>
                              {PRIORITY_OPTIONS.filter((_, i) => i % 5 === 0).map((p) => (
                                <option key={p} value={p} />
                              ))}
                            </datalist>
                          </td>
                          {/* Empty cell to fill remaining space */}
                          <td className="border p-1"></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
      </DashboardPageShell>
    );
  }

  // ========================================================================
  // Render - Migration Mode (existing list view)
  // ========================================================================

  return (
    <DashboardPageShell
      title="STATUSES"
      contentClassName={FRAME_SECTION_GAP_CLASS}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        {modeSelect}
        {numericRangeInput}
        {nameFilterInput}
        <span className="ml-auto text-sm text-muted-foreground">
          {visibleLeads.length} of {leads.length} leads
        </span>
      </div>

      {/* Main Content, in its own inner frame (Story 62). */}
      <div className="rounded-lg border bg-muted/10 p-2">
      {loading ? (
        <div className="flex items-center gap-2 py-4 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Loading leads...</span>
        </div>
      ) : error ? (
        <div className="flex flex-col items-start gap-2 py-4 text-muted-foreground">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-6 w-6" />
            <span>{error}</span>
          </div>
          <button
            onClick={loadLeads}
            className="text-sm text-primary hover:underline"
          >
            Retry
          </button>
        </div>
      ) : visibleLeads.length === 0 ? (
        <div className="flex items-center gap-3 py-4 text-muted-foreground">
          <User className="h-8 w-8 opacity-20" />
          <span className="text-sm">No leads found</span>
        </div>
      ) : (
        <div className="divide-y">
              {visibleLeads.map((lead) => (
                <div
                  key={lead.leadKey}
                  className="flex items-center rounded-lg px-[10px] py-[10px] transition-colors group hover:bg-accent"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => openEditor(lead.leadKey)}
                      className="flex flex-shrink-0 items-center gap-2 rounded-lg"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <User className="h-3.5 w-3.5" />
                      </span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {lead.leadKey}.
                      </span>
                    </button>
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="truncate text-sm font-medium select-text">
                        {lead.leadName}
                      </span>
                      {lead.leadLoca && (
                        <Link
                          href={buildLeadDetailsHref({
                            leadName: lead.leadName,
                            leadLoca: lead.leadLoca,
                            returnTo,
                          })}
                          className="text-xs text-primary underline underline-offset-4"
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          info
                        </Link>
                      )}
                      <Badge
                        variant="secondary"
                        className={`text-xs ${STATUS_COLORS[lead.statusCategory]} text-white`}
                      >
                        {STATUS_LABELS[lead.statusCategory]}
                      </Badge>
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
