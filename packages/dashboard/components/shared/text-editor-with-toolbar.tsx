"use client";

import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BodyTextEditor,
  type BodyTextEditorHandle,
} from "@/components/shared/body-text-editor";
import { PreviewContent } from "@/components/shared/headers-renderer";
import { Loader2, Redo2, Save, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Match Preview/Editor tab trigger size (h-6 + text-xs). */
const toolbarBtnClass =
  "h-6 shrink-0 rounded-md px-3 text-xs font-medium";
const toolbarIconBtnClass =
  "h-6 w-6 shrink-0 rounded-md px-0";

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
  /** Extra condition disabling Save beyond `saving` (e.g. invalid JSON, no changes) — defaults to false, so existing callers are unaffected. */
  saveDisabled?: boolean;
  /** Whether to show the Preview/Editor tabs */
  showPreview?: boolean;
  /** Whether to show the Save button */
  showSave?: boolean;
  /** Whether to show the wch (whitespace toggle) button */
  showWhitespaceToggle?: boolean;
  /**
   * When true, editor helpers (undo/redo/wch/tab) live in a second toolbar
   * row toggled by a compact More button; primary row order becomes
   * Save → More → Preview|Editor. Default false keeps the previous layout
   * (helpers always visible in editor mode inside the frame).
   */
  collapseEditorHelpers?: boolean;
  /** Which tab is active on first mount. Defaults to "preview" — pass
   * "editor" for callers where Preview of a just-created/empty value
   * would be useless (e.g. a freshly created report). */
  defaultTab?: "preview" | "editor";
  /** Placeholder text for the editor */
  placeholder?: string;
  /** Additional content to show in the toolbar (after the main buttons) */
  toolbarExtra?: React.ReactNode;
  /** Custom CSS class for the container */
  className?: string;
}

/**
 * Shared text editor component with toolbar above the content area.
 *
 * Default layout (collapseEditorHelpers=false):
 * ```
 * [Preview|Editor] [Save] [Saved] [extra]
 * ╭ frame ─────────────────────────────╮
 * │ [undo] [redo] [wch] [tab]          │  ← editor mode only
 * │ [Preview content OR Editor]        │
 * ╰────────────────────────────────────╯
 * ```
 *
 * Compact/collapsible layout (collapseEditorHelpers=true):
 * ```
 * [Save] [More] [Preview|Editor] [Saved] [extra]
 * [undo] [redo] [wch] [tab]   ← only when More open + editor mode
 * ╭ frame ─────────────────────────────╮
 * │ [Preview content OR Editor]        │
 * ╰────────────────────────────────────╯
 * ```
 */
