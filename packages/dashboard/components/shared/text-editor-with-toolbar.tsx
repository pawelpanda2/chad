"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BodyTextEditor } from "@/components/shared/body-text-editor";
import { PreviewContent } from "@/components/shared/headers-renderer";
import { Save, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

export interface TextEditorWithToolbarProps {
  /** Current content value */
  value: string;
  /** Callback when content changes */
  onChange: (value: string) => void;
  /** Callback to trigger save */
  onSave: () => void;
  /** Whether save is in progress */
  saving: boolean;
  /** Whether content was just saved */
  saved: boolean;
  /** Whether to show the Preview/Editor tabs */
  showPreview?: boolean;
  /** Whether to show the Save button */
  showSave?: boolean;
  /** Whether to show the WCH (whitespace toggle) button */
  showWhitespaceToggle?: boolean;
  /** Placeholder text for the editor */
  placeholder?: string;
  /** Additional content to show in the toolbar (after the main buttons) */
  toolbarExtra?: React.ReactNode;
  /** Custom CSS class for the container */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Shared text editor component with toolbar above the content area.
 *
 * Layout:
 * ```
 * [Preview|Editor tabs] [Save] [WCH] [extra]
 * --------------------------------
 * [Preview content OR Editor]
 * ```
 *
 * Features:
 * - Toolbar is always above the content area (never inside CodeMirror or tabs)
 * - WCH button toggles whitespace visibility in the editor
 * - Preview/Editor tabs switch between rendered view and raw editing
 * - Save button with loading and success states
 * - Save and WCH are only visible in Editor mode
 * - Configurable via props for different use cases
 */
export function TextEditorWithToolbar({
  value,
  onChange,
  onSave,
  saving,
  saved,
  showPreview = true,
  showSave = true,
  showWhitespaceToggle = true,
  placeholder = "Enter content...",
  toolbarExtra,
  className,
}: TextEditorWithToolbarProps) {
  const [activeTab, setActiveTab] = useState<"preview" | "editor">("preview");
  const [showWhitespace, setShowWhitespace] = useState(false);

  const isEditorMode = activeTab === "editor";

  const handleContentChange = useCallback(
    (newValue: string) => {
      onChange(newValue);
    },
    [onChange]
  );

  const handleSaveShortcut = useCallback(() => {
    onSave();
  }, [onSave]);

  return (
    <div
      className={cn(
        // Looks and behaves like the standard frame (DashboardPageShell): a
        // rounded, bordered card that fills its area with only internal scroll.
        "flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card",
        className,
      )}
    >
      {/* Toolbar — buttons above the content; wraps on narrow (phone) widths */}
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b">
        {showPreview && (
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as "preview" | "editor")}
            className="shrink-0"
          >
            {/* Segmented control matching the rest of the site (no icons). */}
            <TabsList className="h-8 gap-1 rounded-lg border bg-card p-1">
              <TabsTrigger
                value="preview"
                className="h-6 rounded-md px-3 text-xs font-medium text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
              >
                Preview
              </TabsTrigger>
              <TabsTrigger
                value="editor"
                className="h-6 rounded-md px-3 text-xs font-medium text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
              >
                Editor
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {showSave && isEditorMode && (
          <Button
            onClick={onSave}
            disabled={saving}
            size="sm"
            className="h-8 shrink-0"
          >
            {saving ? (
              <>{<Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}Saving</>
            ) : (
              <>{<Save className="h-3.5 w-3.5 mr-1.5" />}Save</>
            )}
          </Button>
        )}

        {showWhitespaceToggle && isEditorMode && (
          <Button
            onClick={() => setShowWhitespace(!showWhitespace)}
            variant={showWhitespace ? "default" : "outline"}
            size="sm"
            className="h-8 shrink-0 font-mono text-xs"
            title="Toggle whitespace characters"
          >
            WCH
          </Button>
        )}

        {saved && isEditorMode && (
          <span className="shrink-0 text-sm text-green-600 dark:text-green-500">
            Saved
          </span>
        )}

        {toolbarExtra}
      </div>

      {/* Content Area - fills remaining height */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {showPreview ? (
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as "preview" | "editor")}
            className="h-full flex flex-col"
          >
            <TabsContent
              value="preview"
              className="flex-1 min-h-0 m-0 p-0 overflow-hidden"
            >
              <div className="h-full overflow-auto">
                <PreviewContent body={value} />
              </div>
            </TabsContent>

            <TabsContent
              value="editor"
              className="flex-1 min-h-0 m-0 p-0 overflow-hidden"
            >
              <BodyTextEditor
                value={value}
                onChange={handleContentChange}
                placeholder={placeholder}
                className="h-full"
                onSaveShortcut={handleSaveShortcut}
                showWhitespace={showWhitespace}
              />
            </TabsContent>
          </Tabs>
        ) : (
          <BodyTextEditor
            value={value}
            onChange={handleContentChange}
            placeholder={placeholder}
            className="h-full"
            onSaveShortcut={handleSaveShortcut}
            showWhitespace={showWhitespace}
          />
        )}
      </div>
    </div>
  );
}
