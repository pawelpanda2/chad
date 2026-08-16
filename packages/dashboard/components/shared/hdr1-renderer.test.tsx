// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Hdr1Renderer } from "./hdr1-renderer.js";

afterEach(() => {
  cleanup();
});

// Same shape as the story's worked example (1.6): two top-level headers
// ("short", "details"), "details" has two level-1 children ("braki
// wiedzy", "historie") each with their own note lines. Note lines under
// "short" use distinct text from the "details" child headings on purpose —
// the real-world example reuses "braki wiedzy"/"historie" in both places,
// which is exercised separately below (duplicate-text case).
const SAMPLE = [
  "//short",
  "- overview note one",
  "- overview note two",
  "",
  "//details",
  "\t//braki wiedzy",
  "\t- kakao ceremonialne",
  "\t- zajazd czorsztyński",
  "\t//historie",
  "\t- sauna",
].join("\n");

describe("Hdr1Renderer", () => {
  it("renders top-level headers and numbered (01/02) children as plain text, not badges", () => {
    render(<Hdr1Renderer content={SAMPLE} />);

    expect(screen.getByText("short")).not.toBeNull();
    expect(screen.getByText("details")).not.toBeNull();
    expect(screen.getByText("01")).not.toBeNull();
    expect(screen.getByText("02")).not.toBeNull();
    expect(screen.getByText("braki wiedzy")).not.toBeNull();
    expect(screen.getByText("historie")).not.toBeNull();
    expect(screen.getByText("kakao ceremonialne")).not.toBeNull();
    expect(screen.getByText("sauna")).not.toBeNull();

    cleanup();
  });

  it("collapses/expands a top-level section independently from its children", async () => {
    const user = userEvent.setup();
    render(<Hdr1Renderer content={SAMPLE} />);

    // Collapse "details" — its whole body (children + their content) disappears.
    await user.click(screen.getByText("details"));
    expect(screen.queryByText("kakao ceremonialne")).toBeNull();
    expect(screen.queryByText("braki wiedzy")).toBeNull();
    // "short" section is untouched by collapsing "details".
    expect(screen.getByText("overview note one")).not.toBeNull();

    // Expand it back.
    await user.click(screen.getByText("details"));
    expect(screen.getByText("kakao ceremonialne")).not.toBeNull();

    cleanup();
  });

  it("collapses a single child section without affecting its sibling", async () => {
    const user = userEvent.setup();
    render(<Hdr1Renderer content={SAMPLE} />);

    await user.click(screen.getByText("01").closest("button")!);
    expect(screen.queryByText("kakao ceremonialne")).toBeNull();
    expect(screen.getByText("sauna")).not.toBeNull(); // sibling "02 historie" still expanded

    cleanup();
  });

  it("renders an empty-content placeholder instead of crashing", () => {
    render(<Hdr1Renderer content="" />);
    expect(screen.getByText("Empty content")).not.toBeNull();
    cleanup();
  });
});

describe("Hdr1Renderer — CP-link headers (Story 121)", () => {
  const VALID_UUID = "ca38d1cb-eb58-42f6-b202-21223b18911b";

  it("[uuid] + header: hides the marker, renders the header as a link to the item, marker not visible", () => {
    const content = [`[${VALID_UUID}]`, "//braki wiedzy"].join("\n");
    render(<Hdr1Renderer content={content} />);

    expect(screen.queryByText(VALID_UUID)).toBeNull();
    expect(screen.queryByText(`[${VALID_UUID}]`)).toBeNull();

    const link = screen.getByText("braki wiedzy").closest("a");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe(`/dashboard/item-view/by-id/${VALID_UUID}`);
    expect(link!.getAttribute("target")).toBe("_blank");
    expect(link!.getAttribute("rel")).toContain("noopener");

    cleanup();
  });

  it("[uuid] + indented header (tab), nested under a top-level group: same linking behavior", () => {
    const content = ["//top", `\t[${VALID_UUID}]`, "\t//braki wiedzy"].join("\n");
    render(<Hdr1Renderer content={content} />);

    const link = screen.getByText("braki wiedzy").closest("a");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe(`/dashboard/item-view/by-id/${VALID_UUID}`);

    cleanup();
  });

  it("[uuid] + header: clicking near the chevron still collapses/expands, without navigating", async () => {
    const user = userEvent.setup();
    const content = ["//details", `\t[${VALID_UUID}]`, "\t//braki wiedzy", "\t- kakao ceremonialne"].join("\n");
    render(<Hdr1Renderer content={content} />);

    expect(screen.getByText("kakao ceremonialne")).not.toBeNull();

    // toggle zone = chevron + ordinal button, distinct from the link itself
    const link = screen.getByText("braki wiedzy").closest("a")!;
    const toggleButton = link.previousElementSibling as HTMLElement;
    expect(toggleButton.tagName).toBe("BUTTON");

    await user.click(toggleButton);
    expect(screen.queryByText("kakao ceremonialne")).toBeNull();

    await user.click(toggleButton);
    expect(screen.getByText("kakao ceremonialne")).not.toBeNull();

    cleanup();
  });

  it("invalid UUID + header: stays plain text, marker preserved, no link", () => {
    const content = ["//top", "\t[not-a-real-uuid]", "\t//header"].join("\n");
    render(<Hdr1Renderer content={content} />);

    expect(screen.getByText("[not-a-real-uuid]")).not.toBeNull();
    expect(screen.getByText("header").closest("a")).toBeNull();

    cleanup();
  });

  it("valid UUID + plain text (not note/header): marker preserved as plain text", () => {
    const content = ["//top", `\t[${VALID_UUID}]`, "\tplain text"].join("\n");
    render(<Hdr1Renderer content={content} />);

    expect(screen.getByText(`[${VALID_UUID}]`)).not.toBeNull();
    expect(screen.getByText("plain text")).not.toBeNull();

    cleanup();
  });

  it("existing note-link regression: [uuid] + note still links the note (unaffected by header support)", () => {
    const content = ["//details", `\t[${VALID_UUID}]`, "\t- kakao ceremonialne"].join("\n");
    render(<Hdr1Renderer content={content} />);

    const link = screen.getByText("kakao ceremonialne").closest("a");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe(`/dashboard/item-view/by-id/${VALID_UUID}`);
    expect(link!.getAttribute("target")).toBe("_blank");

    cleanup();
  });
});
