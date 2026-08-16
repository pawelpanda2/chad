"use client";

import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import { useTheme } from "next-themes";
import {
  history,
  historyKeymap,
  redo,
  redoDepth,
  undo,
  undoDepth,
} from "@codemirror/commands";
import { Extension, Prec } from "@codemirror/state";
import CodeMirror from "@uiw/react-codemirror";
import {
  EditorView,
  keymap,
  highlightWhitespace,
} from "@codemirror/view";
import { cn } from "@/lib/utils";
import { applyMultiLineTab, applyMultiLineShiftTab } from "@/lib/multi-line-tab";

/** Max undo steps kept in the editor history (and redo after undo). */
export const EDITOR_HISTORY_DEPTH = 3;

interface BodyTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  extraExtensions?: Extension[];
  /** Callback for Ctrl+S / Cmd+S keyboard shortcut */
  onSaveShortcut?: (event: KeyboardEvent) => void;
  /** Whether to show whitespace characters (spaces, tabs) */
  showWhitespace?: boolean;
  /** Fired when undo/redo availability changes (for toolbar buttons). */
  onHistoryChange?: (state: { canUndo: boolean; canRedo: boolean }) => void;
}

/** Imperative API for toolbar actions (tab / undo / redo on phones). */
export type BodyTextEditorHandle = {
  /** Insert `\t` at the current selection and refocus the editor. */
  insertTab: () => boolean;
  /** Undo last edit (up to EDITOR_HISTORY_DEPTH steps). */
  undo: () => boolean;
  /** Redo previously undone edit. */
  redo: () => boolean;
};

/**
 * Tab at the main selection — a single caret inserts a literal `\t` (same
 * as before); a real (multi- or single-line) selection instead prepends
 * `\t` to the start of every touched line, per `applyMultiLineTab` (Story
 * 121 — the previous implementation always replaced the whole selection
 * with one `\t`, destroying multi-line selections instead of indenting
 * them). Used by the keyboard keymap and by the shared toolbar tab button
 * (phones have no Tab key).
 */
export function insertTabInView(view: EditorView): boolean {
  const selection = view.state.selection.main;
  const docText = view.state.doc.toString();
  const { nextValue, nextSelectionStart, nextSelectionEnd } = applyMultiLineTab(
    docText,
    selection.from,
    selection.to,
  );

  view.dispatch(
    view.state.update({
      changes: { from: 0, to: docText.length, insert: nextValue },
      selection: { anchor: nextSelectionStart, head: nextSelectionEnd },
      scrollIntoView: true,
    }),
  );
  view.focus();
  return true;
}

/**
 * Shift+Tab at the main selection — removes at most one leading `\t` from
 * every touched line (see `applyMultiLineShiftTab`). Never touches leading
 * spaces, never touches lines with no leading `\t`.
 */
export function removeTabInView(view: EditorView): boolean {
  const selection = view.state.selection.main;
  const docText = view.state.doc.toString();
  const { nextValue, nextSelectionStart, nextSelectionEnd } = applyMultiLineShiftTab(
    docText,
    selection.from,
    selection.to,
  );

  view.dispatch(
    view.state.update({
      changes: { from: 0, to: docText.length, insert: nextValue },
      selection: { anchor: nextSelectionStart, head: nextSelectionEnd },
      scrollIntoView: true,
    }),
  );
  view.focus();
  return true;
}

function historyStateOf(view: EditorView): { canUndo: boolean; canRedo: boolean } {
  return {
    canUndo: undoDepth(view.state) > 0,
    canRedo: redoDepth(view.state) > 0,
  };
}

/**
 * Creates an extension that handles the Tab key to insert a tab character (\t)
 * instead of the default behavior (which may insert spaces or move focus).
 *
 * This ensures consistency with auto-generated content that uses \t for indentation.
 */
function tabKeyExtension(): Extension {
  return Prec.highest(
    keymap.of([
      {
        key: "Tab",
        run: (view) => insertTabInView(view),
      },
      {
        key: "Shift-Tab",
        run: (view) => removeTabInView(view),
      },
    ]),
  );
}

/**
 * Creates an extension that handles Enter to preserve the current line's
 * leading whitespace exactly as typed, including real tab characters.
 */
function enterKeyExtension(): Extension {
  return Prec.highest(
    keymap.of([
      {
        key: "Enter",
        run: ({ state, dispatch }) => {
          const selection = state.selection.main;
          const from = selection.from;
          const to = selection.to;
          const currentLine = state.doc.lineAt(from).text;
          const currentLinePrefix = currentLine.match(/^[\t ]*/)?.[0] ?? "";
          const insertedText = `\n${currentLinePrefix}`;
          const nextCursorPos = from + insertedText.length;

          if (process.env.NODE_ENV !== "production") {
            console.debug(
              "[BodyTextEditor] Enter prefix:",
              debugWhitespace(currentLinePrefix),
            );
          }

          dispatch(
            state.update({
              changes: {
                from,
                to,
                insert: insertedText,
              },
              selection: { anchor: nextCursorPos },
              scrollIntoView: true,
            }),
          );
          return true;
        },
      },
    ]),
  );
}

