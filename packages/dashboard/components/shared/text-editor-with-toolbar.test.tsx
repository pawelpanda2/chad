// @vitest-environment jsdom
/**
 * Regression test for Story 98 — Folders lost its Save button because
 * `isEditorMode` (which gates Save/WCH/Saved) was derived purely from
 * `activeTab === "editor"`, which defaults to "preview" unless a caller also
 * remembers to pass `defaultTab="editor"`. Since `showPreview={false}` means
 * the editor is the ONLY view the component can ever show (see the content
 * area's own unconditional `BodyTextEditor` render when `showPreview` is
 * false), the fix makes `isEditorMode` unconditionally true in that case —
 * this test locks that in at the component level, not via any caller-side
 * `defaultTab` workaround.
 *
 * `BodyTextEditor`/`PreviewContent` are mocked out: CodeMirror and the
 * headers renderer are unrelated to the bug (the toolbar's own gating
 * logic), and mocking keeps this test fast and independent of CodeMirror's
 * jsdom compatibility. Assertions use plain DOM/vitest matchers only (no
 * `@testing-library/jest-dom`) to avoid that library's global-`expect`
 * auto-extend, which this repo's Vitest config does not enable.
 */
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TextEditorWithToolbar } from "./text-editor-with-toolbar.js";

vi.mock("./body-text-editor.js", () => ({
  BodyTextEditor: ({ value }: { value: string }) => <textarea readOnly value={value} data-testid="body-editor" />,
}));

vi.mock("./headers-renderer.js", () => ({
  PreviewContent: ({ body }: { body: string }) => <div data-testid="preview-content">{body}</div>,
}));

function noop() {}

describe("TextEditorWithToolbar — showPreview={false} Save regression", () => {
  it("renders Save (and it fires onSave) with no Preview tab at all", () => {
    const onSave = vi.fn();
    render(
      <TextEditorWithToolbar
        value="hello"
        onChange={noop}
        onSave={onSave}
        saving={false}
        saved={false}
        showPreview={false}
        showSave={true}
      />
    );

    // No Preview/Editor tab switcher — showPreview={false} has only one view.
    expect(screen.queryByText("Preview")).toBeNull();
    expect(screen.queryByText("Editor")).toBeNull();

    const saveButton = screen.getByRole("button", { name: /save/i });
    expect(saveButton).not.toBeNull();

    fireEvent.click(saveButton);
    expect(onSave).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it("still shows WCH and Saved in showPreview={false} mode", () => {
    render(
      <TextEditorWithToolbar
        value="hello"
        onChange={noop}
        onSave={noop}
        saving={false}
        saved={true}
        showPreview={false}
        showSave={true}
        showWhitespaceToggle={true}
      />
    );

    expect(screen.getByText("WCH")).not.toBeNull();
    expect(screen.getByText("Saved")).not.toBeNull();
    cleanup();
  });

  it("still hides Save when showSave={false}, even with showPreview={false}", () => {
    render(
      <TextEditorWithToolbar
        value="hello"
        onChange={noop}
        onSave={noop}
        saving={false}
        saved={false}
        showPreview={false}
        showSave={false}
      />
    );

    expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
    cleanup();
  });

  it("keeps existing showPreview={true} behavior: Save hidden on Preview tab, shown after switching to Editor", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <TextEditorWithToolbar
        value="hello"
        onChange={noop}
        onSave={onSave}
        saving={false}
        saved={false}
        showSave={true}
      />
    );

    // Defaults to the Preview tab — Save must not be visible yet.
    expect(screen.queryByRole("button", { name: /save/i })).toBeNull();

    // Radix Tabs activates on focus (roving tabindex), so this needs a real
    // user-event click (which simulates the browser's focus-on-click
    // default action), not a bare synthetic `fireEvent.click`.
    await user.click(screen.getByText("Editor"));
    const saveButton = screen.getByRole("button", { name: /save/i });
    expect(saveButton).not.toBeNull();
    fireEvent.click(saveButton);
    expect(onSave).toHaveBeenCalledTimes(1);

    cleanup();
  });
});