export function TextEditorWithToolbar({
  value,
  onChange,
  onSave,
  saving,
  saved,
  saveDisabled = false,
  showPreview = true,
  showSave = true,
  showWhitespaceToggle = true,
  collapseEditorHelpers = false,
  defaultTab = "preview",
  placeholder = "Enter content...",
  toolbarExtra,
  className,
}: TextEditorWithToolbarProps) {
  const [activeTab, setActiveTab] = useState<"preview" | "editor">(defaultTab);
  const [showWhitespace, setShowWhitespace] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const editorRef = useRef<BodyTextEditorHandle | null>(null);

  // showPreview={false} means the editor is the ONLY possible view (there is
  // no Preview tab to switch away from — see the content area below, which
  // renders BodyTextEditor directly, ignoring activeTab, whenever showPreview
  // is false). So "Editor mode" must be true unconditionally in that case;
  // gating it on activeTab alone (which defaults to "preview" unless a caller
  // remembers to also pass defaultTab="editor") silently hid Save/wch/Saved
  // for every showPreview={false} caller that didn't know about that
  // undocumented coupling (Story 98 regression fix).
  const isEditorMode = !showPreview || activeTab === "editor";
  const showHelpersOutside =
    collapseEditorHelpers && moreOpen && isEditorMode;
  const showHelpersInside = !collapseEditorHelpers && isEditorMode;

  const handleContentChange = useCallback(
    (newValue: string) => {
      onChange(newValue);
    },
    [onChange],
  );

  const handleSaveShortcut = useCallback(() => {
    onSave();
  }, [onSave]);

  const handleHistoryChange = useCallback(
    (state: { canUndo: boolean; canRedo: boolean }) => {
      setCanUndo(state.canUndo);
      setCanRedo(state.canRedo);
    },
    [],
  );

  const previewEditorTabs = showPreview ? (
    <Tabs
      value={activeTab}
      onValueChange={(v) => setActiveTab(v as "preview" | "editor")}
      className="shrink-0"
    >
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
  ) : null;

  const saveButton =
    showSave && isEditorMode ? (
      <Button
        onClick={onSave}
        disabled={saving || saveDisabled}
        size="sm"
        className={toolbarBtnClass}
      >
        {saving ? (
          <>
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Saving
          </>
        ) : (
          <>
            <Save className="mr-1 h-3 w-3" />
            Save
          </>
        )}
      </Button>
    ) : null;

  const savedIndicator =
    saved && isEditorMode ? (
      <span className="shrink-0 text-xs text-green-600 dark:text-green-500">
        Saved
      </span>
    ) : null;

  const moreButton = collapseEditorHelpers ? (
    <Button
      type="button"
      onClick={() => setMoreOpen((open) => !open)}
      variant={moreOpen ? "secondary" : "outline"}
      size="sm"
      className={toolbarBtnClass}
      aria-expanded={moreOpen}
      aria-controls="text-editor-helpers-row"
      title="More editor tools"
    >
      More
    </Button>
  ) : null;

  const helperButtons = (
    <>
      <Button
        type="button"
        onClick={() => {
          editorRef.current?.undo();
        }}
        disabled={!canUndo}
        variant="outline"
        size="sm"
        className={toolbarIconBtnClass}
        title="Undo (up to 3 steps)"
        aria-label="undo"
      >
        <Undo2 className="h-3 w-3" />
      </Button>
      <Button
        type="button"
        onClick={() => {
          editorRef.current?.redo();
        }}
        disabled={!canRedo}
        variant="outline"
        size="sm"
        className={toolbarIconBtnClass}
        title="Redo"
        aria-label="redo"
      >
        <Redo2 className="h-3 w-3" />
      </Button>

      {showWhitespaceToggle && (
        <Button
          onClick={() => setShowWhitespace(!showWhitespace)}
          variant={showWhitespace ? "default" : "outline"}
          size="sm"
          className={cn(toolbarBtnClass, "font-mono lowercase")}
          title="Toggle whitespace characters"
        >
          wch
        </Button>
      )}

      <Button
        type="button"
        onClick={() => {
          editorRef.current?.insertTab();
        }}
        variant="outline"
        size="sm"
        className={cn(toolbarBtnClass, "font-mono lowercase")}
        title="Insert tab character"
      >
        tab
      </Button>
    </>
  );

  return (
    <div
      className={cn(
        // Outer column: no border of its own — Row 1 (tabs/save) sits above
        // the bordered card, not inside it (moved out so the tab switcher
        // reads as its own control rather than being fused into the card's
        // top edge — every caller gets this, not just a one-off page).
        "flex h-full min-h-0 flex-col overflow-hidden",
        className,
      )}
    >
      {/* Row 1 — primary actions, ABOVE the frame */}
      <div className="flex shrink-0 flex-wrap items-center gap-1 pb-1">
        {collapseEditorHelpers ? (
          <>
            {saveButton}
            {moreButton}
            {previewEditorTabs}
            {savedIndicator}
            {toolbarExtra}
          </>
        ) : (
          <>
            {previewEditorTabs}
            {saveButton}
            {savedIndicator}
            {toolbarExtra}
          </>
        )}
      </div>

      {/* Collapsible helpers — between primary toolbar and content frame */}
      {showHelpersOutside && (
        <div
          id="text-editor-helpers-row"
          className="flex shrink-0 flex-wrap items-center gap-1 pb-1"
        >
          {helperButtons}
        </div>
      )}

      {/* Bordered frame: optional in-frame helpers (legacy) + content */}
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card">
        {showHelpersInside && (
          <div className="flex shrink-0 flex-wrap items-center gap-1 border-b px-1 py-1">
            {helperButtons}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-hidden">
          {showPreview ? (
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as "preview" | "editor")}
              className="flex h-full flex-col"
            >
              <TabsContent
                value="preview"
                className="m-0 min-h-0 flex-1 overflow-hidden p-0"
              >
                <div className="h-full overflow-auto">
                  <PreviewContent body={value} />
                </div>
              </TabsContent>

              <TabsContent
                value="editor"
                className="m-0 min-h-0 flex-1 overflow-hidden p-0"
              >
                <BodyTextEditor
                  ref={editorRef}
                  value={value}
                  onChange={handleContentChange}
                  placeholder={placeholder}
                  className="h-full"
                  onSaveShortcut={handleSaveShortcut}
                  showWhitespace={showWhitespace}
                  onHistoryChange={handleHistoryChange}
                />
              </TabsContent>
            </Tabs>
          ) : (
            <BodyTextEditor
              ref={editorRef}
              value={value}
              onChange={handleContentChange}
              placeholder={placeholder}
              className="h-full"
              onSaveShortcut={handleSaveShortcut}
              showWhitespace={showWhitespace}
              onHistoryChange={handleHistoryChange}
            />
          )}
        </div>
      </div>
    </div>
  );
}