export function debugWhitespace(text: string): string {
  return text
    .replace(/\t/g, "\\t")
    .replace(/ /g, "·")
    .replace(/\n/g, "\\n");
}

export const BodyTextEditor = forwardRef<BodyTextEditorHandle, BodyTextEditorProps>(
  function BodyTextEditor(
    {
      value,
      onChange,
      placeholder,
      className,
      extraExtensions = [],
      onSaveShortcut,
      showWhitespace = false,
      onHistoryChange,
    },
    ref,
  ) {
    // Follow the app theme so text stays readable in dark mode (otherwise the
    // default light CodeMirror theme keeps a white background).
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";
    const viewRef = useRef<EditorView | null>(null);
    const onHistoryChangeRef = useRef(onHistoryChange);
    onHistoryChangeRef.current = onHistoryChange;

    const emitHistory = useCallback((view: EditorView) => {
      onHistoryChangeRef.current?.(historyStateOf(view));
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        insertTab: () => {
          const view = viewRef.current;
          if (!view) return false;
          const ok = insertTabInView(view);
          emitHistory(view);
          return ok;
        },
        undo: () => {
          const view = viewRef.current;
          if (!view) return false;
          const ok = undo(view);
          if (ok) {
            view.focus();
            emitHistory(view);
          }
          return ok;
        },
        redo: () => {
          const view = viewRef.current;
          if (!view) return false;
          const ok = redo(view);
          if (ok) {
            view.focus();
            emitHistory(view);
          }
          return ok;
        },
      }),
      [emitHistory],
    );

    const containerRef = useCallback(
      (node: HTMLDivElement | null) => {
        if (!node || !onSaveShortcut) return;

        const handleKeyDown = (event: KeyboardEvent) => {
          const isSaveShortcut =
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === "s";

          if (isSaveShortcut) {
            event.preventDefault();
            onSaveShortcut(event);
          }
        };

        node.addEventListener("keydown", handleKeyDown);

        return () => {
          node.removeEventListener("keydown", handleKeyDown);
        };
      },
      [onSaveShortcut],
    );

    return (
      <div
        ref={containerRef}
        className={cn("flex h-full min-h-0 flex-col overflow-hidden", className)}
      >
        <CodeMirror
          value={value}
          height="100%"
          theme={isDark ? "dark" : "light"}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLineGutter: false,
            highlightActiveLine: false,
            highlightSelectionMatches: false,
            foldGutter: false,
            autocompletion: false,
            closeBrackets: false,
            indentOnInput: false,
            searchKeymap: false,
            allowMultipleSelections: false,
            // Own history with depth 3 — see history({ minDepth }) below.
            history: false,
            // Story 121 — the selection-gap bug: CodeMirror's synthetic
            // drawSelection() overlay computes each line's highlighted
            // selection-background rectangle in JS from character
            // coordinates; measured live, a line whose selection starts
            // with a leading `\t` gets a rectangle ~6px too far left —
            // spilling past .cm-content's own left padding — while a line
            // starting on a plain character aligns correctly. That fixed,
            // tab-triggered offset (same regardless of tab count) is
            // exactly the jagged left edge between the gutter and the
            // highlighted text on tab-indented lines. Turning this overlay
            // off falls back to the browser's own native text-selection
            // painting, which is computed by the same layout engine that
            // renders the tab in the first place, so it can't drift from
            // it — no layout/gutter-width change either way.
            drawSelection: false,
          }}
          extensions={[
            history({ minDepth: EDITOR_HISTORY_DEPTH }),
            keymap.of(historyKeymap),
            EditorView.lineWrapping,
            tabKeyExtension(),
            enterKeyExtension(),
            ...(showWhitespace ? [highlightWhitespace()] : []),
            EditorView.updateListener.of((update) => {
              if (
                update.docChanged ||
                update.transactions.some((tr) => tr.isUserEvent("undo") || tr.isUserEvent("redo"))
              ) {
                onHistoryChangeRef.current?.(historyStateOf(update.view));
              }
            }),
            EditorView.theme({
              "&": {
                height: "100%",
              },
              "&.cm-editor": {
                height: "100%",
              },
              ".cm-content": {
                padding: "4px 12px",
                tabSize: "4",
                fontFamily: "var(--font-mono, monospace)",
                whiteSpace: "pre-wrap",
              },
              ".cm-line": {
                tabSize: "4",
              },
              ".cm-scroller": {
                height: "100%",
                overflowY: "auto",
                overflowX: "hidden",
              },
              // Line-number gutter (left of each line): keep it subtle.
              ".cm-gutters": {
                border: "none",
                backgroundColor: "transparent",
              },
            }),
            ...extraExtensions,
          ]}
          onCreateEditor={(view) => {
            viewRef.current = view;
            emitHistory(view);
          }}
          onChange={onChange}
          className="h-full min-h-0 flex-1"
          placeholder={placeholder}
        />
      </div>
    );
  },
);
