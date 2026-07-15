"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TextEditorWithToolbar } from "@/components/shared/text-editor-with-toolbar";
import { EditorPageShell } from "@/components/shared/editor-page-shell";
import { BackButton } from "@/components/shared/back-button";
import { NavGroup } from "@/components/shared/nav-group";
import { AlertCircle, Loader2 } from "lucide-react";

// ============================================================================
// Types
// ============================================================================

interface MsgWorkoutEditorData {
  leadName: string;
  address: string;
  body: string;
}

// ============================================================================
// Main Component
// ============================================================================

export default function TextEditorPage() {
  return (
    <Suspense fallback={null}>
      <TextEditorPageContent />
    </Suspense>
  );
}

function TextEditorPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const loca = searchParams.get("loca");

  // State
  const [data, setData] = useState<MsgWorkoutEditorData | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Load msg workout data */
  const loadData = useCallback(async () => {
    if (!loca) {
      setError("Missing loca parameter");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/todo-msg/edit?loca=${encodeURIComponent(loca)}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to load: ${response.status}`);
      }
      const data: MsgWorkoutEditorData = await response.json();
      setData(data);
      setContent(data.body);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to load msg workout";
      setError(errorMsg);
      console.error(`Error loading msg workout for loca=${loca}:`, err);
    } finally {
      setLoading(false);
    }
  }, [loca]);

  // Load data on mount or when loca changes
  useEffect(() => {
    loadData();
  }, [loadData]);

  /** Handle save */
  const handleSave = async () => {
    if (!loca) return;

    setSaving(true);
    setSaved(false);
    try {
      const response = await fetch("/api/todo-msg/edit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          loca,
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
      console.error("Error saving msg workout:", err);
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

  /** Handle back button */
  const handleBack = () => {
    router.push("/dashboard/todo-msg");
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

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground text-center max-w-md">{error}</p>
        <BackButton onClick={handleBack} label="Back to list" className="ml-0" />
      </div>
    );
  }

  return (
    <EditorPageShell>
      {/* Compact Header with back button and label. pl-14 reserves the
          top-left slot for the fixed menu handle. */}
      <div className="flex shrink-0 items-center gap-2 pl-14">
        <NavGroup upLevel={{ onClick: handleBack, label: "Back to list" }} />
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 font-semibold">
            Text Editor
          </span>
          {data?.address && (
            <span className="truncate text-sm text-muted-foreground">
              {data.address}
            </span>
          )}
        </div>
      </div>

      {/* Editor with toolbar - fills remaining viewport height */}
      <TextEditorWithToolbar
        value={content}
        onChange={handleContentChange}
        onSave={handleSave}
        saving={saving}
        saved={saved}
        placeholder="Enter msg workout content..."
      />
    </EditorPageShell>
  );
}