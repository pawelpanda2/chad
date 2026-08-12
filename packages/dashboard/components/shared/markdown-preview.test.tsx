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

  it("renders combined bold+italic (***text***) as one nested strong>em, no leftover marker", () => {
    const { container } = render(<MarkdownPreview content="This is ***very*** important." />);
    const strong = container.querySelector("strong");
    expect(strong?.querySelector("em")?.textContent).toBe("very");
    // No stray literal "*" left over from a partially-matched triple marker.
    expect(container.textContent).not.toContain("*");
  });

  it("renders strikethrough", () => {
    const { container } = render(<MarkdownPreview content="~~gone~~" />);
    expect(container.querySelector("del")?.textContent).toBe("gone");
  });

  it("renders an autolink (<https://...>) as a clickable link", () => {
    render(<MarkdownPreview content="See <https://example.com> for details." />);
    const link = screen.getByText("https://example.com").closest("a");
    expect(link?.getAttribute("href")).toBe("https://example.com");
  });

  it("renders a horizontal rule as <hr>, not literal dashes", () => {
    const { container } = render(<MarkdownPreview content={"above\n\n---\n\nbelow"} />);
    expect(container.querySelector("hr")).not.toBeNull();
    expect(screen.queryByText("---")).toBeNull();
  });

  it("renders a blockquote as <blockquote>, not a squashed paragraph", () => {
    const { container } = render(
      <MarkdownPreview content={"> first line\n>\n> second line with **bold**"} />,
    );
    const quote = container.querySelector("blockquote");
    expect(quote).not.toBeNull();
    expect(quote?.textContent).toContain("first line");
    expect(quote?.textContent).toContain("second line with");
    expect(quote?.querySelector("strong")?.textContent).toBe("bold");
  });

  it("renders a GitHub-style task list with checked/unchecked checkboxes", () => {
    const { container } = render(<MarkdownPreview content={"- [x] done\n- [ ] not done"} />);
    const boxes = container.querySelectorAll('input[type="checkbox"]');
    expect(boxes).toHaveLength(2);
    expect((boxes[0] as HTMLInputElement).checked).toBe(true);
    expect((boxes[1] as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText("done")).not.toBeNull();
    expect(screen.getByText("not done")).not.toBeNull();
  });
});
