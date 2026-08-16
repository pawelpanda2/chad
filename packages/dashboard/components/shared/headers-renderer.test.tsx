// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { HeadersRenderer } from "./headers-renderer.js";

afterEach(() => {
  cleanup();
});

describe("HeadersRenderer (hdr2) — CP-link headers (Story 121)", () => {
  const VALID_UUID = "ca38d1cb-eb58-42f6-b202-21223b18911b";

  it("[uuid] + top-level header: hides the marker, renders the header as a new-tab link", () => {
    const content = [`[${VALID_UUID}]`, "//braki wiedzy"].join("\n");
    render(<HeadersRenderer content={content} />);

    expect(screen.queryByText(`[${VALID_UUID}]`)).toBeNull();

    const link = screen.getByText("braki wiedzy").closest("a");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe(`/dashboard/item-view/by-id/${VALID_UUID}`);
    expect(link!.getAttribute("target")).toBe("_blank");
  });

  it("[uuid] + nested section header: same linking behavior", () => {
    const content = ["//top", `\t[${VALID_UUID}]`, "\t//braki wiedzy"].join("\n");
    render(<HeadersRenderer content={content} />);

    const link = screen.getByText("braki wiedzy").closest("a");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe(`/dashboard/item-view/by-id/${VALID_UUID}`);
  });

  it("existing note-link regression: [uuid] + note still links the note", () => {
    const content = ["//top", `\t[${VALID_UUID}]`, "\t- kakao ceremonialne"].join("\n");
    render(<HeadersRenderer content={content} />);

    const link = screen.getByText("kakao ceremonialne").closest("a");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe(`/dashboard/item-view/by-id/${VALID_UUID}`);
  });

  it("invalid UUID + header: stays plain text, no link", () => {
    const content = ["//top", "\t[not-a-real-uuid]", "\t//header"].join("\n");
    render(<HeadersRenderer content={content} />);

    expect(screen.getByText("[not-a-real-uuid]")).not.toBeNull();
    expect(screen.getByText("header").closest("a")).toBeNull();
  });
});
