"use client";

import { useCallback } from "react";
import { Extension, Prec } from "@codemirror/state";
import CodeMirror from "@uiw/react-codemirror";
import {
  EditorView,
  keymap,
  highlightWhitespace,
} from "@codemirror/view";
import { cn } from "@/lib/utils";

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
      run: ({ state, dispatch }) => {
        const selection = state.selection.main;
        const from = selection.from;
        const to = selection.to;
        const nextCursorPos = from + 1;

        dispatch(state.update({
          changes: { from, to, insert: "\t" },
          selection: { anchor: nextCursorPos },
          scrollIntoView: true,
        }));
        return true; // Prevent default behavior
      },
    },
  ])
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
          console.debug("[BodyTextEditor] Enter prefix:", debugWhitespace(currentLinePrefix));
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
          })
        );
        return true;
      },
    },
  ])
  );
}

export function debugWhitespace(text: string): string {
  return text
    .replace(/\t/g, "\\t")
    .replace(/ /g, "·")
    .replace(/\n/g, "\\n");
}

export function BodyTextEditor({
  value,
  onChange,
  placeholder,
  className,
  extraExtensions = [],
  onSaveShortcut,
  showWhitespace = false,
}: BodyTextEditorProps) {
  const containerRef = useCallback((node: HTMLDivElement | null) => {
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
  }, [onSaveShortcut]);

  return (
    <div ref={containerRef} className={cn("flex h-full min-h-0 flex-col overflow-hidden", className)}>
      <CodeMirror
        value={value}
        height="100%"
        basicSetup={{
          lineNumbers: false,
          highlightActiveLineGutter: false,
          highlightActiveLine: false,
          highlightSelectionMatches: false,
          foldGutter: false,
          autocompletion: false,
          closeBrackets: false,
          indentOnInput: false,
          searchKeymap: false,
          allowMultipleSelections: false,
        }}
        extensions={[
          EditorView.lineWrapping,
          tabKeyExtension(), // Ensure Tab inserts \t character
          enterKeyExtension(),
          ...(showWhitespace ? [highlightWhitespace()] : []),
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
            ".cm-gutter": {
              display: "none",
            },
          }),
          ...extraExtensions,
        ]}
        onChange={onChange}
        className="h-full min-h-0 flex-1"
        placeholder={placeholder}
      />
    </div>
  );
}