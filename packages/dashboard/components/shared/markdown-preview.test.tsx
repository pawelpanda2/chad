// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MarkdownPreview } from "./markdown-preview.js";

afterEach(() => {
  cleanup();
});

describe("MarkdownPreview", () => {
  it("renders headings", () => {
    // JSX bare string attributes don't interpret `\n` — must go through {}.
    render(<MarkdownPreview content={"# Title\n## Subtitle"} />);
    expect(screen.getByText("Title")).not.toBeNull();
    expect(screen.getByText("Subtitle")).not.toBeNull();
    cleanup();
  });

  it("renders unordered and ordered lists", () => {
    render(<MarkdownPreview content={"- one\n- two\n\n1. first\n2. second"} />);
    expect(screen.getByText("one")).not.toBeNull();
    expect(screen.getByText("two")).not.toBeNull();
    expect(screen.getByText("first")).not.toBeNull();
    expect(screen.getByText("second")).not.toBeNull();
    cleanup();
  });

  it("renders bold and italic", () => {
    const { container } = render(<MarkdownPreview content="This is **bold** and this is *italic*." />);
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector("em")?.textContent).toBe("italic");
    cleanup();
  });

  it("renders a safe link with target=_blank and rel", () => {
    render(<MarkdownPreview content="[CHAD](https://example.com)" />);
    const link = screen.getByText("CHAD").closest("a");
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("https://example.com");
    expect(link?.getAttribute("rel")).toContain("noopener");
    cleanup();
  });

  it("does not turn an unsafe href scheme into a clickable link", () => {
    render(<MarkdownPreview content="[click me](javascript:alert(1))" />);
    expect(screen.queryByRole("link")).toBeNull();
    cleanup();
  });

  it("renders a fenced code block verbatim", () => {
    const { container } = render(<MarkdownPreview content={"```\nconst x = 1;\n```"} />);
    expect(container.querySelector("pre code")?.textContent).toBe("const x = 1;");
    cleanup();
  });

  it("renders inline code", () => {
    const { container } = render(<MarkdownPreview content="Use `npm install` first." />);
    expect(container.querySelector("code")?.textContent).toBe("npm install");
    cleanup();
  });

  it("shows an empty-content placeholder instead of crashing", () => {
    render(<MarkdownPreview content="" />);
    expect(screen.getByText("Empty content")).not.toBeNull();
    cleanup();
  });
});
