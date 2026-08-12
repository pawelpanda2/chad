// @vitest-environment jsdom
/**
 * Regression coverage for the shared Preview format selector (1.2/1.3/1.10):
 * combobox is present next to Editor, auto-detection picks a sensible
 * default, "no format" echoes the editor's raw text 1:1, and the user can
 * always override the auto-detected choice.
 *
 * BodyTextEditor is mocked (CodeMirror/jsdom friction, unrelated to this
 * feature) but PreviewContent/Hdr1Renderer/MarkdownPreview are real — this
 * is the one place that exercises the actual wiring end-to-end, since
 * text-editor-with-toolbar.test.tsx mocks PreviewContent out entirely.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TextEditorWithToolbar } from "./text-editor-with-toolbar.js";

vi.mock("./body-text-editor.js", () => ({
  BodyTextEditor: ({ value }: { value: string }) => (
    <textarea readOnly value={value} data-testid="body-editor" />
  ),
}));

// jsdom doesn't implement these — Radix's Select uses them for its
// pointer-driven open/select interactions, which otherwise throw.
beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

afterEach(() => {
  cleanup();
});

function noop() {}

describe("TextEditorWithToolbar — Preview format selector", () => {
  it("shows a format combobox next to Preview|Editor, defaulting to hdr1 for headers-format content", () => {
    render(
      <TextEditorWithToolbar
        value={"//short\n- braki wiedzy\n- historie"}
        onChange={noop}
        onSave={noop}
        saving={false}
        saved={false}
      />,
    );

    expect(screen.getByText("Preview")).not.toBeNull();
    expect(screen.getByText("Editor")).not.toBeNull();
    const combobox = screen.getByLabelText("Preview format");
    expect(combobox).not.toBeNull();
    expect(combobox.textContent).toBe("hdr1");
    // hdr1 rendering of the sample content — grouped header + note lines.
    expect(screen.getByText("short")).not.toBeNull();
    expect(screen.getByText("braki wiedzy")).not.toBeNull();

    cleanup();
  });

  it("defaults to no-format for plain prose and echoes it verbatim", () => {
    render(
      <TextEditorWithToolbar
        value={"Just a plain note, no markers."}
        onChange={noop}
        onSave={noop}
        saving={false}
        saved={false}
      />,
    );

    expect(screen.getByLabelText("Preview format").textContent).toBe("no format");
    expect(screen.getByText("Just a plain note, no markers.")).not.toBeNull();

    cleanup();
  });

  it("lets the user override the auto-detected format manually", async () => {
    const user = userEvent.setup();
    render(
      <TextEditorWithToolbar
        value={"//short\n- braki wiedzy"}
        onChange={noop}
        onSave={noop}
        saving={false}
        saved={false}
      />,
    );

    // Auto-detected as hdr1.
    expect(screen.getByLabelText("Preview format").textContent).toBe("hdr1");

    await user.click(screen.getByLabelText("Preview format"));
    await user.click(await screen.findByRole("option", { name: "no format" }));

    expect(screen.getByLabelText("Preview format").textContent).toBe("no format");
    // Raw text now shown verbatim, including the "//" marker untouched.
    expect(screen.getByText("//short", { exact: false })).not.toBeNull();

    cleanup();
  });

  it("hides the format combobox entirely when showPreview is false", () => {
    render(
      <TextEditorWithToolbar
        value="hello"
        onChange={noop}
        onSave={noop}
        saving={false}
        saved={false}
        showPreview={false}
      />,
    );

    expect(screen.queryByLabelText("Preview format")).toBeNull();
    cleanup();
  });
});
