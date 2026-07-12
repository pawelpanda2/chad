"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TextEditorWithToolbar } from "@/components/shared/text-editor-with-toolbar";
import { EditorPageShell } from "@/components/shared/editor-page-shell";
import { ArrowLeft, AlertCircle, Loader2, FileText } from "lucide-react";

// ============================================================================
// Types
// ============================================================================

interface MsgWorkoutDetailsData {
  workoutName: string;
  leadName: string;
  leadLoca: string;
  workoutLoca: string;
  body: string;
}

// ============================================================================
// Main Component
// ============================================================================

export default function MsgWorkoutDetailsPage() {
  return (
    <Suspense fallback={null}>
      <MsgWorkoutDetailsPageContent />
    </Suspense>
  );
}

function MsgWorkoutDetailsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get params from URL
  const leadName = searchParams.get("leadName");
  const leadLoca = searchParams.get("leadLoca");
  const workoutName = searchParams.get("workoutName");
  const workoutLoca = searchParams.get("workoutLoca");

  // State
  const [data, setData] = useState<MsgWorkoutDetailsData | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Load msg workout data */
  const loadData = useCallback(async () => {
    if (!workoutLoca) {
      setError("Missing workout location information");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/leads/msg-workout?workoutLoca=${encodeURIComponent(workoutLoca)}&leadName=${encodeURIComponent(leadName || "")}&leadLoca=${encodeURIComponent(leadLoca || "")}&workoutName=${encodeURIComponent(workoutName || "")}`
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to load: ${response.status}`);
      }
      const data: MsgWorkoutDetailsData = await response.json();
      setData(data);
      setContent(data.body);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to load msg workout";
      setError(errorMsg);
      console.error(`Error loading msg workout for loca=${workoutLoca}:`, err);
    } finally {
      setLoading(false);
    }
  }, [workoutLoca, leadName, leadLoca, workoutName]);

  // Load data on mount or when workoutLoca changes
  useEffect(() => {
    loadData();
  }, [loadData]);

  /** Handle save */
  const handleSave = async () => {
    if (!workoutLoca) return;

    setSaving(true);
    setSaved(false);
    try {
      const response = await fetch("/api/leads/msg-workout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workoutLoca,
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

  /** Handle back button - return to lead details */
  const handleBack = () => {
    if (leadName && leadLoca) {
      router.push(`/dashboard/leads/details?leadName=${encodeURIComponent(leadName)}&leadLoca=${encodeURIComponent(leadLoca)}`);
    } else {
      router.push("/dashboard/views?view=leads");
    }
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
        <Button onClick={handleBack} variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to lead
        </Button>
      </div>
    );
  }

  return (
    <EditorPageShell>
      {/* Compact Header with back button and label */}
      <div className="flex shrink-0 items-center gap-2">
        <Button
          onClick={handleBack}
          variant="outline"
          size="icon"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="shrink-0 font-semibold">Msg Workout</span>
          {data?.workoutName && (
            <span className="truncate text-sm text-muted-foreground">
              — {data.workoutName}
            </span>
          )}
          {data?.leadName && (
            <span className="truncate text-sm text-muted-foreground">
              ({data.leadName})
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