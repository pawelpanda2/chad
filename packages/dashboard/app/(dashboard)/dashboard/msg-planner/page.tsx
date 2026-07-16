"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, AlertCircle, Loader2, Plus, X } from "lucide-react";
import { TextEditorWithToolbar } from "@/components/shared/text-editor-with-toolbar";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { FRAME_SECTION_GAP_CLASS } from "@/components/shared/layout-tokens";

// ============================================================================
// Types
// ============================================================================

interface DateFolder {
  date: string;
  loca: string;
}

interface BodyData {
  date: string;
  loca: string;
  body: string;
}

// ============================================================================
// Main Component
// ============================================================================

export default function MsgPlannerPage() {
  // State
  const [dateFolders, setDateFolders] = useState<DateFolder[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [bodyData, setBodyData] = useState<BodyData | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // New date folder creation state
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [newDateValue, setNewDateValue] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  /** Load available date folders */
  const loadDateFolders = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/msg-planner");
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to load: ${response.status}`);
      }
      const data: DateFolder[] = await response.json();
      setDateFolders(data);

      // Auto-select first date if available
      if (data.length > 0 && !selectedDate) {
        setSelectedDate(data[0].date);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to load date folders";
      setError(errorMsg);
      console.error("Error loading date folders:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  /** Load body content for selected date */
  const loadBodyContent = useCallback(async (date: string) => {
    if (!date) return;

    setSaved(false);

    try {
      const response = await fetch(`/api/msg-planner?date=${encodeURIComponent(date)}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to load: ${response.status}`);
      }
      const data: BodyData = await response.json();
      setBodyData(data);
      setContent(data.body);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to load body content";
      setError(errorMsg);
      console.error(`Error loading body for date=${date}:`, err);
    }
  }, []);

  /** Get today's date in YY-MM-DD format */
  const getTodayDate = useCallback(() => {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  /** Open create panel with default date */
  const openCreatePanel = useCallback(() => {
    setNewDateValue(getTodayDate());
    setShowCreatePanel(true);
    setCreateError(null);
  }, [getTodayDate]);

  /** Close create panel */
  const closeCreatePanel = useCallback(() => {
    setShowCreatePanel(false);
    setNewDateValue("");
    setCreateError(null);
  }, []);

  /** Create new date folder */
  const handleCreate = useCallback(async () => {
    if (!newDateValue.trim()) {
      setCreateError("Date cannot be empty");
      return;
    }

    setCreating(true);
    setCreateError(null);

    try {
      const response = await fetch("/api/msg-planner", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "create",
          date: newDateValue.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to create: ${response.status}`);
      }

      // Success - refresh the list and close panel
      closeCreatePanel();
      await loadDateFolders();
      
      // Auto-select the newly created date
      const newFolders = await fetch("/api/msg-planner").then(r => r.json());
      const newFolder = newFolders.find((f: DateFolder) => f.date === newDateValue.trim());
      if (newFolder) {
        setSelectedDate(newFolder.date);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to create date folder";
      setCreateError(errorMsg);
      console.error("Error creating date folder:", err);
    } finally {
      setCreating(false);
    }
  }, [newDateValue, closeCreatePanel, loadDateFolders]);

  // Load date folders on mount
  useEffect(() => {
    loadDateFolders();
  }, [loadDateFolders]);

  // Load body when selected date changes
  useEffect(() => {
    if (selectedDate) {
      loadBodyContent(selectedDate);
    }
  }, [selectedDate, loadBodyContent]);

  /** Handle save */
  const handleSave = async () => {
    if (!bodyData) return;

    setSaving(true);
    setSaved(false);

    try {
      const response = await fetch("/api/msg-planner", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: bodyData.date,
          loca: bodyData.loca,
          content,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to save: ${response.status}`);
      }

      // Show "Saved" message
      setSaved(true);
      // Auto-hide after 3 seconds
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to save";
      setError(errorMsg);
      console.error("Error saving body:", err);
    } finally {
      setSaving(false);
    }
  };

  /** Handle content change - hide saved indicator when user edits */
  const handleContentChange = (value: string) => {
    setContent(value);
    if (saved) {
      setSaved(false);
    }
  };

  /** Handle date change */
  const handleDateChange = (date: string) => {
    setSelectedDate(date);
  };

  // ========================================================================
  // Render
  // ========================================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (error && dateFolders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground text-center max-w-md">{error}</p>
        <Button onClick={loadDateFolders} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <DashboardPageShell
      scroll={false}
      contentClassName={FRAME_SECTION_GAP_CLASS}
      title="MSG PLANNER"
    >
      {/* Page-specific controls live inside the main frame (Story 62 Round 3). */}
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Select value={selectedDate} onValueChange={handleDateChange}>
          <SelectTrigger className="w-[160px] h-8">
            <SelectValue placeholder="Select date" />
          </SelectTrigger>
          <SelectContent>
            {dateFolders.map((folder) => (
              <SelectItem key={folder.date} value={folder.date}>
                {folder.date}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          onClick={openCreatePanel}
          variant="outline"
          size="sm"
          className="h-8"
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          new
        </Button>

        <button
          onClick={loadDateFolders}
          disabled={loading}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 h-8"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Editor with toolbar - fills remaining viewport height. Already
          reads as the inner frame (rounded-xl border bg-card, per
          text-editor-with-toolbar.tsx) inside the shell's own outer frame. */}
      <TextEditorWithToolbar
        value={content}
        onChange={handleContentChange}
        onSave={handleSave}
        saving={saving}
        saved={saved}
        placeholder="Enter msg planner content..."
        className="h-auto min-h-0 flex-1"
      />

      {/* Create Panel */}
      {showCreatePanel && (
        <div className="flex shrink-0 items-center gap-2 px-4 py-2 bg-muted/30 border-t">
          <Input
            value={newDateValue}
            onChange={(e) => {
              setNewDateValue(e.target.value);
              setCreateError(null);
            }}
            placeholder="YY-MM-DD"
            className="w-[120px] h-8"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCreate();
              } else if (e.key === 'Escape') {
                closeCreatePanel();
              }
            }}
            autoFocus
          />
          <Button
            onClick={handleCreate}
            disabled={creating}
            size="sm"
            className="h-8"
          >
            {creating ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Creating</>
            ) : (
              <><Plus className="h-3.5 w-3.5 mr-1" />create</>
            )}
          </Button>
          <Button
            onClick={closeCreatePanel}
            variant="ghost"
            size="sm"
            className="h-8"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
          {createError && (
            <span className="text-xs text-destructive">{createError}</span>
          )}
        </div>
      )}
    </DashboardPageShell>
  );
}