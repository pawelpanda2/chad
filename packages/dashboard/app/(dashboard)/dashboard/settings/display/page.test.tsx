// @vitest-environment jsdom
/**
 * Story 116 — Settings -> Display must render the real Theme mechanism
 * (ThemeModeSelector, backed by next-themes) and must NOT contain the old
 * dummy "Dark Mode"/"System Theme" switches (unconnected to next-themes,
 * present before this Story).
 */
import { describe, expect, it, afterEach, beforeAll } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@/components/theme-provider";
import DisplayPage from "./page.js";

// jsdom has no matchMedia implementation; next-themes calls it to resolve
// the "system" theme. A minimal stub is enough for these tests, which don't
// assert on the resolved (light vs dark) system value.
beforeAll(() => {
  window.matchMedia =
    window.matchMedia ||
    ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList);
});

afterEach(cleanup);

function renderWithTheme() {
  return render(
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <DisplayPage />
    </ThemeProvider>,
  );
}

describe("Settings -> Display", () => {
  it("renders the real Light/Dark/System theme selector", () => {
    renderWithTheme();
    expect(screen.getByRole("button", { name: /light/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /dark/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /system/i })).toBeTruthy();
  });

  it("does not render the old dummy Dark Mode / System Theme switches", () => {
    renderWithTheme();
    expect(screen.queryByText("Dark Mode")).toBeNull();
    expect(screen.queryByText(/Switch between light and dark themes/i)).toBeNull();
    expect(screen.queryByText(/Automatically match your system/i)).toBeNull();
  });
});
